const store = require('../../utils/store');
const inventory = require('../../utils/inventory');
const { today } = require('../../utils/date');
const labels = { meituan:'美团', taobao:'淘宝', xiaoxiang:'小象超市', pupu:'朴朴超市' };
function best(row) {
  const values=Object.keys(labels).map(k=>({key:k,value:Number(row[k])||0})).filter(x=>x.value>0).sort((a,b)=>a.value-b.value);
  const winner=values[0]||{key:'',value:0}; const diff=winner.value-(Number(row.previousBest)||0);
  return { ...row,bestPrice:winner.value,bestPlatform:labels[winner.key]||'未填写',trend:!row.previousBest?'暂无上期':diff>0?'比上期最低贵 ¥'+diff.toFixed(2):diff<0?'比上期最低便宜 ¥'+Math.abs(diff).toFixed(2):'与上期最低相同',trendUp:diff>0 };
}
function purchaseGroups(data, expanded) {
  const categories = {};
  const category = name => { const id=inventory.key(name); if(!categories[id])categories[id]={key:id,name,variants:[],quotes:[]};return categories[id]; };
  const variants={};
  (data.purchases||[]).forEach(row=>{const key=row.comparisonKey;if(!variants[key])variants[key]=[];variants[key].push(row);});
  Object.keys(variants).forEach(key=>{
    const rows=variants[key].slice().sort((a,b)=>b.date.localeCompare(a.date)||(Number(b.sequence)||0)-(Number(a.sequence)||0));
    const current=rows.find(row=>row.unitPrice!=null),priced=rows.filter(row=>row.unitPrice!=null),previous=priced[1];
    const diff=current&&previous?current.unitPrice-previous.unitPrice:null;
    category(rows[0].name).variants.push({key,type:rows[0].type||rows[0].spec||'未分类',showRecords:(expanded||[]).includes(key),
      currentText:current?'¥'+current.unitPrice.toFixed(2)+'/'+current.priceUnit:'单价待确认',
      lowText:priced.length?'¥'+Math.min(...priced.map(row=>row.unitPrice)).toFixed(2)+'/'+current.priceUnit:'待确认',
      trendUp:diff>0,trend:diff==null?'暂无上次同类型采购':diff>0?'同类型上涨 ¥'+diff.toFixed(2)+'/'+current.priceUnit:diff<0?'同类型下降 ¥'+Math.abs(diff).toFixed(2)+'/'+current.priceUnit:'同类型单价不变',
      records:rows.map(row=>({...row,priceText:row.unitPrice==null?'待确认':'¥'+row.unitPrice.toFixed(2)+'/'+row.priceUnit,totalText:row.totalPrice==null?'待填写':'¥'+Number(row.totalPrice).toFixed(2)}))
    });
  });
  (data.prices||[]).forEach(row=>category(row.ingredient).quotes.push(best(row)));
  return Object.values(categories);
}
defineScreen({
  data:{rows:[],purchaseGroups:[],alerts:[],draft:{ingredient:'',type:'',unit:'500g',meituan:'',taobao:'',xiaoxiang:'',pupu:''}},
  onShow(){this.load();},
  onHide(){this.markViewed();}, onUnload(){this.markViewed();},
  load(){
    const data=store.getData(); const alerts=(data.priceAlerts||[]).filter(row=>!row.seen);
    this.viewedAlertIds=alerts.map(row=>row.id);
    this.setData({rows:data.prices.map(best),purchaseGroups:purchaseGroups(data,this.expandedKeys),alerts:alerts.map(row=>({...row,oldText:row.oldPrice.toFixed(2),newText:row.newPrice.toFixed(2),difference:(row.newPrice-row.oldPrice).toFixed(2)}))});
  },
  markViewed(){const ids=this.viewedAlertIds||[];if(!ids.length)return;store.update(data=>{data.priceAlerts=(data.priceAlerts||[]).map(row=>ids.includes(row.id)?{...row,seen:true}:row);});this.viewedAlertIds=[];},
  toggleVariant(event){const key=event.currentTarget.dataset.key;this.expandedKeys=this.expandedKeys||[];this.expandedKeys=this.expandedKeys.includes(key)?this.expandedKeys.filter(item=>item!==key):this.expandedKeys.concat(key);this.load();},
  inputDraft(event){this.setData({['draft.'+event.currentTarget.dataset.field]:event.detail.value});},
  add(){const d=this.data.draft;if(!d.ingredient.trim())return platform.showToast({title:'请填写食材',icon:'none'});const row={id:store.id('price'),ingredient:d.ingredient.trim(),type:d.type||'',unit:d.unit.trim(),meituan:Number(d.meituan)||0,taobao:Number(d.taobao)||0,xiaoxiang:Number(d.xiaoxiang)||0,pupu:Number(d.pupu)||0,previousBest:0,updatedAt:today()};store.update(data=>data.prices.unshift(row));this.setData({draft:{ingredient:'',type:'',unit:'500g',meituan:'',taobao:'',xiaoxiang:'',pupu:''}});this.load();},
  edit(event){const id=event.currentTarget.dataset.id,field=event.currentTarget.dataset.field,value=event.currentTarget.dataset.number?Number(event.detail.value)||0:event.detail.value;store.update(data=>{const row=data.prices.find(x=>x.id===id);if(row)row[field]=value;});this.load();},
  record(event){const id=event.currentTarget.dataset.id;store.update(data=>{const row=data.prices.find(x=>x.id===id);if(!row)return;const old=best(row).bestPrice;data.priceLogs=data.priceLogs||[];data.priceLogs.unshift({id:store.id('price-log'),priceId:id,date:today(),best:old,prices:{meituan:row.meituan,taobao:row.taobao,xiaoxiang:row.xiaoxiang,pupu:row.pupu}});row.previousBest=old;row.updatedAt=today();});this.load();platform.showToast({title:'已记录本期价格'});},
  remove(event){const id=event.currentTarget.dataset.id;platform.showModal({title:'删除这项手工比价？',content:'采购批次和历史记录会保留。',success:result=>{if(result.confirm){store.update(data=>data.prices=data.prices.filter(x=>x.id!==id));this.load();}}});}
});
