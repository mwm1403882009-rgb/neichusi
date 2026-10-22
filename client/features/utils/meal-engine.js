const store=require('./store');
const model=require('./model');
const dates=require('./date');
const planning=require('./planning');
const inventory=require('./inventory');
const recipeData=require('./recipe-data');
const sourceInput=require('./source-input');
const policy=require('./menu-policy');
const ocr=require('./ocr');
const sourceRecipe=require('./source-recipe');
function requestKind(text){
  const bulk=/(一周|剩余|备餐|预制|工作日|周末.*(?:午|晚)|(?:本周|这周|下周|下星期)(?![一二三四五六日天]))/.test(text);
  return !bulk&&/(今晚|明晚|午餐|晚餐|午饭|晚饭|中午|晚上|(?:周|星期)[一二三四五六日天].*(?:吃|做))/.test(text)?'single':'week';
}
function isMealRequest(text){return /(今天|今晚|明天|明晚|后天|(?:周|星期)[一二三四五六日天]|\d{4}[-/]\d{1,2}[-/]\d{1,2})/.test(text)&&/(中午|午餐|午饭|晚餐|晚饭|晚上|今晚|明晚)/.test(text);}
function target(text,selectedWeek){
  const today=dates.today(),explicit=String(text).match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/),week=selectedWeek||dates.mondayOf(today);
  let date=explicit?require('./stock').normalizeDate(explicit[0]):/后天/.test(text)?dates.addDays(today,2):/明天|明晚|明早/.test(text)?dates.addDays(today,1):today;
  const weekday=String(text).match(/(?:周|星期)([一二三四五六日天])/);
  if(weekday){const index='一二三四五六日'.indexOf(weekday[1]==='天'?'日':weekday[1]);date=dates.addDays(/下周|下星期/.test(text)?dates.addDays(dates.mondayOf(today),7):week,index);}
  const mealSlot=/今晚|明晚|晚饭|晚餐|晚上/.test(text)?'晚餐':/午餐|午饭|中午/.test(text)?'午餐':new Date().getHours()<14?'午餐':'晚餐';
  return {date,mealSlot,weekStart:dates.mondayOf(date)};
}
function namedRecipe(text,recipe){
  if(!recipe.name)return false;const name=String(recipe.name).trim(),request=String(text).trim();if(request===name)return true;
  const escaped=name.replace(/[.*+?^\u0024{}()|[\]\\]/g,'\\function historyFor(data,meal){');
  return new RegExp('(?:想吃|要吃|吃|做)(?:我收藏的|菜谱里的|一份|一道)?[：:\\s]*'+escaped+'(?=$|[\\s，。；！!?？])').test(request);
}
function historyFor(data,meal){return data.history.find(row=>row.date===meal.date&&row.mealSlot===meal.mealSlot);}
function available(data,date){return data.fridge.filter(row=>inventory.remaining(row)>0&&(!row.expiryDate||row.expiryDate>=date));}
async function evidence(text,images,key,settings,progress,onlineSearch){
  const source=sourceInput.parse(text);
  if(source.urls.length&&!images.length&&!sourceInput.detailed(text)&&!onlineSearch){const error=Error('已识别来源链接，但尚未读取小红书正文。请补充截图或完整正文；不会凭链接标题编造原文菜谱。');error.needsEvidence=true;error.source=source;throw error;}
  let rawText='';if(images.length){const result=await ocr.read(settings,key,{referenceText:source.referenceText,purpose:'指定餐次菜谱参考'},images,(i,n)=>progress('正在忠实识别截图 '+i+'/'+n));rawText=result.rawText;}
  return {...source,rawText,kind:images.length?'截图原文参考 + AI整理':source.urls.length?(sourceInput.detailed(text)?'粘贴正文参考 + AI整理':'联网参考（不等同于原笔记）'):'AI生成'};
}
function normalizeResult(item,base,evidenceValue){
  if(!item||!String(item.name||'').trim()||!recipeData.lines(item.ingredients).length)throw Error((base.label||base.date)+base.mealSlot+'缺少菜名或用料，未覆盖原计划');
  const cleanBase=planning.schedule(base.date).find(day=>day.date===base.date&&day.mealSlot===base.mealSlot)||{id:base.id,date:base.date,label:base.label,mealSlot:base.mealSlot};
  return recipeData.normalize({...cleanBase,...item,id:base.id,date:base.date,label:base.label,mealSlot:base.mealSlot,mealType:'self',methodSteps:recipeData.lines(item.methodSteps||item.steps||item.cookSteps),ingredientUses:[],extraCosts:[],confirmedAt:null,historyId:null,recipeId:null,servings:recipeData.numbers({servings:item.servings},['servings']).servings,proteinCategories:policy.proteins(item),sourceUrls:evidenceValue.urls,evidenceKind:evidenceValue.kind,sourceText:evidenceValue.rawText||'',sources:Array.isArray(item.sources)?item.sources:[],notes:String(item.notes||'')});
}
function bindUses(data,day){
  const result=inventory.matchLines(day.ingredients,available(data,day.date),[]),uses=[];const warnings=result.issues.slice();
  result.uses.forEach(use=>{const item=data.fridge.find(row=>row.id===use.inventoryId);try{const total=inventory.fraction(use,item)+inventory.allocated(data,item.id,day.id);if(total>inventory.balance(item)+.000001)throw Error(item.name+'可安排库存不足，需补购或改量');uses.push({...use,id:store.id('use')});}catch(error){warnings.push(error.message);}});
  return {...day,ingredientUses:uses,matchWarnings:warnings};
}
function overlayHistory(data,days){return days.map(day=>{const row=historyFor(data,day);return row?{...day,name:row.name,mealType:row.mealType||'self',ingredients:row.recipeSnapshot&&row.recipeSnapshot.ingredients||day.ingredients,confirmedAt:row.confirmedAt||'recorded',historyId:row.id}:day;});}
async function generate(text,images=[],options={}){
  const progress=options.progress||(()=>{}),data=store.getData(),key=model.getApiKey(),settings=store.getSettings(),single=options.kind==='single';
  const singleTarget=target(text,options.weekStart);
  const weekStart=single?singleTarget.weekStart:/下周|下星期/.test(text)?dates.addDays(dates.mondayOf(dates.today()),7):options.weekStart||dates.mondayOf(dates.today());
  const week=planning.getWeek(data,weekStart),original=week.days,days=overlayHistory(data,original),today=dates.today();
  const constraintText=[policy.constraintText(week.constraints==null?week.prompt:week.constraints),text].filter(Boolean).join('\n');
  const includeWeekend=options.includeWeekend==null?!!week.includeWeekend:!!options.includeWeekend;
  const candidates=days.filter(day=>{
    if(day.confirmedAt||day.mealType==='other')return false;
    if(single)return day.date===singleTarget.date&&day.mealSlot===singleTarget.mealSlot;
    if(day.date<today||(!includeWeekend&&['周六','周日'].includes(day.label)))return false;
    if(day.date===today&&day.mealSlot==='午餐'&&new Date().getHours()>=15)return false;
    if(/只补空白|保留已填|不改已有|只填空/.test(text)&&day.name)return false;
    return true;
  });
  if(!candidates.length)throw Error(single?'目标餐次已确认或安排为其他用餐，未覆盖。请在一周食谱明确编辑。':'所选范围没有可生成的剩余餐次；已确认、已过去和其他用餐均已保留。');
  if(single&&singleTarget.date<today)throw Error('目标餐次已过去，请明确未来日期；记录吃过的餐请用“实际吃了什么”。');
  const parsedSource=sourceInput.parse(text);
  const owned=single&&!images.length?data.recipes.find(row=>parsedSource.urls.length?parsedSource.urls.some(url=>row.sourceUrl===url||(row.sourceUrls||[]).includes(url)):namedRecipe(text,row)):null;
  if(!key&&!owned)throw Error('请先配置模型 API Key；现有计划没有改动。');
  let source,extracted;
  if(single&&parsedSource.urls.length&&!owned){
    const result=await sourceRecipe.read(settings,key,text,images,progress);extracted=result.draft;
    source={...parsedSource,rawText:result.ocrResult.rawText,kind:'外部菜谱忠实识别'};
  }else source=owned&&parsedSource.urls.length?{...parsedSource,rawText:'',kind:'已收录来源菜谱'}:await evidence(text,images,key,settings,progress,options.onlineSearch);
  const schedule=candidates.map(({date,label,mealSlot,id})=>({date,label,mealSlot,id}));
  const context={text,constraints:constraintText,today,weekStart,schedule,fridge:available(data,today).map(item=>({...item,remaining:inventory.remainingInfo(item,data,single?candidates[0].id:undefined)})),history:data.history.filter(row=>row.date>=weekStart&&row.date<=dates.addDays(weekStart,6)),currentDays:single?days.map(day=>day.id===candidates[0].id?{id:day.id,date:day.date,mealSlot:day.mealSlot,replacementTarget:true}:day):days,replaceExistingMeal:single,referenceText:source.referenceText,ocrRawText:source.rawText,sourceUrls:source.urls,onlineSearch:!!options.onlineSearch};
  let draftDays;
  if(extracted){draftDays=[normalizeResult({...extracted,steps:extracted.steps},candidates[0],source)];}
  else if(owned){draftDays=[normalizeResult({...owned,steps:owned.steps},candidates[0],{...source,kind:'我的菜谱'})];}
  else if(single){progress('正在生成 '+singleTarget.date+' '+singleTarget.mealSlot+'，并匹配库存价格…');const result=await model.call(settings,key,'mealDraft',context);if(options.onlineSearch&&!result.searchPerformed)throw Error('接口未返回有效搜索来源，未把结果当作联网菜谱保存；可关闭联网生成AI建议。');draftDays=[normalizeResult(result,candidates[0],source)];}
  else {
    progress('将生成所选周剩余 '+schedule.length+' 餐；已确认和其他餐次保留。');
    let result=await model.call(settings,key,'menuDraft',context),problems=[];
    if(options.onlineSearch&&!result.searchPerformed)throw Error('接口未返回有效搜索来源，未将联网菜单保存；可关闭联网后重试。');
    const searchSources=result.sources||[];
    const parse=result=>{if(!Array.isArray(result.days)||result.days.length!==candidates.length)throw Error('返回的餐次数量与本次剩余范围不符');return result.days.map((item,i)=>{if(item.date!==candidates[i].date||item.mealSlot!==candidates[i].mealSlot)throw Error('模型返回的日期/餐次错位');return normalizeResult({...item,sources:item.sources||searchSources},candidates[i],source);});};
    try{draftDays=parse(result);problems=policy.issues(draftDays,days.map(day=>draftDays.find(item=>item.id===day.id)||day),constraintText);}catch(error){problems=[error.message];}
    if(problems.length){progress('正在复核并纠正菜单：'+problems[0]);result=await model.call(settings,key,'menuDraftRepair',{...context,issues:problems,previous:result});draftDays=parse(result);problems=policy.issues(draftDays,days.map(day=>draftDays.find(item=>item.id===day.id)||day),constraintText);if(problems.length)throw Error('菜单仍违反要求，原计划未覆盖：'+problems.join('；'));}
    const completed=[];
    for(let i=0;i<draftDays.length;i+=4){const group=draftDays.slice(i,i+4);progress('正在生成现做步骤 '+(i+1)+'—'+(i+group.length)+' / '+draftDays.length);const methods=await model.call(settings,key,'methodsBatch',{text,days:group.map(({id,name,ingredients,servings})=>({id,name,ingredients,servings})),ocrRawText:source.rawText});if(!Array.isArray(methods.days)||methods.days.length!==group.length)throw Error('做法数量不完整，原计划未覆盖');group.forEach((day,j)=>{if(methods.days[j].id!==day.id)throw Error('做法与餐次不匹配，原计划未覆盖');const steps=recipeData.lines(methods.days[j].steps);if(!steps.length)throw Error(day.name+'没有返回现做步骤');completed.push({...day,methodSteps:steps,cookSteps:steps});});}
    draftDays=completed;
  }
  if(draftDays.some(day=>!day.methodSteps.length))throw Error('未返回现做步骤，原计划未覆盖');
  const violations=policy.issues(draftDays,days.map(day=>draftDays.find(item=>item.id===day.id)||day),constraintText,!single);if(violations.length)throw Error('菜谱违反要求：'+violations.join('；'));
  const ids=new Set(draftDays.map(day=>day.id)),fridgeBefore=JSON.stringify(data.fridge);
  store.update(latest=>{
    const current=planning.getWeek(latest,weekStart);
    if(JSON.stringify(latest.fridge)!==fridgeBefore)throw Error('生成期间库存发生变化，请重试以获取正确成本。');
    candidates.forEach(day=>{const actual=current.days.find(row=>row.id===day.id),before=original.find(row=>row.id===day.id);if(historyFor(latest,day)||JSON.stringify(actual)!==JSON.stringify(before))throw Error('生成期间餐次已被修改或确认，本次未覆盖，请重试。');});
    const concurrentIssues=policy.issues(draftDays,overlayHistory(latest,current.days).map(day=>draftDays.find(item=>item.id===day.id)||day),constraintText,!single);
    if(concurrentIssues.length)throw Error('生成期间其他餐次变化产生冲突，未覆盖：'+concurrentIssues.join('；'));
    // 在提交时以最新全部周的占用量重新匹配；不实际扣减库存。
    planning.putWeek(latest,weekStart,current.days.map(day=>ids.has(day.id)?{...day,ingredientUses:[]}:day),current.batchSteps,current.prompt);
    draftDays=draftDays.map(day=>{const bound=bindUses(latest,day);planning.mapMeals(latest,row=>row.id===day.id?bound:row);return bound;});
    planning.putWeek(latest,weekStart,current.days.map(day=>draftDays.find(item=>item.id===day.id)||day),current.batchSteps,single?current.prompt:text);latest.weeks[weekStart].includeWeekend=includeWeekend;latest.weeks[weekStart].constraints=policy.constraintText(constraintText);
  });
  const first=draftDays[0];return {weekStart,date:first.date,mealSlot:first.mealSlot,count:draftDays.length,warnings:draftDays.reduce((all,day)=>all.concat(day.matchWarnings||[]),[])};
}
async function ingredientsFor(day){
  if(!String(day.name||'').trim())throw Error('请先填写菜名');const key=model.getApiKey();if(!key)throw Error('根据菜名识别用料需要先配置模型；也可手动填写用料后匹配库存');
  const data=store.getData(),result=await model.call(store.getSettings(),key,'mealIngredients',{name:day.name,servings:day.servings,fridge:available(data,day.date).map(item=>({...item,remaining:inventory.remainingInfo(item,data,day.id)}))});
  const ingredients=recipeData.lines(result.ingredients);if(!ingredients.length)throw Error('未返回用料，现有用料未改动');return {ingredients,notes:String(result.notes||'')};
}
async function makeMethod(day,text=''){
  if(!recipeData.lines(day.ingredients).length)throw Error('请先填写本餐用料和用量');const key=model.getApiKey();if(!key)throw Error('请先配置模型 API Key');
  const result=await model.call(store.getSettings(),key,'methodOne',{name:day.name,ingredients:day.ingredients,servings:day.servings,request:text});const steps=recipeData.lines(result.steps);if(!steps.length)throw Error('模型未返回做法，原文字保留');return steps;
}
function applyRecipe(draft,destination){
  const evidenceKind=/AI建议/.test(draft.source||'')?'神厨小福贵 · AI建议':'原文识别后人工核对';
  const weekStart=dates.mondayOf(destination.date);let result;
  store.update(data=>{const saved=planning.getWeek(data,weekStart),base=saved.days.find(day=>day.date===destination.date&&day.mealSlot===destination.mealSlot);if(!base)throw Error('无法定位目标餐次');if(historyFor(data,base)||base.confirmedAt||base.mealType==='other')throw Error('目标餐次已确认或安排为其他用餐，未覆盖');const value=normalizeResult({...draft,steps:draft.steps},base,{urls:draft.sourceUrl?[draft.sourceUrl]:[],kind:evidenceKind});planning.putWeek(data,weekStart,saved.days.map(day=>day.id===base.id?{...base,ingredientUses:[]}:day),saved.batchSteps,saved.prompt);const bound=bindUses(data,{...value,referenceCost:draft.cost});planning.putWeek(data,weekStart,saved.days.map(day=>day.id===base.id?bound:day),saved.batchSteps,saved.prompt);result={date:base.date,mealSlot:base.mealSlot,weekStart};});return result;
}
module.exports={requestKind,isMealRequest,target,generate,ingredientsFor,makeMethod,bindUses,applyRecipe};
