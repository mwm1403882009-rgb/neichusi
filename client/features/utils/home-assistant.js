const store=require('./store');
const model=require('./model');
const dates=require('./date');
const speech=require('./speech');
const handoff=require('./handoff');
const engine=require('./meal-engine');
const recipes=require('./recipe-data');
const sourceInput=require('./source-input');
const inventory=require('./inventory');
const planning=require('./planning');
const CHAT='ysf-fugui-chat-v1', INPUT='ysf-fugui-input-v1';
const clip=(text,n=6000)=>String(text||'').slice(0,n);
function intent(text){
  // This local gate is authoritative. Model responses and source documents never grant write authority.
  const t=String(text).trim();
  if(/(?:买了|购买了|采购了).*[，,；;].*(?:还想|也想|推荐|做法)/.test(t))return 'chat';
  if(/不要|别帮|先不|暂不|不需要|不用|取消/.test(t))return 'chat';
  if(/如果|假如|假设|举例|例如|比如|解释|说明|分析|比较|对比|查询|问一下|讨论|读取|识别/.test(t))return 'chat';
  if(/[?？]|能不能|可不可以|可以吗|能否|怎么|如何|为什么|是否|要不要|推荐|建议|有哪些|有什么/.test(t.replace(/(?:你|刚才|之前)?推荐的/g,'')))return 'chat';
  if(/^(?:请|帮我|给我|麻烦|把|我想|我要|现在|就|直接|收藏|保存|收录|加入)/.test(t)&&/收藏|收录|存入菜谱|保存.{0,8}菜谱|加入.{0,8}菜谱/.test(t))return 'recipe';
  if(/^(?:我|今天|昨天|刚刚|刚才|早上|上午|下午|晚上|又|已经|刚|新)*(?:买了|购买了|采购了|刚买)|^我[^，。！？]{0,16}(?:买了|购买了|采购了)|(?:请|帮我|把|将).*(?:入库|录入库存|放入冰箱)/.test(t))return 'purchase';
  if(/吃了|吃完了|吃过了|吃的是|记录.{0,16}(?:吃|用餐|外食)|确认已吃/.test(t))return 'log';
  if(/生成|安排|调整|更新|重做/.test(t)&&/(?:本周|这周|下周|一周|剩余|备餐)/.test(t)&&engine.requestKind(t)==='week')return 'week';
  if(/安排|录入|改成|换成|就吃/.test(t)||(/想吃|要吃/.test(t)&&engine.isMealRequest(t)))return 'meal';
  if(/导入.{0,8}菜谱/.test(t))return 'recipe';
  return 'chat';
}
function candidates(value){
  return (Array.isArray(value)?value:[]).slice(0,5).filter(row=>row&&typeof row==='object'&&clip(row.name).trim()).map(row=>({
    id:store.id('candidate'),name:clip(row.name,100).trim(),reason:clip(row.reason,500),
    ingredients:recipes.lines(row.ingredients).slice(0,40).map(v=>clip(v,200)),steps:recipes.lines(row.steps).slice(0,30).map(v=>clip(v,500)),
    servings:null,
    cost:null,notes:clip(row.notes,1000),source:'神厨小福贵 · AI建议',tags:['AI建议']
  }));
}
function recentCandidates(messages){for(let i=messages.length-1;i>=0;i--)if(Array.isArray(messages[i].candidates)&&messages[i].candidates.length)return messages[i].candidates;return [];}
function resolveCandidate(text,messages,selectedId){
  const rows=recentCandidates(messages),ordinal=text.match(/第\s*([一二三四五1-5])\s*(?:道|个|款)/);
  if(ordinal){const n='一二三四五'.indexOf(ordinal[1]);return rows[n<0?Number(ordinal[1])-1:n]||null;}
  const all=messages.slice().reverse().flatMap(row=>Array.isArray(row.candidates)?row.candidates:[]);
  const named=all.filter(row=>text.includes(row.name));if(named.length===1)return named[0];
  if(/这道|那道|这个|它|此菜/.test(text))return all.find(row=>row.id===selectedId)||(rows.length===1?rows[0]:null);
  return null;
}
function requireComplete(recipe){if(!recipe.name||!recipe.ingredients.length||!recipe.steps.length)throw Error('这道菜尚缺用料或完整做法，请先问“这道菜怎么做”，补齐后再安排或收藏。');}
function destination(text){if(!engine.isMealRequest(text))return null;const result=engine.target(text);if(!/^\d{4}-\d{2}-\d{2}$/.test(result.date)||!Number.isFinite(Date.parse(result.date+'T12:00:00'))||result.date<dates.today())throw Error('请指定今天或未来的有效日期；吃过的餐请用“记录已吃”。');return result;}
function find(page,id){for(const message of page.data.messages){const row=(message.candidates||[]).find(item=>item.id===id);if(row)return row;}throw Error('这条候选已不在当前对话，请重新推荐。');}
function enhance(original){return {...original,
  data:{...original.data,quick:[{kind:'recommend',label:'推荐几道菜'},{kind:'week',label:'安排一周'},{kind:'purchase',label:'记一笔采购'},{kind:'history',label:'用餐历史'}],selectedId:'',arrangeId:'',arrangeDate:'',arrangeSlot:'',expandedId:'',slots:['请选择','午餐','晚餐'],slotIndex:0,messages:[]},
  onLoad(){
    const saved=platform.getStorageSync(CHAT),legacy=platform.getStorageSync('ysf-chat-messages-v1');
    const messages=Array.isArray(saved)?saved:Array.isArray(legacy)?legacy.map(({id,role,text})=>({id,role,text})):[];
    this.setData({messages:messages.slice(-30),input:platform.getStorageSync(INPUT)||platform.getStorageSync('ysf-chat-input-v1')||'',onlineSearch:!!platform.getStorageSync('ysf-online-search')});
    this.voice=speech.create(this,text=>{this.setData({input:this.data.input?this.data.input+'\n'+text:text});this.persist();});
  },
  onHide(){this.voice?.cancel();this.persist();},onUnload(){clearTimeout(this._inputTimer);this.voice?.dispose();this.persist();},
  persist(){clearTimeout(this._inputTimer);platform.setStorageSync(INPUT,this.data.input);platform.setStorageSync(CHAT,this.data.messages.slice(-30).map(({images,...row})=>row));},
  input(event){this.data.input=event.detail.value;clearTimeout(this._inputTimer);this._inputTimer=setTimeout(()=>{try{this.persist();}catch(error){this.setData({notice:error.message});}},450);},
  append(text,extra={}){this.setData({messages:this.data.messages.concat({id:store.id('chat'),role:'assistant',text,...extra}).slice(-30)});this.persist();},
  async send(){
    if(this.data.busy||this.data.recording||this.data.voiceBusy)return;
    const text=this.data.input.trim(),images=this.data.images.slice();if(!text&&!images.length)return;
    const previous=this.data.messages.slice(),kind=intent(text),selected=resolveCandidate(text,previous,this.data.selectedId);
    this.setData({busy:true,notice:'',input:'',images:[],messages:previous.concat({id:store.id('chat'),role:'user',text:text||'请看这些图片',images}).slice(-30)});
    try{
      if(kind!=='chat'){
        if((kind==='meal'||kind==='recipe')&&/第\s*[一二三四五1-5]\s*(?:道|个|款)|这道|那道|这个|它/.test(text)&&!selected)throw Error('请先选中一道候选菜；我不会替你从多道菜里默认选一道。');
        if(kind==='meal'){
          const target=destination(text);
          if(!target){if(!selected)throw Error('请说清菜名、日期和午餐/晚餐，例如“第二道安排明天晚餐”。');this.setData({arrangeId:selected.id,arrangeDate:'',arrangeSlot:'',slotIndex:0});this.append('已选中'+selected.name+'，请在下方选择日期和餐次后再保存草稿。');return;}
          if(selected){requireComplete(selected);const result=engine.applyRecipe({...selected,servings:null},target);this.append('已将“'+selected.name+'”安排到'+result.date+' '+result.mealSlot+'，是待确认草稿；尚未记账或扣库存。',{action:{kind:'week',result}});}
          else{
            if(!/想吃|要吃|吃|改成|换成/.test(text))throw Error('请补充要安排的菜名，或选择上面的候选菜。');
            const result=await engine.generate(text,images,{kind:'single',onlineSearch:this.data.onlineSearch,progress:notice=>this.setData({notice})});
            this.append('已生成对应餐次草稿，食材和费用请核对；确认吃过后才记账、扣库存。',{action:{kind:'week',result}});
          }
        }else if(kind==='week'){
          const result=await engine.generate(text,images,{kind:'week',onlineSearch:this.data.onlineSearch,progress:notice=>this.setData({notice})});this.append('已生成'+result.count+'餐草稿，保留已确认餐次；尚未扣库存。',{action:{kind:'week',result}});
        }else if(kind==='recipe'&&selected){this.saveRecipe(selected);}
        else if(kind==='log'&&!/在外|外食|外卖|堂食|餐厅|饭店|食堂|聚餐/.test(text)&&engine.isMealRequest(text)&&planning.getWeek(store.getData(),engine.target(text).weekStart).days.some(row=>row.date===engine.target(text).date&&row.mealSlot===engine.target(text).mealSlot&&row.name)){
          this.append('该餐已有食谱，已打开对应餐次。请核对实际用料，再点“确认已吃并扣库存”；这次尚未记录或扣减。');handoff.send('week',{...engine.target(text),openMeal:true});
        }else{this.append(kind==='purchase'?'正在整理采购草稿，请在库存页核对，确认后才入库。':kind==='log'?'正在整理用餐草稿，请核对后确认；未提供实际耗材时不自动扣库存。':'已带入菜谱导入页，请核对来源和内容后保存。');handoff.send(kind==='purchase'?'fridge':kind==='log'?'log':'recipe',{text,...(kind==='recipe'?sourceInput.parse(text):{}),images,prepareDraft:true,source:'神厨小福贵'});}
      }else{
        const key=model.getApiKey();if(!key)throw Error('请先在“更多 → 模型设置”配置 API Key，随后就可以连续问答和推荐多道菜。');
        const data=store.getData(),result=await model.call(store.getSettings(),key,'assistant',{
          text,today:dates.today(),onlineSearch:this.data.onlineSearch,
          conversation:previous.slice(-12).map(row=>({role:row.role,text:clip(row.text),candidates:(row.candidates||[]).map(({id,name,reason,ingredients,steps,notes})=>({id,name,reason,ingredients,steps,notes}))})),
          selectedCandidate:selected||null,
          fridge:data.fridge.map(row=>({name:row.name,type:row.type,remaining:inventory.remainingInfo(row,data),unitPrice:inventory.unitCost(row),priceUnit:inventory.priceUnit(row),expiryDate:row.expiryDate})),
          recipes:data.recipes.slice(0,30).map(({name,category})=>({name,category})),history:data.history.slice(0,14).map(({date,mealSlot,name,totalCost})=>({date,mealSlot,name,totalCost}))
        },images);
        const rows=candidates(result.candidates),searchNotice=this.data.onlineSearch&&!result.searchPerformed?'\n本次未取得可核验的联网来源，以下仅作AI建议。':'';
        this.append(clip(result.reply)||'请再说具体一些，我会先给建议，不自动改动食谱。',{candidates:rows,sources:result.searchPerformed?result.sources:[],searchNotice});
        if(rows.length)this.setData({selectedId:'',arrangeId:''});
      }
    }catch(error){this.setData({input:text,images,notice:error.message||'未完成，输入已保留，请重试'});if(error.needsEvidence&&kind==='meal'){handoff.send('recipe',{...sourceInput.parse(text),images,targetMeal:destination(text),sourceDraft:error.sourceDraft||null,source:'神厨小福贵'});}}
    finally{this.setData({busy:false});this.persist();}
  },
  saveRecipe(recipe){
    requireComplete(recipe);let id;
    store.update(data=>{const existing=data.recipes.find(row=>row.assistantCandidateId===recipe.id);if(existing){id=existing.id;return;}id=store.id('recipe');data.recipes.unshift({...recipe,id,assistantCandidateId:recipe.id,category:recipes.classify(recipe),cost:null});});
    this.append('已收藏“'+recipe.name+'”到我的菜谱，标注为AI建议；用量可继续编辑，未改变库存或用餐历史。',{action:{kind:'recipe',id}});
  },
  async candidateAction(event){
    if(this.data.busy)return;this.setData({busy:true,notice:''});
    try{const {id,action}=event.currentTarget.dataset,row=find(this,id);this.setData({selectedId:id});
      if(action==='save')this.saveRecipe(row);
      else if(action==='arrange'){requireComplete(row);this.setData({arrangeId:id,arrangeDate:'',arrangeSlot:'',slotIndex:0});}
      else{this.setData({input:'这道“'+row.name+'”的详细做法和注意事项是什么？'});}
    }catch(error){this.setData({notice:error.message});}finally{this.setData({busy:false});}
  },
  async confirmArrangement(){
    if(this.data.busy)return;this.setData({busy:true,notice:''});
    try{const row=find(this,this.data.arrangeId),date=this.data.arrangeDate,mealSlot=this.data.arrangeSlot;
      if(!date||!['午餐','晚餐'].includes(mealSlot))throw Error('请选择日期和午餐/晚餐，不会默认安排。');
      destination(date+' '+mealSlot);requireComplete(row);const result=engine.applyRecipe({...row,servings:null},{date,mealSlot});
      this.setData({arrangeId:''});this.append('已将“'+row.name+'”保存为'+date+' '+mealSlot+'草稿，尚未记账、扣库存。',{action:{kind:'week',result}});
    }catch(error){this.setData({notice:error.message});}finally{this.setData({busy:false});}
  },
  expand(event){this.setData({expandedId:this.data.expandedId===event.currentTarget.dataset.id?'':event.currentTarget.dataset.id});},
  chooseDate(event){this.setData({arrangeDate:event.detail.value});},
  chooseSlot(event){const slotIndex=Number(event.detail.value);this.setData({slotIndex,arrangeSlot:this.data.slots[slotIndex]||''});},
  dateShortcut(event){this.setData({arrangeDate:dates.addDays(dates.today(),Number(event.currentTarget.dataset.step)||0)});},
  cancelArrangement(){this.setData({arrangeId:''});},
  copySource(event){const url=event.currentTarget.dataset.url;if(/^https:\/\//i.test(url||''))platform.setClipboardData({data:url});},
  openResult(event){const row=this.data.messages.find(row=>row.id===event.currentTarget.dataset.id);if(row?.action?.kind==='week')handoff.send('week',{...row.action.result,openMeal:true});else if(row?.action?.kind==='recipe')platform.navigateTo({url:'/pages/recipe-edit/index?id='+encodeURIComponent(row.action.id)});},
  quickTask(event){if(this.data.busy)return;const kind=event.currentTarget.dataset.kind;if(kind==='history')return handoff.send('history',{});this.setData({input:kind==='purchase'?'我今天买了：':kind==='week'?'帮我生成本周剩余餐次的备餐计划':'根据冰箱库存推荐几道菜，先不要安排餐次'});},
  // Retired task entry points cannot replay auto-dispatched tasks from the old chat.
  openTask(){this.setData({notice:'请在对话中明确选择菜品和操作，不再自动执行旧任务。'});},continueTask(){return this.openTask();},
  clear(){platform.showModal({title:'清空对话？',content:'只清除助手聊天，库存、菜谱、计划和历史不受影响。',success:result=>{if(result.confirm){this.setData({messages:[],input:'',images:[],selectedId:'',arrangeId:'',notice:''});this.persist();}}});}
};}
module.exports={enhance,intent,candidates,resolveCandidate,recentCandidates,destination};
