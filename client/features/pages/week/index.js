const {list}=require('../../utils/list-data');
const store=require('../../utils/store');
const model=require('../../utils/model');
const dates=require('../../utils/date');
const planning=require('../../utils/planning');
const inventory=require('../../utils/inventory');
const handoff=require('../../utils/handoff');
const speech=require('../../utils/speech');
const mealStats=require('../../utils/meal-stats');
const engine=require('../../utils/meal-engine');
const recipeData=require('../../utils/recipe-data');
const sourceInput=require('../../utils/source-input');
const {lines}=recipeData;
const native=require('../../utils/native-input');
const food=require('../../utils/ingredients');
const shopping=require('../../utils/meal-shopping').list;
function historyFor(day,data){return data.history.find(row=>row.id===day.historyId)||data.history.find(row=>row.date===day.date&&row.mealSlot===day.mealSlot);}
function normalizePlan(days){return list(days).map(recipeData.normalize);}
function viewDays(days){const data=store.getData();return normalizePlan(days).map(day=>{const history=day.confirmedAt&&historyFor(day,data);return {...day,dateShort:day.date.slice(5),displayName:day.mealType==='other'?(day.otherInfo||'外食 / 其他'):(day.name||'待安排'),costText:history?(history.totalCost==null?'已计 ¥'+Number(history.knownCost||0).toFixed(2)+' · 待补价':'¥'+Number(history.totalCost).toFixed(2)):inventory.quote(day,data.fridge).text};});}
function recipeFromMeal(day,id){const servings=recipeData.numbers({servings:day.servings},['servings']).servings;const saved={id,name:day.name,source:'一周食谱确认',plannedDate:day.date,mealSlot:day.mealSlot,servings,cost:null,ingredients:lines(day.ingredients),steps:recipeData.methods(day),notes:day.notes||'',tags:['一周食谱'],sourceUrl:(day.sourceUrls||[])[0]||'',evidenceKind:day.evidenceKind||'手动编辑',proteinCategories:require('../../utils/menu-policy').proteins(day),cookingMethod:day.cookingMethod||''};const existing=store.getData().recipes.find(row=>row.id===id&&row.name===day.name);return {...saved,photoPath:day.photoPath||(existing&&existing.photoPath)||'',category:recipeData.classify(saved)};}
defineScreen(require('../../../overrides/week-input.cjs').enhance({
  data:{
    days:[],batchSteps:[],selectedIndex:0,current:null,ingredientsText:'',methodText:'',prompt:'',images:[],busy:false,notice:'',noticeType:'',stage:'',shopping:[],
    weekStart:dates.mondayOf(dates.today()),weekEnd:'',includeWeekend:false,inventoryChoices:[],inventoryIndex:0,useQuantity:'1',useUnits:['份'],useUnitIndex:0,
    costQuote:{},extraName:'',extraCost:'',servingsText:'',mealTypes:['自炒（自己做）','其他（外卖 / 堂食等）'],mealTypeIndex:0,stats:{},replaceUseId:'',frozenCostText:'',methodBusy:false,ingredientsBusy:false
  },

  onLoad() { this.voice = speech.create(this, text => { this.onText({currentTarget:{dataset:{field:'prompt'}},detail:{value:[this.data.prompt,text].filter(Boolean).join('；')}}); this.setData({prompt:this.data.prompt,voiceNotice:'已转成文字，请核对要求后生成计划。'}); }); },
  onHide() { if(this.voice)this.voice.cancel(); },
  onUnload() { if(this.voice)this.voice.dispose(); },
  voiceInput() { if(this.voice)this.voice.toggle(); },
  voiceSettings() { platform.openSetting({}); },
  onShow() {
    const currentWeek = dates.mondayOf(dates.today());
    if (!this.lastCurrentWeek || this.lastCurrentWeek !== currentWeek) this.setData({ weekStart: currentWeek, selectedIndex: 0 });
    this.lastCurrentWeek = currentWeek;
    this.load();
    const incoming = handoff.take('week');
    if (incoming && incoming.openMeal) {
      this.setData({weekStart:dates.mondayOf(incoming.date),selectedIndex:0});this.load();
      const index=this.liveDays().findIndex(day=>day.date===incoming.date&&day.mealSlot===incoming.mealSlot);if(index>=0)this.selectDay(index);
      platform.pageScrollTo({selector:'#meal-editor',duration:200});return;
    }
    if (incoming) {
      if (/下周/.test(incoming.text || '')) { this.setData({weekStart:dates.addDays(currentWeek,7),selectedIndex:0}); this.load(); }
      this.onText({currentTarget:{dataset:{field:'prompt'}},detail:{value:incoming.text || ''}});
      this.setData({prompt:this.data.prompt,images:incoming.images || [],notice:'要求与参考图片已带入，补充完成后发送即可生成。',noticeType:''});
    }
  },

  liveDays(){if(Array.isArray(this.data.days))return this.data.days;const saved=planning.getWeek(store.getData(),this.data.weekStart).days,raw=this.data.days||{},current=this.data.current;this.data.days=saved.map((day,i)=>({...day,...(raw[i]&&typeof raw[i]==='object'?raw[i]:{}),...(current&&current.id===day.id?current:{})}));return this.data.days;},
  load() {
    const data = store.getData();
    const saved = planning.getWeek(data, this.data.weekStart);
    const normalized = normalizePlan(saved.days.map(day=>{const history=(data.history||[]).find(row=>row.date===day.date&&row.mealSlot===day.mealSlot&&row.mealType==='other');if(history&&!day.confirmedAt)return {...day,mealType:'other',otherInfo:history.otherInfo||history.name||'',otherCost:history.totalCost==null?'':history.totalCost,confirmedAt:history.confirmedAt||'legacy',historyId:history.id};return day;}));
    const days = viewDays(normalized);
    const inventoryChoices = data.fridge.map(item => {const info=inventory.remainingInfo(item,data,days[this.data.selectedIndex]&&days[this.data.selectedIndex].id);return {...item,display:`${item.name}${item.type?' / '+item.type:''} · 剩${info.text} · 可安排${info.availableText}${item.portions?' / 每份¥'+(inventory.unitCost(item)==null?'待填':inventory.unitCost(item).toFixed(2)):''}`};});
    this.setData({ stats:mealStats.summary(data,this.data.weekStart,days),days, includeWeekend:!!saved.includeWeekend,inventoryChoices, weekEnd: dates.addDays(this.data.weekStart, 6), prompt: saved.prompt || '', batchSteps: saved.batchSteps, batchText: saved.batchSteps.join('\n'), shopping: shopping(days,data.history) });
    this.selectDay(this.data.selectedIndex);
  },

  moveWeek(event) { if (this.data.busy) return; this.setData({ weekStart: dates.addDays(this.data.weekStart, Number(event.currentTarget.dataset.step) * 7), selectedIndex: 0, notice: '', ocrRawText: '' }); this.load(); },
  currentWeek() { if (this.data.busy) return; this.setData({ weekStart: dates.mondayOf(dates.today()), selectedIndex: 0 }); this.load(); },
  chooseWeek(event) { if (this.data.busy) return; this.setData({ weekStart: dates.mondayOf(event.detail.value), selectedIndex: 0 }); this.load(); },
  weekend(event) { const includeWeekend=!!event.detail.value;this.setData({includeWeekend});store.update(data=>{const saved=planning.getWeek(data,this.data.weekStart);planning.putWeek(data,this.data.weekStart,saved.days,saved.batchSteps,saved.prompt);data.weeks[this.data.weekStart].includeWeekend=includeWeekend;}); },
  copyLastWeek() {
    const previous = planning.getWeek(store.getData(), dates.addDays(this.data.weekStart, -7));
    if (!previous.days.some(day => day.name||day.otherInfo)) return platform.showToast({ title: '上一周没有可复制的计划', icon: 'none' });
    platform.showModal({ title: '复制上周菜单？', content: '当前周未确认的菜单将被替换。已确认的用餐记录会保留。', success: result => {
      if (!result.confirm) return;
      const days = planning.schedule(this.data.weekStart).map((base, index) => this.data.days[index].confirmedAt ? this.data.days[index] : { ...previous.days[index], ...base, mealType:previous.days[index].mealType||'self',otherInfo:previous.days[index].otherInfo||'',otherCost:previous.days[index].otherCost==null?'':previous.days[index].otherCost, name: previous.days[index].name, side: previous.days[index].side, ingredients: previous.days[index].ingredients, prepOptions: previous.days[index].prepOptions, selectedPrepMode: previous.days[index].selectedPrepMode, methodSteps:recipeData.methods(previous.days[index]),cookSteps:recipeData.methods(previous.days[index]),cookingMethod: previous.days[index].cookingMethod, recommendationReason: previous.days[index].recommendationReason, confirmedAt: null, historyId: null, recipeId: null });
      this.saveDays(days, previous.batchSteps);
    } });
  },

  selectDay(index) {
    const current = this.liveDays()[index];
    if (!current) return;
    const data=store.getData(),history=current.confirmedAt&&historyFor(current,data);
    const inventoryChoices=data.fridge.map(item=>{const info=inventory.remainingInfo(item,data,current.id);return {...item,display:`${item.name}${item.type?' / '+item.type:''} · 剩${info.text} · 可安排${info.availableText}${item.portions?' / 每份¥'+(inventory.unitCost(item)==null?'待填':inventory.unitCost(item).toFixed(2)):''}`};});
    this.setData({
      selectedIndex: index,inventoryChoices,mealTypeIndex:current.mealType==='other'?1:0,replaceUseId:'',unlinkedRecorded:!!(history&&history.mealType!=='other'&&!(history.consumption||[]).length),frozenCostText:history?(history.totalCost==null?'金额待补':'¥'+Number(history.totalCost).toFixed(2)):'',
      current,
      ingredientsText: (current.ingredients || []).join('\n'),
      methodText:current.cookSteps.join('\n'),costQuote: inventory.quote(current, store.getData().fridge),
      servingsText: current.servings == null ? '' : String(current.servings)
    });
    this.chooseInventory({ detail: { value: Math.min(this.data.inventoryIndex, Math.max(0, this.data.inventoryChoices.length - 1)) } });
  },

  tapDay(event) { this.selectDay(Number(event.currentTarget.dataset.index)); platform.pageScrollTo({ selector: '#meal-editor', duration: 250 }); },

  chooseMealType(event){this.changeCurrent({mealType:Number(event.detail.value)===1?'other':'self'});},
  editMethod(event){const text=event.detail.value;native.capture(this,'methodText',text);this.saveInput({methodSteps:lines(text),cookSteps:lines(text)});},
  async generateMethod(){
    if(this.data.methodBusy)return;
    let mode=0;
    if(this.data.methodText.trim()){try{mode=await new Promise((resolve,reject)=>platform.showActionSheet({itemList:['替换现有做法','追加到现有做法'],success:r=>resolve(r.tapIndex),fail:reject}));}catch(error){return;}}
    const before=this.data.methodText,day={...this.data.current};this.setData({methodBusy:true,notice:'正在根据本餐用料生成现做步骤…',noticeType:''});
    try{const result=await engine.makeMethod(day,this.data.prompt);if(this.data.current.id!==day.id||this.data.methodText!==before||JSON.stringify(this.data.current.ingredients)!==JSON.stringify(day.ingredients)||this.data.current.name!==day.name||this.data.current.servings!==day.servings)throw Error('生成期间餐次或做法已被编辑，未覆盖你的文字，请重新生成');const text=(mode===1&&before?before+'\n':'')+result.join('\n');this.editMethod({detail:{value:text}});this.setData({methodText:text,notice:'做法已生成，可继续编辑；尚未记为已吃。',noticeType:'success'});}catch(error){this.setData({notice:error.message,noticeType:'error'});}finally{this.setData({methodBusy:false});}
  },
  replaceUse(event){const use=(this.data.current.ingredientUses||[]).find(row=>row.id===event.currentTarget.dataset.id);if(!use)return;const index=this.data.inventoryChoices.findIndex(row=>row.id===use.inventoryId);this.chooseInventory({detail:{value:Math.max(0,index)}});this.setData({replaceUseId:use.id,useQuantity:String(use.quantity),notice:'请选择正确采购批次、核对数量与单位，再点“替换这项用量”。',noticeType:''});platform.pageScrollTo({selector:'#inventory-use-picker',duration:200});},
  cancelReplaceUse(){this.setData({replaceUseId:''});},
  costInput(event) { native.capture(this,event.currentTarget.dataset.field,event.detail.value); },
  chooseInventory(event) {
    const inventoryIndex = Number(event.detail.value); const item = this.data.inventoryChoices[inventoryIndex];
    const useUnits=item?Array.from(new Set((Number(item.portions)>0?['份']:[]).concat(item.physicalUnit&&item.physicalAmount?[item.physicalUnit]:[],[item.unit||'g']))):['份'];
    this.setData({ inventoryIndex, useUnits, useUnitIndex: 0 });
  },
  chooseUseUnit(event) { this.setData({ useUnitIndex: Number(event.detail.value) }); },
  addUse() {
    const item = this.data.inventoryChoices[this.data.inventoryIndex];
    if (!item) return platform.showToast({ title: '请先在冰箱中录入食材', icon: 'none' });
    const use = { id: store.id('use'), inventoryId: item.id, name: [item.name,item.type].filter(Boolean).join(' · '), quantity: Number(this.data.useQuantity), unit: this.data.useUnits[this.data.useUnitIndex] };
    try {
      const own = (this.data.current.ingredientUses || []).filter(row => row.inventoryId === item.id && row.id!==this.data.replaceUseId).reduce((n, row) => n + inventory.fraction(row, item), 0);
      const prior = (store.getData().history.find(row => row.id === this.data.current.historyId) || {}).consumption || [];
      const credited = prior.filter(row => row.inventoryId === item.id).reduce((n, row) => n + row.fraction, 0);
      if (inventory.fraction(use, item) + own + inventory.allocated(store.getData(), item.id, this.data.current.id) > inventory.balance(item) + credited + 0.000001) throw new Error('这批食材已用完或已分配给其他餐次，请调整用量');
      const ingredients=this.data.current.ingredients.slice();if(!ingredients.some(line=>food.rank(food.parse(line).name,item)>0))ingredients.push([item.name,item.type].filter(Boolean).join(' ')+' '+use.quantity+use.unit);
      this.changeCurrent({ingredients,ingredientUses:(this.data.current.ingredientUses||[]).filter(row=>row.id!==this.data.replaceUseId).concat(use)});
      this.setData({replaceUseId:''});
    } catch (error) { platform.showToast({ title: error.message, icon: 'none' }); }
  },
  removeUse(event) { this.changeCurrent({ ingredientUses: (this.data.current.ingredientUses || []).filter(row => row.id !== event.currentTarget.dataset.id) }); },
  async identifyIngredients(){
    if(this.data.ingredientsBusy)return;const day={...this.data.current},before=this.data.ingredientsText;this.setData({ingredientsBusy:true,notice:'正在根据菜名整理建议用料…',noticeType:''});
    try{const result=await engine.ingredientsFor(day);if(this.data.current.id!==day.id||this.data.current.name!==day.name||this.data.ingredientsText!==before)throw Error('识别期间菜名或用料已被编辑，未覆盖你的内容');this.changeCurrent({ingredients:result.ingredients,ingredientUses:[],matchWarnings:[]});this.matchIngredientUses();this.setData({notice:'已按菜名整理建议用料并匹配库存，请核对用量。'+result.notes,noticeType:''});}catch(error){this.setData({notice:error.message,noticeType:'error'});}finally{this.setData({ingredientsBusy:false});}
  },
  matchIngredientUses() {
    if(!this.data.current.ingredients.length&&this.data.current.name.trim())return this.identifyIngredients();
    const data = store.getData(), day = this.data.current;
    const uses=inventory.reconcileUses(day.ingredients,data.fridge,day.ingredientUses||[]);
    const matched=inventory.matchLines(day.ingredients,data.fridge,uses);
    matched.uses.forEach(use => {
      const item = data.fridge.find(row => row.id === use.inventoryId);
      const own = uses.filter(row => row.inventoryId === item.id).reduce((n, row) => n + inventory.fraction(row, item), 0);
      if (inventory.fraction(use, item) + own + inventory.allocated(data, item.id, day.id) > inventory.balance(item) + 0.000001) matched.issues.push(item.name + '库存不足或已安排给其他餐');
      else uses.push({ ...use, id: store.id('use') });
    });
    this.changeCurrent({ingredientUses:uses,matchWarnings:matched.issues});
    this.setData({ notice: matched.issues.length ? matched.issues.join('；') : '已匹配可唯一确定的库存，请核对本餐成本明细。', noticeType: '' });
    platform.showToast({ title: matched.issues.length ? '部分食材需手动选择' : '已匹配库存', icon: 'none' });
  },
  addExtra() {
    const name = this.data.extraName.trim(), cost = inventory.number(this.data.extraCost);
    if (!name || cost == null || cost < 0) return platform.showToast({ title: '请填写名称和有效金额', icon: 'none' });
    this.changeCurrent({ extraCosts: (this.data.current.extraCosts || []).concat({ id: store.id('extra'), name, cost }) });
    this.setData({ extraName: '', extraCost: '' });
  },
  removeExtra(event) { this.changeCurrent({ extraCosts: (this.data.current.extraCosts || []).filter(row => row.id !== event.currentTarget.dataset.id) }); },
  changeCurrent(patch) { this.saveDays(this.liveDays().map((day, index) => index === this.data.selectedIndex ? { ...day, ...patch } : day)); },

  confirmMeal() {
    const day = this.data.current;
    if (!day) return;
    if(day.mealType==='other')return this.confirmOther();
    if (!day.name.trim()) return platform.showToast({ title: '请先填写实际吃的菜名', icon: 'none' });
    platform.showModal({
      title: day.confirmedAt ? '更新这餐的记录？' : '确认已经吃过？',
      content: `${day.date} ${day.mealSlot} · ${day.name}\n确认后会同时写入“我的菜谱”和“历史清单”。`,
      confirmText: day.confirmedAt ? '更新记录' : '确认已吃',
      confirmColor: '#285b43',
      success: result => {
        if (!result.confirm) return;
        try {
        const confirmedAt = new Date().toISOString();
        const data = store.getData();
        const existingHistory = (data.history || []).find(item => item.date === day.date && item.mealSlot === day.mealSlot);
        const recipeId = (existingHistory && existingHistory.recipeId) || day.recipeId || store.id('recipe');
        const historyId = (existingHistory && existingHistory.id) || day.historyId || store.id('history');
        const savedRecipe = recipeFromMeal(day, recipeId);
        const costQuote = inventory.quote(day, data.fridge);
        savedRecipe.cost = costQuote.total;
        savedRecipe.knownCost = costQuote.known;
        const consumption = inventory.applyConsumption(data, existingHistory, day.ingredientUses || []);
        const recipeIndex = (data.recipes || []).findIndex(item => item.id === recipeId);
        if (recipeIndex >= 0) data.recipes[recipeIndex] = savedRecipe;
        else data.recipes.unshift(savedRecipe);
        data.history = (data.history || []).filter(item => !(item.date === day.date && item.mealSlot === day.mealSlot));
        data.history.unshift({
          id: historyId,
          date: day.date,
          mealSlot: day.mealSlot,
          recipeId,
          name: savedRecipe.name,
          totalCost: savedRecipe.cost,
          unitPrice: savedRecipe.cost != null && savedRecipe.servings ? Number((savedRecipe.cost / savedRecipe.servings).toFixed(2)) : null,
          proteinCategories: savedRecipe.proteinCategories,
          mealType:'self',source: '一周食谱',
          confirmedAt, consumption, recipeSnapshot: savedRecipe, costDetails: costQuote.details,
          extraCosts: day.extraCosts || [], knownCost: costQuote.known, pendingCostItems: costQuote.missing
        });
        const updated = this.liveDays().map(item => item.id === day.id ? { ...item, confirmedAt, historyId, recipeId } : item);
        planning.putWeek(data, this.data.weekStart, updated, this.data.batchSteps, this.data.prompt);
        store.setData(data);
        this.load();
        this.setData({ notice: `已记录：${savedRecipe.name}。可到“更多 → 做饭记录”查看。`, noticeType: 'success' });
        platform.showToast({ title: day.confirmedAt ? '记录已更新' : '已记入历史', icon: 'success' });
        } catch (error) { platform.showToast({ title: error.message || '记录未保存', icon: 'none' }); }
      }
    });
  },

  confirmOther(){
    const day=this.data.current,amount=inventory.number(day.otherCost);
    if(day.otherCost!==''&&day.otherCost!=null&&(amount==null||amount<0))return platform.showToast({title:'金额请填不小于0的数字，未知可留空',icon:'none'});
    platform.showModal({title:day.confirmedAt?'更新这餐其他用餐？':'确认这餐已吃？',content:day.date+' '+day.mealSlot+' · '+(day.otherInfo||'外食 / 其他')+' · '+(amount==null?'金额待填写':'¥'+amount.toFixed(2))+'。只保存用餐记录，不生成菜谱、不扣库存；如替换原自炒记录，会返还原耗材。',success:result=>{if(!result.confirm)return;try{store.update(data=>{const previous=data.history.find(row=>row.date===day.date&&row.mealSlot===day.mealSlot);if(previous)inventory.applyConsumption(data,previous,[]);const historyId=previous&&previous.id||store.id('history'),confirmedAt=new Date().toISOString();const history={id:historyId,date:day.date,mealSlot:day.mealSlot,name:String(day.otherInfo||'外食 / 其他'),mealType:'other',otherInfo:day.otherInfo||'',totalCost:amount,unitPrice:null,consumption:[],confirmedAt,source:'一周食谱'};data.history=data.history.filter(row=>!(row.date===day.date&&row.mealSlot===day.mealSlot));data.history.unshift(history);planning.putWeek(data,this.data.weekStart,this.liveDays().map(row=>row.id===day.id?{...row,confirmedAt,historyId,recipeId:null}:row),this.data.batchSteps,this.data.prompt);});this.load();this.setData({notice:'其他用餐已记录；未扣库存、未生成空菜谱。',noticeType:'success',stage:''});platform.showToast({title:'已记录',icon:'success'});}catch(error){platform.showToast({title:error.message||'保存失败',icon:'none'});}}});
  },
  openHistory() { platform.navigateTo({ url: '/pages/history/index' }); },
  copySource(event){const url=event.currentTarget.dataset.url;if(/^https?:\/\//i.test(url||''))platform.setClipboardData({data:url});},

  saveDays(days, batchSteps = this.data.batchSteps) {
    const clean = normalizePlan(days).map(({ dateShort,displayName,costText,selectedPrepIndex,aiRecommendedLabel,...day }) => day);
    store.update(data => { planning.putWeek(data, this.data.weekStart, clean, batchSteps, this.data.prompt); });
    this.load();
  },

  // Persist the logic-side draft without reloading or echoing the focused native input.
  saveInput(patch){
    const index=this.data.selectedIndex,current={...this.data.current,...patch};this.data.current=current;this.data.days=this.liveDays();this.data.days[index]=current;
    try{
      store.update(data=>{const saved=planning.getWeek(data,this.data.weekStart);const clean=recipeData.normalize(current);['dateShort','displayName','costText'].forEach(key=>delete clean[key]);planning.putWeek(data,this.data.weekStart,saved.days.map(day=>day.id===current.id?clean:day),saved.batchSteps,saved.prompt);});
      const data=store.getData(),quote=inventory.quote(current,data.fridge),history=current.confirmedAt&&historyFor(current,data);
      this.setData({stats:mealStats.summary(data,this.data.weekStart,this.data.days),costQuote:quote,shopping:shopping(this.data.days,data.history),['days['+index+'].displayName']:current.mealType==='other'?(current.otherInfo||'外食 / 其他'):(current.name||'待安排'),['days['+index+'].costText']:history?(history.totalCost==null?'金额待补':'¥'+Number(history.totalCost).toFixed(2)):quote.text});
    }catch(error){this.setData({notice:error.message||'保存失败，输入仍保留',noticeType:'error'});}
  },
  editField(event){this.saveInput({[event.currentTarget.dataset.field]:event.detail.value});},
  editLines(event){
    const field=event.currentTarget.dataset.field,value=event.detail.value,values=lines(value),patch={[field]:values};
    if(field==='ingredients'){native.capture(this,'ingredientsText',value);patch.ingredientUses=inventory.reconcileUses(values,store.getData().fridge,this.data.current.ingredientUses||[]);patch.matchWarnings=[];}
    this.saveInput(patch);
  },
  onText(event){const field=event.currentTarget.dataset.field||'prompt',value=event.detail.value,text=field==='prompt'?value:[this.data.prompt,value].filter(Boolean).join('\n');native.capture(this,'prompt',text);try{store.update(data=>{const saved=planning.getWeek(data,this.data.weekStart);planning.putWeek(data,this.data.weekStart,saved.days,saved.batchSteps,text);});}catch(error){this.setData({notice:error.message,noticeType:'error'});}},
  async addImages(){try{const added=await model.chooseImages(6-this.data.images.length);this.setData({images:this.data.images.concat(added).slice(0,6)});}catch(error){this.setData({notice:error.message,noticeType:'error'});}},
  removeImage(event){this.setData({images:this.data.images.filter((_,i)=>i!==Number(event.currentTarget.dataset.index))});},
  async regenerate(){
    if(this.data.busy)return;
    if(!this.data.prompt.trim()&&!this.data.images.length)return this.setData({notice:'请输入要求或添加参考图片。',noticeType:'error'});
    this.setData({busy:true,notice:'',noticeType:''});
    try{const text=this.data.prompt,kind=engine.requestKind(text);const result=await engine.generate(text,this.data.images,{kind,weekStart:this.data.weekStart,includeWeekend:this.data.includeWeekend,progress:stage=>this.setData({stage})});this.setData({weekStart:result.weekStart});this.load();const index=this.data.days.findIndex(day=>day.date===result.date&&day.mealSlot===result.mealSlot);if(index>=0)this.selectDay(index);this.setData({notice:'已生成'+result.count+'餐草稿，库存尚未扣减。'+(result.warnings.length?'部分用料需核对采购批次/补购。':''),noticeType:'success',images:[]});}
    catch(error){this.setData({notice:error.message||'生成失败，原计划保留',noticeType:'error'});}
    finally{this.setData({busy:false,stage:''});}
  }
}));
