const native=require('../../utils/native-input');
const store = require('../../utils/store');
const model = require('../../utils/model');
const billing = require('../../utils/billing');
const { providers } = require('../../utils/defaults');
const providerList = Object.keys(providers).map(id => ({ id, ...providers[id] }));
function domainFrom(value) { const match=String(value||'').trim().match(/^https:\/\/[^/]+/i); return match?match[0]:''; }
function profile(value) { const { profiles, ...rest }=value; return rest; }
function cacheKey(settings) { return settings.provider + '|' + String(settings.baseUrl||'').replace(/\/$/,''); }
defineScreen({
  data:{providerList,providerIndex:0,settings:{},apiKey:'',showKey:false,busy:false,refreshing:false,notice:'',noticeType:'',requestDomain:'',modelOptions:[],textIndex:0,visionIndex:0,catalogTime:'尚未在线刷新',rateModels:[],rateModel:'',rateIndex:0,inputRate:'',outputRate:'',hitRate:'',writeRate:'',speech:{},searchPrice:'16',speechDomain:''},
  onLoad(){
    const saved=store.getSettings();
    const speech=saved.speech||{provider:'mimo',model:'mimo-v2.5-asr',baseUrl:providers.mimo.baseUrl,pricePerHour:0.5};
    this.setData({speech,searchPrice:saved.searchPricePerThousand==null?16:saved.searchPricePerThousand,speechDomain:domainFrom(speech.baseUrl)});
    saved.modelPrices = saved.modelPrices || {};
    if (!saved.modelPrices[saved.model]) saved.modelPrices[saved.model] = { inputPricePerMillion: saved.inputPricePerMillion == null ? '' : saved.inputPricePerMillion, outputPricePerMillion: saved.outputPricePerMillion == null ? '' : saved.outputPricePerMillion };
    this.profiles=saved.profiles||{}; this.profiles[saved.provider]=profile(saved);
    this.setData({settings:profile(saved),providerIndex:Math.max(0,providerList.findIndex(row=>row.id===saved.provider)),apiKey:model.getApiKey(saved.provider),requestDomain:domainFrom(saved.baseUrl)});
    this.catalog(); this.showRates(saved.model);
  },
  stash(){
    const settings=this.data.settings; this.profiles[settings.provider]=profile(settings);
    model.setApiKey(this.data.apiKey,settings.rememberKey,settings.provider);
  },
  choose(event){
    this.stash();
    const providerIndex=Number(event.detail.value),p=providerList[providerIndex];
    const settings=this.profiles[p.id]||{...p,provider:p.id,rememberKey:false,modelPrices:{}};
    this.setData({providerIndex,settings,apiKey:model.getApiKey(p.id),requestDomain:domainFrom(settings.baseUrl),notice:'',noticeType:''}); this.catalog(); this.showRates(settings.model);
  },
  catalog(){
    const settings=this.data.settings,entry=(platform.getStorageSync('ysf-model-catalogs-v1')||{})[cacheKey(settings)];
    const seed=[settings.model,settings.visionModel,providers[settings.provider].model,providers[settings.provider].visionModel].concat(settings.provider==='mimo'?['mimo-v2.6-flash','mimo-v2.6-pro','mimo-v2.6-pro-ultraspeed']:[]);
    const rows=entry?entry.models:seed.filter(Boolean).map(id=>({id,vision:null}));
    const all=rows.slice();
    [settings.model,settings.visionModel].filter(Boolean).forEach(id=>{if(!all.some(row=>row.id===id))all.unshift({id,vision:null});});
    const seen=new Set();
    const modelOptions=all.filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true;}).map(row=>({...row,label:row.id+(row.vision===true?' · 支持图片':row.vision===false?' · 仅文字':' · 图片能力待测')}));
    this.setData({modelOptions,textIndex:Math.max(0,modelOptions.findIndex(row=>row.id===settings.model)),visionIndex:Math.max(0,modelOptions.findIndex(row=>row.id===settings.visionModel)),catalogTime:entry?'在线更新：'+entry.at.slice(0,19).replace('T',' ')+' UTC':'内置候选 · 尚未在线刷新'});
  },
  async refreshModels(){
    this.setData({refreshing:true,notice:'正在获取当前服务商的模型列表…',noticeType:''});
    try{
      const models=await model.listModels(this.data.settings,this.data.apiKey);
      const catalogs=platform.getStorageSync('ysf-model-catalogs-v1')||{}; catalogs[cacheKey(this.data.settings)]={at:new Date().toISOString(),models};
      platform.setStorageSync('ysf-model-catalogs-v1',catalogs); this.catalog(); this.showRates(this.data.rateModel);
      this.setData({notice:'已获取'+models.length+'个对话模型。请在下拉列表选择，再测试；刷新不会改变当前模型。',noticeType:'success'});
    }catch(error){this.setData({notice:error.message,noticeType:'error'});}
    finally{this.setData({refreshing:false});}
  },
  pickModel(event){const field=event.currentTarget.dataset.field,row=this.data.modelOptions[Number(event.detail.value)];if(row)this.changeModel(field,row.id);},
  changeModel(field,value){this.setData({['settings.'+field]:value});if(field==='model')this.setData({'settings.inputPricePerMillion':'','settings.outputPricePerMillion':''});this.catalog();if(field==='model')this.showRates(value);},
  edit(event){const field=event.currentTarget.dataset.field,value=event.detail.value;native.capture(this,'settings.'+field,value);if(field==='model'){native.capture(this,'settings.inputPricePerMillion','');native.capture(this,'settings.outputPricePerMillion','');}if(field==='baseUrl')this.setData({requestDomain:domainFrom(value)});},
  editBlur(event){const field=event.currentTarget.dataset.field;if(field==='model'||field==='visionModel'||field==='baseUrl'){this.catalog();if(field==='model')this.showRates(this.data.settings.model);}},
  showRates(selected){
    const settings=this.data.settings,rateModels=Array.from(new Set([settings.model,settings.visionModel].concat(this.data.modelOptions.map(row=>row.id)).filter(Boolean)));
    const rateModel=rateModels.includes(selected)?selected:settings.model;
    const saved=(settings.modelPrices||{})[rateModel]||(rateModel===settings.model?settings:{});
    this.setData({hitRate:saved.cacheHitPricePerMillion==null?'':saved.cacheHitPricePerMillion,writeRate:saved.cacheWritePricePerMillion==null?'':saved.cacheWritePricePerMillion,rateModels,rateModel,rateIndex:Math.max(0,rateModels.indexOf(rateModel)),inputRate:saved.inputPricePerMillion==null?'':saved.inputPricePerMillion,outputRate:saved.outputPricePerMillion==null?'':saved.outputPricePerMillion});
  },
  pickRate(event){this.showRates(this.data.rateModels[Number(event.detail.value)]);},
  editRate(event){
    const field=event.currentTarget.dataset.field,value=event.detail.value;
    const modelPrices={...(this.data.settings.modelPrices||{}),[this.data.rateModel]:{...((this.data.settings.modelPrices||{})[this.data.rateModel]||{}),[field]:value}};
    native.capture(this,'settings.modelPrices',modelPrices);native.capture(this,{inputPricePerMillion:'inputRate',outputPricePerMillion:'outputRate',cacheHitPricePerMillion:'hitRate',cacheWritePricePerMillion:'writeRate'}[field],value);
  },
  officialRates(){const rate=billing.officialMimo[this.data.rateModel];if(this.data.settings.provider!=='mimo'||!rate)return this.setData({notice:'这个模型没有内置已核对价格，请按服务商账单手动填写。',noticeType:''});const modelPrices={...this.data.settings.modelPrices,[this.data.rateModel]:{...rate,source:'https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go',verifiedAt:'2026-10-16',currency:'CNY'}};this.setData({'settings.modelPrices':modelPrices,notice:'已填入小米按量人民币参考价（2026-10-16核对），套餐并不等同于按量价，请核对账户适用价格。',noticeType:''});this.showRates(this.data.rateModel);},
  editSpeech(event){const field=event.currentTarget.dataset.field;native.capture(this,'speech.'+field,event.detail.value);if(field==='baseUrl')this.setData({speechDomain:domainFrom(event.detail.value)});},
  searchRate(event){native.capture(this,'searchPrice',event.detail.value);},
  copySpeechDomain(){if(this.data.speechDomain)platform.setClipboardData({data:this.data.speechDomain});},
  key(event){native.capture(this,'apiKey',event.detail.value);},remember(event){this.setData({'settings.rememberKey':event.detail.value});},toggle(){this.setData({showKey:!this.data.showKey});},
  mimoEndpoint(event){this.setData({'settings.baseUrl':event.currentTarget.dataset.url,requestDomain:domainFrom(event.currentTarget.dataset.url),notice:event.currentTarget.dataset.tip,noticeType:''});this.catalog();},
  copyDomain(){if(this.data.requestDomain)platform.setClipboardData({data:this.data.requestDomain});},
  save(){
    for(const [id,rate] of Object.entries(this.data.settings.modelPrices||{})){for(const field of ['inputPricePerMillion','cacheHitPricePerMillion','cacheWritePricePerMillion','outputPricePerMillion'])if(rate[field]!==''&&rate[field]!=null&&billing.numeric(rate[field])==null){this.setData({notice:id+' 的价格必须为不小于0的数字。',noticeType:'error'});return false;}}
    if((this.data.speech.pricePerHour!==''&&billing.numeric(this.data.speech.pricePerHour)==null)||(this.data.searchPrice!==''&&billing.numeric(this.data.searchPrice)==null)){this.setData({notice:'语音或搜索价格必须为不小于0的数字；未知可留空。',noticeType:'error'});return false;}
    this.stash();
    const settings=this.data.settings,rate=(settings.modelPrices||{})[settings.model]||{};
    store.setSettings({...settings,speech:this.data.speech,searchPricePerThousand:this.data.searchPrice,inputPricePerMillion:rate.inputPricePerMillion==null?'':rate.inputPricePerMillion,outputPricePerMillion:rate.outputPricePerMillion==null?'':rate.outputPricePerMillion,profiles:this.profiles});
    this.setData({notice:'配置已保存，计价和语音设置已同步。文字和图片可分别测试。',noticeType:'success'});return true;
  },
  restore(){
    const id=this.data.settings.provider,p=providers[id];
    this.setData({settings:{...p,provider:id,modelPrices:this.data.settings.modelPrices||{},rememberKey:this.data.settings.rememberKey},requestDomain:domainFrom(p.baseUrl),notice:'已恢复内置推荐值，请测试。',noticeType:''});this.catalog();this.showRates(p.model);
  },
  async test(){
    if(this.save()===false)return;if(!this.data.apiKey)return this.setData({notice:'请填写当前服务商的 API Key',noticeType:'error'});
    this.setData({busy:true,notice:'正在测试文字生成…',noticeType:''});
    try{const result=await model.call(store.getSettings(),this.data.apiKey,'test');this.setData({notice:(result.message||'连接成功')+'，文字生成可用。',noticeType:'success'});}
    catch(error){this.setData({notice:error.message,noticeType:'error'});}finally{this.setData({busy:false});}
  },
  async testVision(){
    if(this.save()===false)return;this.setData({busy:true,notice:'请选一张含清晰文字的图片测试。',noticeType:''});
    try{const images=await model.chooseImages(1);if(!images.length)return;const result=await model.call(store.getSettings(),this.data.apiKey,'visionTest',{},images);this.setData({notice:'图片接口返回：'+(result.text||result.message||'请核对识别结果'),noticeType:'success'});}
    catch(error){this.setData({notice:error.message,noticeType:'error'});}finally{this.setData({busy:false});}
  }
});
