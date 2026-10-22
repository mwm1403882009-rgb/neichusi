const native=require('../../utils/native-input');
const store = require('../../utils/store');
const model = require('../../utils/model');
const { assessRecipe } = require('../../utils/extraction');
const { today } = require('../../utils/date');
const handoff = require('../../utils/handoff');
const ocr = require('../../utils/ocr');
const sourceInput=require('../../utils/source-input');
const recipeData=require('../../utils/recipe-data');
const engine=require('../../utils/meal-engine');
const sourceRecipe=require('../../utils/source-recipe');

function urlFrom(text) {
  const found = String(text || '').replace(/\\([_&?=])/g, '$1').match(/https?:\/\/[^\s\])}>，。；]+/i);
  return found ? found[0].replace(/[)）.,，。;；]+$/, '') : '';
}

function textFromOcr(ocr) {
  if (ocr && ocr.rawText) return String(ocr.rawText);
  return (ocr && ocr.pages || []).map(page => `图片${page.index || ''}\n${page.rawText || ''}`).join('\n\n');
}

function makeDraft(result, shareText) {
  const sourceUrl = urlFrom(shareText);
  return {
    id: '',
    name: result.name || '',
    emoji: result.emoji || '🍳',
    source: sourceUrl ? '分享链接/截图' : '图片或文字导入',
    sourceUrl,
    plannedDate: today(),
    servings: result.servings == null || result.servings === '' ? null : Number(result.servings),
    cost: result.cost == null || result.cost === '' ? null : Number(result.cost),
    prepMinutes: result.prepMinutes == null || result.prepMinutes === '' ? null : Number(result.prepMinutes),
    ingredients: Array.isArray(result.ingredients) ? result.ingredients : [],
    steps: Array.isArray(result.steps) ? result.steps : [],
    notes: result.notes || '',
    tags: Array.isArray(result.tags) ? result.tags : [],
    uncertain: Array.isArray(result.uncertain) ? result.uncertain : []
  };
}

