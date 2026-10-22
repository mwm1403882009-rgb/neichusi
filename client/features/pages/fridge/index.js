const photos=require('../../utils/photos');
const {list}=require('../../utils/list-data');
const native=require('../../utils/native-input');
const store = require('../../utils/store');
const model = require('../../utils/model');
const dates = require('../../utils/date');
const inventory = require('../../utils/inventory');
const stock = require('../../utils/stock');
const handoff = require('../../utils/handoff');
const speech = require('../../utils/speech');
const frequent=require('../../utils/frequent-stock');
function blank() { return { name:'',type:'',originalName:'',amount:'',unit:'g',totalPrice:'',portions:'',physicalAmount:'',physicalUnit:'',purchaseDate:dates.today(),stockedDate:dates.today(),shelfDays:'',expiryMode:'days',shelfStart:'purchase',expiryDate:'',storageMode:'',platform:'' }; }
function decorate(item, data) {
  const row=stock.normalize(item),remaining=inventory.remainingInfo(row,data),days=row.expiryDate?dates.daysUntil(row.expiryDate):null,p=inventory.priceUnit(row),unitCost=inventory.unitCost(row);
  return {...row,...photos.view(row),cartName:[row.name,row.type].filter(Boolean).join(' · '),cartPrice:frequent.price(row,remaining.unit),isFrequent:(data.frequentStock||[]).some(item=>frequent.key(item)===frequent.key(row)),totalPrice:row.totalPrice==null?'':row.totalPrice,portions:row.portions||'',status:days==null?'期限待填':days<0?'已过期'+Math.abs(days)+'天':days===0?'今天到期':'剩'+days+'天',urgent:days!=null&&days<=2,
    remainingEstimated:remaining.estimated,balanceExplanation:remaining.estimated?'由旧剩余比例 '+(inventory.balance(row)*100).toFixed(2)+'% 换算，未核对实物；不要直接当作剩余只数。':'',remainingText:remaining.text,remainingValue:remaining.actual,remainingUnit:remaining.unit,rawRemainingText:remaining.rawText,allocatedText:remaining.reservedText,availableText:remaining.availableText,stockConflict:remaining.reserved>remaining.actual,
    unitCostText:unitCost==null?(p&&!['500g','500ml'].includes(p.unit)?'¥'+p.value.toFixed(2)+'/'+p.unit:'分装份数/价格待填写'):'¥'+unitCost.toFixed(2)+'/份',priceText:p?'¥'+p.value.toFixed(2)+'/'+p.unit:'单价待确认'};
}
function fingerprint(row) { const text=[row.orderId||row.purchaseDate,inventory.key(row.name),inventory.key(row.type),row.amount,row.unit,row.totalPrice,row.platform].join('|');let hash=2166136261;for(let i=0;i<text.length;i+=1){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return 'receipt-'+(hash>>>0).toString(16); }
defineScreen({
  data:{view:'inventory',frequentItems:[],showAdd:false,showReceipt:false,editingFrequentId:'',frequentDraft:{},frequentErrors:{},swipeId:'',swipeOffset:0,dragging:false,items:[],draft:blank(),draftErrors:{},notice:'',receiptNotice:'',busy:false,saving:false,images:[],rawText:'',receiptRows:[],receiptWarnings:[],receiptReviewed:false,intakeText:'',recording:false,voiceBusy:false,voiceNotice:'',expandedId:'',adjustValues:{},adjustReasons:{},itemNotices:{},revisionValues:{},revisionReasons:{}},
  onLoad(){this.voice=speech.create(this,text=>{this.setData({intakeText:this.data.intakeText?this.data.intakeText+'\n'+text:text});this.persist();});},
  onShow(){
    if(!this.restored){const saved=platform.getStorageSync('ysf-fridge-drafts-v2');if(saved)this.setData({...saved,receiptRows:list(saved.receiptRows)});this.edits=platform.getStorageSync('ysf-fridge-edits-v2')||{};this.restored=true;}
    this.load();
    const incoming=handoff.take('fridge');
    if(incoming){this.setData({view:'inventory',showReceipt:true,intakeText:incoming.text||'',images:incoming.images||[],receiptNotice:'已带入识别需求，请核对原话后点“整理采购草稿”。'});this.persist();platform.pageScrollTo({selector:'#receipt-import',duration:200});if(incoming.prepareDraft)this.recognize();}
  },
  onHide(){if(this.voice)this.voice.cancel();this.closeSwipe();this.persist();},
  onUnload(){if(this.voice)this.voice.dispose();},
  persist(){platform.setStorageSync('ysf-fridge-drafts-v2',{draft:this.data.draft,receiptRows:this.data.receiptRows,rawText:this.data.rawText,intakeText:this.data.intakeText,receiptWarnings:this.data.receiptWarnings});platform.setStorageSync('ysf-fridge-edits-v2',this.edits||{});},
  load(){const data=store.getData();this.setData({frequentItems:(data.frequentStock||[]).map(item=>{const unit=Number(item.physicalAmount)>0&&item.physicalUnit?item.physicalUnit:Number(item.portions)>0?'份':item.unit;return {...item,...photos.view(item),cartName:[item.name,item.type].filter(Boolean).join(' · '),cartPrice:frequent.price(item,unit),quantityText:(Number(item.physicalAmount)>0&&item.physicalUnit?item.physicalAmount:Number(item.portions)>0?item.portions:item.amount)+unit};}),items:data.fridge.map(item=>({...decorate({...item,...(this.edits||{})[item.id]},data),dirty:!!Object.keys((this.edits||{})[item.id]||{}).length,needsBasisRevision:((Number(item.consumedFraction)||0)>0||(item.adjustments||[]).length>0)&&['amount','unit','portions','physicalAmount','physicalUnit'].some(field=>Object.prototype.hasOwnProperty.call((this.edits||{})[item.id]||{},field)&&String(this.edits[item.id][field])!==String(item[field]==null?'':item[field])),notice:this.data.itemNotices[item.id]||'',adjustmentRows:(item.adjustments||[]).slice(0,5).map(row=>({...row,dateText:row.at.slice(0,10),valueText:inventory.round(row.quantity)+row.unit}))})).sort((a,b)=>(a.expiryDate||'9999').localeCompare(b.expiryDate||'9999'))});},
  draftChange(event){native.capture(this,'draft.'+event.detail.field,event.detail.value);this.setData({draftErrors:{}});this.persist();},
  input(event){native.capture(this,'intakeText',event.detail.value);this.persist();},
  voiceInput(){if(!this.voice)this.onLoad();this.voice.toggle();},
  voiceSettings(){speech.settings();},
  feedback(message,receipt){this.setData(receipt?{receiptNotice:message}:{notice:message});platform.showToast({title:message.slice(0,35),icon:'none'});},
  add(){
    try{const row=stock.validate(this.data.draft);row.id=store.id('fridge');row.consumedFraction=0;store.update(data=>{data.fridge.unshift(row);inventory.syncPurchase(data,row,store.id);});this.setData({draft:blank(),draftErrors:{}});this.feedback('已加入库存，并同步采购单价。');this.persist();this.load();}
    catch(error){this.setData({draftErrors:{[error.field||'name']:error.message}});this.feedback(error.message);}
  },
  expand(event){if(this.ignoreTap){this.ignoreTap=false;return;}if(this.data.swipeId){this.closeSwipe();return;}this.setData({expandedId:this.data.expandedId===event.currentTarget.dataset.id?'':event.currentTarget.dataset.id});},
  edit(event){
    const id=event.currentTarget.dataset.id,field=event.detail.field;this.edits=this.edits||{};this.edits[id]={...this.edits[id],[field]:event.detail.value};this.persist();
    if(event.detail.input===false){this.load();return;}
    const index=list(this.data.items).findIndex(row=>row.id===id),original=store.getData().fridge.find(row=>row.id===id);if(index<0||!original)return;
    this.data.items[index][field]=event.detail.value;const decorated=decorate({...original,...this.edits[id]},store.getData()),update={};
    ['cartName','cartPrice','remainingText','remainingEstimated','balanceExplanation','unitCostText','priceText','status','urgent','rawRemainingText','allocatedText','availableText','remainingUnit'].forEach(key=>{update['items['+index+'].'+key]=decorated[key];});
    const basis=['amount','unit','portions','physicalAmount','physicalUnit'];Object.assign(update,{['items['+index+'].dirty']:true,['items['+index+'].needsBasisRevision']:((Number(original.consumedFraction)||0)>0||(original.adjustments||[]).length>0)&&basis.some(key=>Object.prototype.hasOwnProperty.call(this.edits[id],key)&&String(this.edits[id][key])!==String(original[key]==null?'':original[key]))});this.setData(update);
  },
  discardItem(event){const id=event.currentTarget.dataset.id;if(this.edits)delete this.edits[id];this.setData({itemNotices:{...this.data.itemNotices,[id]:'已放弃未保存修改，可直接校正实际剩余。'}});this.persist();this.load();},
  saveItem(event){
    const id=event.currentTarget.dataset.id,changes=(this.edits||{})[id]||{},original=store.getData().fridge.find(row=>row.id===id);
    if(!original)return;
    try{
      const updated=stock.validate({...original,...changes}),basisFields=['amount','unit','portions','physicalAmount','physicalUnit'];
      const revision=((Number(original.consumedFraction)||0)>0||(original.adjustments||[]).length>0)&&basisFields.some(field=>Object.prototype.hasOwnProperty.call(changes,field)&&String(updated[field]==null?'':updated[field])!==String(original[field]==null?'':original[field]));
      const unit=inventory.remainingInfo(updated).unit;
      const finish=()=>{
        store.update(data=>{const item=data.fridge.find(row=>row.id===id);if(!item)throw Error('该库存已移除');if(revision)inventory.reviseBasis(data,id,changes,this.data.revisionValues[id],unit,this.data.revisionReasons[id],store.id);else{Object.assign(item,updated);inventory.syncPurchase(data,item,store.id);}});
        if(this.edits)delete this.edits[id];const values={...this.data.revisionValues};delete values[id];
        this.setData({revisionValues:values,itemNotices:{...this.data.itemNotices,[id]:revision?'采购信息与实际剩余已修正并留痕；历史金额未修改。':'已保存。未确认食谱会按该批次最新价格重算，历史金额保持不变。'}});this.persist();this.load();this.feedback('这批库存已保存。');
      };
      if(revision){
        const remaining=this.data.revisionValues[id];
        if(remaining==null||String(remaining).trim()===''){this.setData({itemNotices:{...this.data.itemNotices,[id]:'不能直接改写已使用批次：请在采购修正区填写修正后的实际剩余，再保存；也可放弃修改后单独校正剩余。'}});this.load();return;}
        if(inventory.number(remaining)==null||Number(remaining)<0)throw Error('修正后的实际剩余请填写有效非负数字');
        platform.showModal({title:'核对采购信息修正',content:'原 '+original.amount+original.unit+' / '+(original.portions||'未分装')+'份 → '+updated.amount+updated.unit+' / '+(updated.portions||'未分装')+'份；实际剩余 '+remaining+unit+'。原历史金额及旧消耗比例保留，不反推只数。补货请取消并新增采购批次。',confirmText:'确认修正',success:result=>{if(!result.confirm)return;try{finish();}catch(error){this.setData({itemNotices:{...this.data.itemNotices,[id]:error.message}});this.load();}}});
      }else finish();
    }catch(error){this.setData({itemNotices:{...this.data.itemNotices,[id]:error.message}});this.load();this.feedback(error.message);}
  },
  adjustmentInput(event){const id=event.currentTarget.dataset.id,field=event.currentTarget.dataset.field;native.capture(this,field+'.'+id,event.detail.value);},
  adjustStock(event){const id=event.currentTarget.dataset.id;if(Object.keys((this.edits||{})[id]||{}).length){platform.showModal({title:'这批有未保存修改',content:'可以继续完成下方采购修正，或放弃未保存修改后校正实际剩余。',confirmText:'放弃并校正',cancelText:'继续编辑',success:r=>{if(r.confirm){this.discardItem({currentTarget:{dataset:{id}}});this.adjustStock(event);}}});return;}const original=store.getData().fridge.find(row=>row.id===id);if(!original)return;const info=inventory.remainingInfo(original),value=this.data.adjustValues[id],reason=this.data.adjustReasons[id]||'已吃但未记餐 / 实际盘点校正';if(value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0){this.setData({itemNotices:{...this.data.itemNotices,[id]:'请填写实际剩余数量（不小于0）。'}});this.load();return;}platform.showModal({title:'校正这批实际剩余？',content:original.name+'：'+info.text+' → '+value+info.unit+'。只改实际库存，原采购总价、单价及历史用餐保持不变；未记餐消耗不会编造用餐记录。',success:result=>{if(!result.confirm)return;try{let updated;store.update(data=>{updated=inventory.adjustRemaining(data,id,value,info.unit,reason,store.id);});const values={...this.data.adjustValues};delete values[id];this.setData({adjustValues:values,itemNotices:{...this.data.itemNotices,[id]:'已校正为'+updated.text+(updated.reserved>updated.actual?'；已安排用量超过实际剩余，请到一周食谱调整。':'，采购单价保持不变。')}});this.load();}catch(error){this.setData({itemNotices:{...this.data.itemNotices,[id]:error.message}});this.load();}}});},
  remove(event){const id=event.currentTarget.dataset.id;this.closeSwipe();if(inventory.allocated(store.getData(),id)>0)return this.feedback('这批食材已安排进备餐，请先移除对应餐次用量。');platform.showModal({title:'删除这批库存？',content:'只移除这批实际库存，采购价格、已吃记录和常买模板仍保留。',success:result=>{if(!result.confirm)return;try{store.update(data=>{if(inventory.allocated(data,id)>0)throw Error('这批已安排进食谱，请先取消对应用量');data.fridge=data.fridge.filter(row=>row.id!==id);});if(this.edits)delete this.edits[id];if(this.data.expandedId===id)this.setData({expandedId:''});this.persist();this.load();this.feedback('已删除这批库存；采购历史保留，如有删除前备份可恢复。');}catch(error){this.feedback(error.message);}}});},
  switchView(event){this.closeSwipe();this.setData({view:event.currentTarget.dataset.view,showAdd:false,showReceipt:false,editingFrequentId:'',expandedId:''});this.load();},
  photoError(event){const id=event.currentTarget.dataset.id,scope=event.currentTarget.dataset.scope==='frequent'?'frequentItems':'items',index=list(this.data[scope]).findIndex(row=>row.id===id);if(index>=0)this.setData({[scope+'['+index+'].photoFailed']:true});},
  toggleAdd(){const showAdd=!this.data.showAdd;this.setData({view:'inventory',showAdd,showReceipt:false},()=>{if(showAdd)this.scrollPanel('#stock-add');});},
  toggleReceipt(){const showReceipt=!this.data.showReceipt;this.setData({view:'inventory',showReceipt,showAdd:false,receiptNotice:showReceipt?'可添加小票图片、语音转文字，或直接输入采购内容。':this.data.receiptNotice},()=>{if(showReceipt)this.scrollPanel('#receipt-import');});},
  scrollPanel(selector){const run=()=>platform.pageScrollTo({selector,duration:180,fail:()=>this.feedback('面板已展开，请向上查看；如仍不可见请重新进入库存。')});if(platform.nextTick)platform.nextTick(run);else run();},
  closeSwipe(){this.setData({swipeId:'',swipeOffset:0,dragging:false});this.gesture=null;},
  rowStart(event){const point=event.touches&&event.touches[0];if(!point)return;const id=event.currentTarget.dataset.id;if(this.data.swipeId&&this.data.swipeId!==id)this.closeSwipe();this.ignoreTap=false;let width=375;try{if(platform.getWindowInfo)width=platform.getWindowInfo().windowWidth||375;}catch(error){}this.gesture={id,x:point.clientX,y:point.clientY,start:this.data.swipeId===id?this.data.swipeOffset:0,ratio:750/width,axis:''};},
  rowMove(event){const point=event.touches&&event.touches[0],gesture=this.gesture;if(!point||!gesture)return;const dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;if(!gesture.axis){if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;gesture.axis=Math.abs(dx)>Math.abs(dy)*1.2?'horizontal':'vertical';}if(gesture.axis!=='horizontal')return;this.setData({swipeId:gesture.id,swipeOffset:Math.max(-288,Math.min(288,gesture.start+dx*gesture.ratio)),dragging:true});},
  rowEnd(){const gesture=this.gesture;if(gesture&&gesture.axis==='horizontal'){this.ignoreTap=true;const offset=this.data.swipeOffset;this.setData({swipeId:Math.abs(offset)>90?gesture.id:'',swipeOffset:Math.abs(offset)>90?(offset>0?288:-288):0,dragging:false});}this.gesture=null;},
  rowCancel(){this.ignoreTap=false;this.closeSwipe();},
  rowActions(event){this.ignoreTap=false;const id=event.currentTarget.dataset.id;this.setData({swipeId:this.data.swipeId===id?'':id,swipeOffset:this.data.swipeId===id?0:-288,dragging:false});},
  markFrequent(event){const id=event.currentTarget.dataset.id;this.closeSwipe();const data=store.getData(),item=data.fridge.find(row=>row.id===id);if(!item)return;if(Object.keys((this.edits||{})[id]||{}).length)return this.feedback('请先保存这批修改，再设为常买');const existing=(data.frequentStock||[]).find(row=>frequent.key(row)===frequent.key(item));if(existing){this.setData({view:'frequent'});this.editFrequent({currentTarget:{dataset:{id:existing.id}}});return;}try{store.update(data=>frequent.save(data,item,store.id));this.load();this.feedback('已加入常买，模板信息可修改。');}catch(error){this.feedback(error.message);}},
  editFrequent(event){this.closeSwipe();const row=(store.getData().frequentStock||[]).find(row=>row.id===event.currentTarget.dataset.id);if(!row)return;this.setData({view:'frequent',editingFrequentId:row.id,frequentDraft:frequent.purchase(row),frequentErrors:{}});platform.pageScrollTo({selector:'#frequent-editor',duration:180});},
  frequentChange(event){native.capture(this,'frequentDraft.'+event.detail.field,event.detail.value);this.setData({frequentErrors:{}});},
  saveFrequent(){try{store.update(data=>frequent.save(data,this.data.frequentDraft,store.id,this.data.editingFrequentId));this.setData({editingFrequentId:'',frequentErrors:{}});this.load();this.feedback('常买信息已保存，实际库存和历史账单未修改。');}catch(error){this.setData({frequentErrors:{[error.field||'name']:error.message}});this.feedback(error.message);}},
  cancelFrequent(){this.setData({editingFrequentId:'',frequentErrors:{}});},
  removeFrequent(event){const id=event.currentTarget.dataset.id;platform.showModal({title:'取消这项常买？',content:'只移除补货模板，不删除实际库存，也不更改历史。',success:result=>{if(!result.confirm)return;try{store.update(data=>{data.frequentStock=(data.frequentStock||[]).filter(row=>row.id!==id);});if(this.data.editingFrequentId===id)this.setData({editingFrequentId:''});this.load();this.feedback('已取消常买，库存未变。');}catch(error){this.feedback(error.message);}}});},
  buyFrequent(event){const row=(store.getData().frequentStock||[]).find(row=>row.id===event.currentTarget.dataset.id);if(!row)return;this.closeSwipe();this.setData({view:'inventory',showAdd:true,draft:{...blank(),...frequent.purchase(row)},draftErrors:{},notice:'已沿用常买基本信息。请核对本次价格、采购数量和日期，再确认加入新批次；尚未增加库存。'});platform.pageScrollTo({selector:'#stock-add',duration:180});},
  changeQuantity(event){const id=event.currentTarget.dataset.id,step=Number(event.currentTarget.dataset.step),item=store.getData().fridge.find(row=>row.id===id);if(!item||![-1,1].includes(step))return;this.closeSwipe();if(Object.keys((this.edits||{})[id]||{}).length)return this.feedback('请先保存或放弃这批未保存修改，再盘点数量');const info=inventory.remainingInfo(item),next=inventory.round(info.actual+step);if(info.estimated)return this.setData({expandedId:id,itemNotices:{...this.data.itemNotices,[id]:'当前数量由旧比例估算，请在下方填写实际盘点数量。'}});if(next<0)return this.feedback('库存剩余不能小于0');platform.showModal({title:'盘点调整剩余数量？',content:item.name+'：'+info.text+' → '+next+info.unit+'。这不是新采购；仅调整实际库存，不修改原采购价格或用餐历史。补货请新增采购批次。',success:result=>{if(!result.confirm)return;try{store.update(data=>inventory.adjustRemaining(data,id,next,info.unit,'购物清单手动盘点',store.id));this.load();this.feedback('剩余数量已调整。');}catch(error){this.feedback(error.message);}}});},
  async addImages(){try{const added=await model.chooseImages(6-this.data.images.length);this.setData({images:this.data.images.concat(added).slice(0,6)});}catch(error){this.feedback(error.message,true);}},
  removeImage(event){this.setData({images:this.data.images.filter((_,index)=>index!==Number(event.currentTarget.dataset.index))});},
  async recognize(){
    if(this.data.busy)return;
    if(!this.data.images.length&&!this.data.intakeText.trim())return this.feedback('请先添加小票图片，或输入买了什么。',true);
    this.setData({busy:true,receiptNotice:'正在整理采购内容，现有草稿会保留…'});
    try{
      const settings=store.getSettings(),key=model.getApiKey();let result,rawText=this.data.intakeText;
      if(this.data.images.length){
        const evidence=[];
        for(let i=0;i<this.data.images.length;i+=1){const read=await model.call(settings,key,'receiptOcr',{page:i+1},[this.data.images[i]]);evidence.push('图片'+(i+1)+'\n'+(read.rawText||''));}
        rawText=evidence.join('\n\n')+(this.data.intakeText?'\n用户补充：'+this.data.intakeText:'');
        result=await model.call(settings,key,'receipt',{rawText});
      }else result=await model.call(settings,key,'purchaseText',{text:rawText,today:dates.today()});
      if(!Array.isArray(result.items)||!result.items.length)throw new Error('未识别出采购商品，原草稿仍保留，请补充名称和数量');
      const rows=result.items.map(row=>({...blank(),...stock.normalize({...row,type:stock.typeOf(row),purchaseDate:row.purchaseDate||result.purchaseDate||'',stockedDate:dates.today(),expiryDate:row.expiryDate||'',shelfDays:row.shelfDays==null?'':row.shelfDays}),amount:row.amount==null?'':row.amount,totalPrice:row.totalPrice==null?'':row.totalPrice,portions:row.portions==null?'':row.portions,unit:row.unit||'',platform:row.platform||result.platform||'',orderId:result.orderId||'',selected:true,allowDuplicate:false,_draftId:store.id('receipt-draft'),errors:{},rowError:'',uncertain:Array.isArray(row.uncertain)?row.uncertain.join('；'):String(row.uncertain||'')}));
      this.setData({receiptRows:this.data.receiptRows.concat(rows),rawText,receiptWarnings:result.warnings||[],receiptNotice:'已生成'+rows.length+'项采购草稿，请检查后直接点“确认批量入库”。',images:[]});this.persist();
    }catch(error){this.feedback(error.message||'识别失败，草稿仍保留',true);}
    finally{this.setData({busy:false});}
  },
  editReceipt(event){const id=event.currentTarget.dataset.id,index=event.currentTarget.dataset.index,field=event.detail.field||event.currentTarget.dataset.field,value=event.detail.value;const i=list(this.data.receiptRows).findIndex((row,i)=>row._draftId===id||(!id&&i===Number(index)));if(i<0)return;this.data.receiptRows[i][field]=value;if(event.detail.input===false||!event.detail.field)this.setData({['receiptRows['+i+'].'+field]:value});this.setData({['receiptRows['+i+'].errors']:{},['receiptRows['+i+'].rowError']:''});this.persist();},
  toggleReceiptRow(event){const id=event.currentTarget.dataset.id;this.setData({receiptRows:list(this.data.receiptRows).map(row=>row._draftId===id?{...row,selected:!row.selected}:row)});this.persist();},
  removeReceipt(event){this.setData({receiptRows:list(this.data.receiptRows).filter(row=>row._draftId!==event.currentTarget.dataset.id)});this.persist();},
  saveReceipt(){
    if(this.data.saving)return;
    const rows=[];let firstError='';
    const receiptRows=this.data.receiptRows.map((row,index)=>{
      if(!row.selected)return row;
      try{rows.push(stock.validate(row));return {...row,errors:{},rowError:''};}
      catch(error){if(!firstError)firstError=row._draftId;return {...row,errors:{[error.field||'name']:error.message},rowError:'商品'+(index+1)+'：'+error.message};}
    });
    this.setData({receiptRows});this.persist();
    if(firstError){const row=receiptRows.find(item=>item._draftId===firstError);this.feedback(row.rowError,true);platform.pageScrollTo({selector:'#row-'+firstError,duration:250});return;}
    if(!rows.length)return this.feedback('请至少选择一个商品。',true);
    platform.showModal({title:'确认批量入库',content:'将保存'+rows.length+'项商品及价格，未填写的份数和期限可以后补填。',confirmText:'确认入库',success:result=>{
      if(!result.confirm)return;this.setData({saving:true});
      try{
        const data=store.getData();let added=0,skipped=0;const incoming=new Set();
        rows.forEach(row=>{const hash=fingerprint(row);if(!row.allowDuplicate&&(incoming.has(hash)||data.fridge.some(item=>item.sourceFingerprint===hash)||(data.purchases||[]).some(item=>item.sourceFingerprint===hash))){skipped+=1;return;}incoming.add(hash);const item={...row,id:store.id('fridge'),sourceFingerprint:row.allowDuplicate?hash+'-'+store.id('separate'):hash,consumedFraction:0};['selected','orderId','uncertain','allowDuplicate','_draftId','errors','rowError'].forEach(field=>delete item[field]);data.fridge.unshift(item);inventory.syncPurchase(data,item,store.id);added+=1;});
        store.setData(data);
        if(added===0&&skipped>0){this.feedback('全部'+skipped+'项与已有采购重复，未再次入库；如确为另一笔采购，可打开对应商品的允许重复。',true);}
        else{this.setData({receiptRows:[],images:[],rawText:'',intakeText:'',receiptWarnings:[]});this.feedback('成功入库'+added+'项，跳过重复'+skipped+'项。',true);}
        this.persist();this.load();
      }catch(error){this.feedback(error.message||'保存失败，草稿仍保留',true);}
      finally{this.setData({saving:false});}
    }});
  }
});
