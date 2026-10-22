const model=require('./model');
const ocr=require('./ocr');
const sourceInput=require('./source-input');
const recipeData=require('./recipe-data');
const {assessRecipe}=require('./extraction');
const publicRecipe=require('./public-recipe');
function draftOf(result,source){
  const draft=recipeData.numbers({name:String(result.name||'').trim(),emoji:result.emoji||'🍳',source:'外部原文识别',sourceUrl:source.sourceUrl,servings:result.servings,cost:result.cost,prepMinutes:result.prepMinutes,ingredients:recipeData.lines(result.ingredients),steps:recipeData.lines(result.steps),notes:String(result.notes||''),tags:Array.isArray(result.tags)?result.tags:[],uncertain:Array.isArray(result.uncertain)?result.uncertain:[]});
  return {...draft,category:recipeData.classify(draft)};
}
async function prepare(settings,key,text,images=[],progress=()=>{},context={}){
  const source=sourceInput.parse(text);
  const withoutUrls=source.text.replace(/https?:\/\/\S+/g,''),explicitBody=sourceInput.detailed(withoutUrls)&&(/(?:^|\n)\s*(?:[1-9]\d*[.、]|食材[：:]|配料[：:]|做法[：:]|步骤[：:])/.test(withoutUrls)||publicRecipe.completeText(withoutUrls));
  if(images.length||(!source.urls.length&&sourceInput.detailed(text))||explicitBody){
    progress('正在忠实识别提供的菜谱原文…');
    const evidence=await ocr.read(settings,key,{...context,shareText:source.shareText,referenceText:source.referenceText,purpose:'外部菜谱原文'},images,(i,n)=>progress('正在识别截图 '+i+'/'+n));
    return {source,evidence:{...evidence,sourceKind:images.length?'截图/粘贴原文':'粘贴原文'}};
  }
  if(!source.urls.length){const error=Error('请粘贴分享链接、完整菜谱正文，或添加截图。');error.needsEvidence=true;throw error;}
  try{
    const page=await publicRecipe.read(source.sourceUrl,progress),rawText=[page.title,page.body].filter(Boolean).join('\n');
    if(page.completeText&&!page.images.length)return {source,evidence:{rawText,pages:[],uncertain:[],sourceKind:page.kind,sourceUrl:page.url,requestedUrl:page.requestedUrl,observedIngredientCount:0,observedStepCount:0}};
    progress('已读到笔记公开图片，正在合并正文与图片原文…');
    const evidence=await ocr.read(settings,key,{...context,referenceText:rawText,purpose:'分享链接中的公开菜谱图片；仅抄录可见内容'},page.images,(i,n)=>progress('正在识别公开笔记图片 '+i+'/'+n));
    // Keep the real page text even when an OCR provider returns only the image transcription.
    const imageText=String(evidence.rawText||'');
    const combined=imageText.includes(rawText)?imageText:[rawText,imageText].filter(Boolean).join('\n\n');
    return {source,evidence:{...evidence,rawText:combined,sourceKind:'公开笔记图片原文',sourceUrl:page.url,requestedUrl:page.requestedUrl}};
  }catch(error){error.needsEvidence=true;throw error;}
}
async function read(settings,key,text,images=[],progress=()=>{}){
  const {source,evidence}=await prepare(settings,key,text,images,progress);
  if(!String(evidence.rawText||'').trim())throw Error('没有识别到菜谱原文，原餐次未改动');
  progress('正在按原文整理菜名、用料和步骤…');
  let draft=draftOf(await model.call(settings,key,'recipe',{ocrRawText:evidence.rawText,ocrUncertain:evidence.uncertain||[],observedIngredientCount:evidence.observedIngredientCount||0,observedStepCount:evidence.observedStepCount||0,sourceUrl:source.sourceUrl}),source);
  let quality=assessRecipe(evidence,draft),repairUsed=false;
  if(!quality.canSave||quality.score<90){progress('正在按原文补提遗漏内容…');draft=draftOf(await model.call(settings,key,'recipeRepair',{ocrRawText:evidence.rawText,ocrUncertain:evidence.uncertain||[],draft,problems:quality.reasons,missingQuantities:quality.missingQuantities}),source);quality=assessRecipe(evidence,draft);repairUsed=true;}
  const result={draft,ocrResult:evidence,quality,repairUsed};
  if(!quality.canSave){const error=Error('已识别菜谱，但有明显缺项；原餐次未覆盖，请先核对识别草稿。');error.needsEvidence=true;error.sourceDraft=result;throw error;}
  return result;
}
module.exports={read,draftOf,prepare};