defineScreen({
  data: {
    prompt: '', shareText: '', referenceText: '', images: [], busy: false,
    notice: '', noticeType: '', stage: '', draft: null, ocrResult: null,
    ocrRawText: '', ocrUncertain: [], quality: null, repairUsed: false,
    ingredientsText: '', stepsText: '', tagsText: '',targetMeal:null,targetApplied:false,linkDiagnostic:''
  },

  onLoad(){const incoming=handoff.take('recipe');if(!incoming)return;const source=sourceInput.parse(Array.from(new Set([incoming.text,incoming.shareText,incoming.referenceText].filter(Boolean))).join('\n')),targetMeal=incoming.targetMeal||(engine.isMealRequest(source.text)?engine.target(source.text):null);this.setData({shareText:source.shareText,referenceText:source.referenceText,images:incoming.images||[],targetMeal,notice:targetMeal?'已保留目标餐次。点击识别将先尝试读取公开笔记；完整结果会填入该餐草稿，替换旧菜，不记为已吃。':'来源已带入，可直接点击识别；会先尝试读取公开笔记，失败时再补正文或截图。'});if(incoming.sourceDraft){const result=incoming.sourceDraft;this.applyDraft(result.draft,result.ocrResult,result.repairUsed);this.setData({notice:'已保留识别结果，请补全明显缺项后填入目标餐次。',noticeType:'error'});}},
  onText(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    native.capture(this,field,value);
    const update = {linkDiagnostic:''};
    if (/https?:\/\//.test(value)) {
      update.notice = '已识别分享链接。点击“读取链接 / 识别菜谱”会先尝试读取公开正文和菜谱图片，读取不到时再补截图或正文。';
      update.noticeType = '';
    }
    this.setData(update);
  },

  async addImages() {
    const remaining = 6 - this.data.images.length;
    if (remaining <= 0) return this.setData({ notice: '一次最多添加6张截图；同一笔记请按阅读顺序选择。', noticeType: '' });
    try {
      const added = await model.chooseImages(remaining);
      this.setData({
        images: this.data.images.concat(added).slice(0, 6),
        notice: `已添加${added.length}张，共${this.data.images.length + added.length}张；小图保留原图，大图只压缩一次。`,
        noticeType: ''
      });
    } catch (error) {
      this.setData({ notice: error.message, noticeType: 'error' });
    }
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ images: this.data.images.filter((_, itemIndex) => itemIndex !== index) });
  },

  applyDraft(draft, ocrResult, repairUsed) {
    const quality = assessRecipe(ocrResult, draft);
    this.setData({
      draft,
      ocrResult,
      ocrRawText: textFromOcr(ocrResult),
      ocrUncertain: Array.from(new Set([...(ocrResult.uncertain || []), ...(draft.uncertain || [])].filter(Boolean))),
      quality,
      repairUsed,
      ingredientsText: draft.ingredients.join('\n'),
      stepsText: draft.steps.join('\n'),
      tagsText: draft.tags.join('、')
    });
    return quality;
  },

  async repair(draft, ocrResult, automatic) {
    const quality = assessRecipe(ocrResult, draft);
    this.setData({ stage: automatic ? '检测到遗漏，正在自动补提一次…' : '正在根据识别原文重新补提…' });
    const repaired = await model.call(store.getSettings(), model.getApiKey(), 'recipeRepair', {
      ocrRawText: textFromOcr(ocrResult),
      ocrUncertain: ocrResult.uncertain || [],
      draft,
      problems: quality.reasons,
      missingQuantities: quality.missingQuantities
    });
    const result=makeDraft(repaired,[this.data.shareText,this.data.referenceText].join('\n'));return {...result,source:ocrResult.sourceKind||result.source};
  },

  async analyze() {
    if(this.data.busy)return;
    const source=sourceInput.parse([this.data.shareText,this.data.referenceText].join('\n'));
    if(!source.text.trim()&&!this.data.images.length)return this.setData({notice:'请先粘贴分享链接、正文或添加截图。',noticeType:'error'});
    const input={text:source.text,images:this.data.images.slice(),prompt:this.data.prompt,draft:JSON.stringify(this.data.draft)};
    const unchanged=()=>input.text===sourceInput.parse([this.data.shareText,this.data.referenceText].join('\n')).text&&JSON.stringify(input.images)===JSON.stringify(this.data.images)&&input.prompt===this.data.prompt&&input.draft===JSON.stringify(this.data.draft);
    const checkInput=()=>{if(!unchanged())throw Error('识别期间链接或输入已修改，未覆盖原草稿，请重新识别。');};
    this.setData({ busy: true, notice: '', noticeType: '', linkDiagnostic:'', stage: '正在读取链接或识别原文…' });
    try {
      const settings = store.getSettings();
      const key = model.getApiKey();
      const prepared=await sourceRecipe.prepare(settings,key,input.text,input.images,stage=>this.setData({stage}),{prompt:input.prompt});
      checkInput();
      const ocrResult=prepared.evidence;
      const rawText = textFromOcr(ocrResult);
      if (!rawText.trim()) throw new Error('第一轮没有识别出菜谱文字，请换更清晰的截图');
      ocrResult.rawText = rawText;
      this.setData({ stage: '第二轮：正在按原文整理结构化菜谱…' });
      const result = await model.call(settings, key, 'recipe', {
        userRequest: input.prompt,
        sourceUrl: source.sourceUrl,
        ocrRawText: rawText,
        ocrUncertain: ocrResult.uncertain || [],
        observedIngredientCount: ocrResult.observedIngredientCount || 0,
        observedStepCount: ocrResult.observedStepCount || 0
      });
      checkInput();
      let draft = makeDraft(result, source.text);
      draft.source=ocrResult.sourceKind||draft.source;
      let quality = assessRecipe(ocrResult,draft),repairUsed=false;
      if (!quality.canSave || quality.score < 90) {
        draft = await this.repair(draft, ocrResult, true);
        checkInput();
        repairUsed=true;
      }
      checkInput();quality=this.applyDraft(draft,ocrResult,repairUsed);
      this.setData({
        stage: '',
        notice: quality.canSave ? '原文整理完成（'+(ocrResult.sourceKind||'截图/正文')+'）。保存前请核对食材、步骤和待确认项。' : '自动补提后仍有明显缺项，请对照识别原文补全后再保存。',
        noticeType: quality.canSave ? 'success' : 'error'
      });
      if(quality.canSave&&this.data.targetMeal)this.fillTarget(false);
    } catch (error) {
      this.setData({ notice: error.message || '分析失败', noticeType: 'error', stage: '',linkDiagnostic:error.readDiagnostic||'' });
    } finally {
      this.setData({ busy: false });
    }
  },

  copyReadDiagnostic(){if(this.data.linkDiagnostic)platform.setClipboardData({data:this.data.linkDiagnostic});},

  async retryRepair() {
    if (!this.data.draft || !this.data.ocrResult || this.data.busy) return;
    this.setData({ busy: true, notice: '', noticeType: '' });
    try {
      const draft = await this.repair(this.data.draft, this.data.ocrResult, false);
      const quality = this.applyDraft(draft, this.data.ocrResult, true);
      this.setData({ stage: '', notice: quality.canSave ? '补提完成，请核对后保存。' : '仍有缺项，可以直接编辑草稿补全。', noticeType: quality.canSave ? 'success' : 'error' });
      if(quality.canSave&&this.data.targetMeal)this.fillTarget(false);
    } catch (error) {
      this.setData({ stage: '', notice: error.message || '补提失败', noticeType: 'error' });
    } finally {
      this.setData({ busy: false });
    }
  },

  refreshQuality(draft) {
    if (!this.data.ocrResult) return;
    this.setData({ quality: assessRecipe(this.data.ocrResult, draft) });
  },

  edit(event) {
    const field = event.currentTarget.dataset.field;
    let value = event.detail.value;
    // 保留19.等输入中间态，保存时统一校验并转为数值。
    const draft = { ...this.data.draft, [field]: value };this.setData({targetApplied:false});
    native.capture(this,'draft',draft);
    this.refreshQuality(draft);
  },

  lines(event) {
    const field = event.currentTarget.dataset.field;
    const text = event.detail.value;
    const split = field === 'tags' ? text.split(/[、,，\n]/) : text.split('\n');
    const draft = { ...this.data.draft, [field]: split.map(item => item.trim()).filter(Boolean) };this.data.targetApplied=false;
    native.capture(this,'draft',draft);native.capture(this,event.currentTarget.dataset.text,text);
    this.refreshQuality(draft);
  },

  save() {
    const draft = this.data.draft;
    const quality = this.data.quality;
    if (!draft || !String(draft.name || '').trim()) return platform.showToast({ title: '请先识别并填写菜名', icon: 'none' });
    if (!quality || !quality.canSave) return platform.showModal({ title: '暂不能收录', content: '完整度检查仍发现明显缺项。请根据上方识别原文补全用量或步骤，或再补提一次。', showCancel: false });
    let parsed;try{parsed=recipeData.numbers(draft);}catch(error){return platform.showToast({title:error.message,icon:'none'});}
    const saved = { ...parsed, id: store.id('recipe'),category:recipeData.classify(parsed) };
    delete saved.uncertain;
    try{store.update(data => data.recipes.unshift(saved));}catch(error){return this.setData({notice:error.message,noticeType:'error'});}
    platform.showToast({ title: '已收录' });
    setTimeout(() => platform.navigateBack(), 500);
  },
  fillTarget(open){if(!this.data.targetMeal||!this.data.draft)return;if(!this.data.quality||!this.data.quality.canSave)return platform.showToast({title:'请先补全并核对原文缺项',icon:'none'});try{const draft=recipeData.numbers(this.data.draft),result=engine.applyRecipe(draft,this.data.targetMeal);this.setData({targetApplied:true,notice:'已填入 '+result.date+' '+result.mealSlot+' 草稿，旧菜和旧用料已替换，尚未记账或扣库存。',noticeType:'success'});if(open)handoff.send('week',{...result,openMeal:true});return result;}catch(error){this.setData({notice:error.message,noticeType:'error'});}},
  useForMeal(){this.fillTarget(true);}

});
