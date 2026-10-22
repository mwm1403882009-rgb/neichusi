const {list}=require('./list-data');
const dates = require('./date');
const planning = require('./planning');
const stock = require('./stock');
const food=require('./ingredients');
function number(value) { return value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null; }
function round(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function key(value) { return String(value || '').replace(/\s+/g, '').toLowerCase(); }
function quantity(amount, unit) {
  const n = number(amount); const u = key(unit);
  if (!(n > 0)) return null;
  if (['g', '克', '公斤', 'kg', '千克', '斤', '两', '千克（kg）'].includes(u)) return { amount: n * ({ 公斤: 1000, kg: 1000, 千克: 1000, '千克（kg）': 1000, 斤: 500, 两: 50 }[u] || 1), unit: 'g' };
  if (['ml', '毫升', 'l', '升'].includes(u)) return { amount: n * (u === 'l' || u === '升' ? 1000 : 1), unit: 'ml' };
  return { amount: n, unit: u };
}
function priceUnit(item) {
  const q = quantity(item.amount, item.unit); const total = number(item.totalPrice);
  if (!q || total == null || total < 0) return null;
  const base = q.unit === 'g' || q.unit === 'ml' ? 500 : 1;
  return { value: total / q.amount * base, unit: q.unit === 'g' ? '500g' : q.unit === 'ml' ? '500ml' : q.unit };
}
function unitCost(item) { const price = number(item.totalPrice), portions = number(item.portions); return price != null && portions > 0 ? price / portions : null; }
function balance(item) { return 1 - (Number(item.consumedFraction) || 0) + (Number(item.adjustmentFraction) || 0); }
function remaining(item) { return Math.max(0, Number(item.amount) * balance(item)); }
function remainingInfo(item, data, exceptId) {
  const physical=Number(item.physicalAmount)>0&&item.physicalUnit;
  const scale = physical?Number(item.physicalAmount):Number(item.portions) > 0 ? Number(item.portions) : Number(item.amount), unit = physical?item.physicalUnit:Number(item.portions) > 0 ? '份' : item.unit || '';
  const actual = Math.max(0, scale * balance(item)), reserved = data ? scale * allocated(data,item.id,exceptId) : 0;
  const text = n => String(round(n));
  const estimated=Math.abs(actual-Math.round(actual))>.000001&&!(item.adjustments||[]).length&&(/^(份|只|条|个|枚)$/.test(unit));
  return {actual:round(actual),reserved:round(reserved),available:round(Math.max(0,actual-reserved)),unit,estimated,text:(estimated?'约':'')+text(actual)+unit,reservedText:text(reserved)+unit,availableText:text(Math.max(0,actual-reserved))+unit,rawText:text(remaining(item))+(item.unit||'')};
}
function adjustRemaining(data, id, target, unit, reason, makeId) {
  const item=data.fridge.find(row=>row.id===id);if(!item)throw Error('该批库存已移除');
  const targetValue=number(target);if(targetValue==null||targetValue<0)throw Error('实际剩余请填写不小于0的数字');
  if(/^(只|条|个|枚)$/.test(unit)&&!Number.isInteger(targetValue))throw Error('整只、整条数量请填整数；按份可填写半份');
  const nextFraction=targetValue===0?0:fraction({quantity:targetValue,unit},item);
  if(nextFraction>1.000001)throw Error('剩余不能超过原采购量；补货请新增采购批次');
  const before=balance(item);if(Math.abs(before-nextFraction)<0.000001)return remainingInfo(item,data);
  item.adjustmentFraction=(Number(item.adjustmentFraction)||0)+nextFraction-before;
  item.adjustments=[{id:makeId('stock-adjustment'),at:new Date().toISOString(),beforeFraction:before,afterFraction:nextFraction,deltaFraction:nextFraction-before,unit,quantity:targetValue,reason:String(reason||'实际剩余校正（未记餐消耗）')}].concat(item.adjustments||[]).slice(0,100);
  return remainingInfo(item,data);
}
function fraction(use, item) {
  if (use.quantity === '' || use.quantity == null || !(Number(use.quantity) > 0)) throw new Error('请填写大于0的使用量');
  if (use.unit === '份') {
    if (!(Number(item.portions) > 0)) throw new Error(`${item.name}尚未填写分装份数`);
    return Number(use.quantity) / Number(item.portions);
  }
  if(item.physicalUnit&&key(use.unit)===key(item.physicalUnit)&&Number(item.physicalAmount)>0)return Number(use.quantity)/Number(item.physicalAmount);
  const a = quantity(use.quantity, use.unit), b = quantity(item.amount, item.unit);
  if (!a || !b || a.unit !== b.unit) throw new Error(`${item.name}的使用单位与库存不一致，请先选择份数或相同单位`);
  return a.amount / b.amount;
}
function quote(meal, fridge) {
  if (meal.mealType === 'other') { const total=number(meal.otherCost);return {known:total||0,total,missing:total==null?1:0,details:[],text:total==null?'金额待填写':'¥'+total.toFixed(2)}; }
  let known = 0, missing = 0;
  const details = list(meal.ingredientUses).map(use => {
    const item = fridge.find(row => row.id === use.inventoryId);
    if (!item) { missing += 1; return { ...use, name: use.name || '库存已移除', cost: null, costText: '待关联库存', error: '库存已移除' }; }
    try {
      const f = fraction(use, item), total = number(item.totalPrice), cost = total == null ? null : total * f;
      if (cost == null) missing += 1; else known += cost;
      return { ...use, name: item.name, type:item.type||'', fraction: f, cost: cost == null ? null : round(cost), costText: cost == null ? '待填写价格' : `¥${cost.toFixed(2)}` };
    } catch (error) { missing += 1; return { ...use, name: item.name, cost: null, costText: error.message, error: error.message }; }
  });
  list(meal.extraCosts).forEach(row => { const cost = number(row.cost); if (cost == null) missing += 1; else known += cost; });
  const linkedNames = details.reduce((names,row)=>names.concat([key(row.name),key(row.type),key((row.name||'')+(row.type||''))].filter(Boolean)),[]);
  const extras = list(meal.extraCosts).map(row => key(row.name));
  list(meal.ingredients).forEach(line => {
    const name=food.parse(line).name;
    if(name&&!details.some(row=>{const item=fridge.find(item=>item.id===row.inventoryId);return item?food.rank(name,item)>0:food.rank(name,{name:row.name,type:row.type})>0;})&&!extras.some(n=>n&&(name.includes(n)||n.includes(name))))missing+=1;
  });
  if (!details.length && !(meal.extraCosts || []).length) missing = Math.max(missing, 1);
  const total = round(known);
  return { known: total, total: missing ? null : total, missing, details, text: missing ? `已计 ¥${total.toFixed(2)} · ${missing}项待计价` : `¥${total.toFixed(2)}` };
}
function syncPurchase(data, item, makeId) {
  const p = priceUnit(item);
  data.purchases = data.purchases || [];
  data.priceAlerts = data.priceAlerts || [];
  const index = data.purchases.findIndex(row => row.inventoryId === item.id);
  const previousSaved = index >= 0 ? data.purchases[index] : null;
  const comparisonKey = `${key(item.name)}|${key(stock.typeOf(item))}|${p ? p.unit : ''}`;
  const row = {
    id: previousSaved ? previousSaved.id : makeId('purchase'), inventoryId: item.id, name: item.name,
    type: stock.typeOf(item), spec: stock.typeOf(item), platform: item.platform || '未填写', date: stock.normalizeDate(item.purchaseDate) || dates.today(),
    totalPrice: number(item.totalPrice), amount: number(item.amount), unit: item.unit,
    unitPrice: p ? p.value : null, priceUnit: p ? p.unit : '', comparisonKey,
    createdAt: previousSaved ? previousSaved.createdAt : new Date().toISOString(), sourceFingerprint: item.sourceFingerprint || (previousSaved && previousSaved.sourceFingerprint) || '',
    sequence: previousSaved && previousSaved.sequence || Math.max(0, ...data.purchases.map(purchase => Number(purchase.sequence) || 0)) + 1
  };
  const peers = data.purchases.filter(other => other.inventoryId !== item.id && other.comparisonKey === comparisonKey && other.unitPrice != null && (other.date < row.date || (other.date === row.date && (Number(other.sequence) || 0) < row.sequence)))
    .sort((a, b) => b.date.localeCompare(a.date) || (Number(b.sequence) || 0) - (Number(a.sequence) || 0));
  const previous = peers[0];
  row.previousUnitPrice = previous ? previous.unitPrice : null;
  if (index >= 0) data.purchases[index] = row; else data.purchases.unshift(row);
  const touched = new Set([comparisonKey, previousSaved && previousSaved.comparisonKey].filter(Boolean));
  const oldAlerts = data.priceAlerts;
  const nextAlerts = oldAlerts.filter(alert => !touched.has(alert.comparisonKey));
  touched.forEach(groupKey => {
    const purchases = data.purchases.filter(purchase => purchase.comparisonKey === groupKey && purchase.unitPrice != null)
      .sort((a, b) => a.date.localeCompare(b.date) || (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
    purchases.forEach((purchase, order) => {
      const prior = purchases[order - 1];
      purchase.previousUnitPrice = prior ? prior.unitPrice : null;
      if (!prior || purchase.unitPrice <= prior.unitPrice + 0.000001) return;
      const existing = oldAlerts.find(alert => alert.inventoryId === purchase.inventoryId && alert.comparisonKey === groupKey && alert.oldPrice === prior.unitPrice && alert.newPrice === purchase.unitPrice);
      nextAlerts.push(existing ? { ...existing, type: purchase.type || purchase.spec || '' } : { id: makeId('alert'), inventoryId: purchase.inventoryId, comparisonKey: groupKey, name: purchase.name, type: purchase.type || purchase.spec || '', date: purchase.date, unit: purchase.priceUnit, oldPrice: prior.unitPrice, newPrice: purchase.unitPrice, seen: false });
    });
  });
  data.priceAlerts = nextAlerts.sort((a, b) => b.date.localeCompare(a.date));
}
function unreadCount(data) { return new Set((data.priceAlerts || []).filter(row => !row.seen).map(row => row.comparisonKey)).size; }
function allocated(data, inventoryId, exceptId) {
  const item = data.fridge.find(row => row.id === inventoryId); if (!item) return 0;
  return planning.allMeals(data).filter(meal => meal.id !== exceptId && !meal.confirmedAt && meal.mealType !== 'other').reduce((sum, meal) => sum + (meal.ingredientUses || []).filter(use => use.inventoryId === inventoryId).reduce((n, use) => { try { return n + fraction(use, item); } catch (error) { return n; } }, 0), 0);
}
function applyConsumption(data, history, nextUses) {
  const prior = history && history.consumption || [];
  const next = (nextUses || []).map(use => {
    const item = data.fridge.find(row => row.id === use.inventoryId);
    if (!item) throw new Error(`${use.name || '食材'}库存已移除，请重新关联后再确认`);
    return { inventoryId: item.id, fraction: fraction(use, item) };
  });
  const ids = Array.from(new Set(prior.concat(next).map(row => row.inventoryId)));
  const updates=ids.map(id => {
    const item = data.fridge.find(row => row.id === id); if (!item) return;
    const previous = prior.filter(row => row.inventoryId === id).reduce((n, row) => n + row.fraction, 0);
    const upcoming = next.filter(row => row.inventoryId === id).reduce((n, row) => n + row.fraction, 0);
    const consumed = (Number(item.consumedFraction) || 0) - previous + upcoming;
    const after=1-consumed+(Number(item.adjustmentFraction)||0);
    if (after < -0.000001) throw new Error(`${item.name}库存不足，请调整用量`);
    if (after > 1.000001) throw new Error(`${item.name}返还后超过原采购量，请先核对实际剩余校正`);
    return {item,consumed:Math.max(0,consumed)};
  });
  updates.filter(Boolean).forEach(row=>{row.item.consumedFraction=row.consumed;});
  return next;
}
function reconcileUses(lines,fridge,uses){
  return (uses||[]).reduce((out,use)=>{
    const item=fridge.find(row=>row.id===use.inventoryId)||{name:use.name,type:use.type};
    const line=(lines||[]).map(food.parse).find(row=>food.rank(row.name,item)>0);if(!line)return out;
    let next={...use,ingredientLine:line.text};if(line.quantity!=null){try{fraction({quantity:line.quantity,unit:line.unit},item);next={...next,quantity:line.quantity,unit:line.unit};}catch(error){/* Preserve explicit unit choice when raw text cannot be converted. */}}
    out.push(next);return out;
  },[]);
}
function matchLines(lines,fridge,currentUses){
  const uses=[],issues=[];
  (lines||[]).forEach(line=>{
    const parsed=food.parse(line);if(!parsed.name)return;
    if((currentUses||[]).concat(uses).some(use=>food.rank(parsed.name,fridge.find(row=>row.id===use.inventoryId)||{name:use.name,type:use.type})>0))return;
    if(parsed.quantity==null){issues.push(parsed.name+'未写用量，请填写数量和单位');return;}
    const matches=food.matches(parsed.name,fridge.filter(item=>remaining(item)>0));
    if(matches.length!==1){issues.push(parsed.name+(matches.length?'有多批或多种类型库存，请手动选择':'没有匹配的库存'));return;}
    const item=matches[0],use={inventoryId:item.id,name:item.name,type:item.type||'',quantity:parsed.quantity,unit:parsed.unit,ingredientLine:parsed.text};
    try{fraction(use,item);uses.push(use);}catch(error){issues.push(error.message);}
  });return {uses,issues};
}
function reviseBasis(data,id,patch,target,unit,reason,makeId){
  const item=data.fridge.find(row=>row.id===id);if(!item)throw Error('该批库存已移除');const updated=stock.validate({...item,...patch});
  const value=number(target);if(value==null||value<0)throw Error('采购信息修正时，请同时填写修正后的实际剩余');if(/^(只|条|个|枚)$/.test(unit)&&!Number.isInteger(value))throw Error('实物只数、条数应为整数');const after=value===0?0:fraction({quantity:value,unit},updated);if(after>1.000001)throw Error('实际剩余不能超过修正后的采购总量，补货请新增批次');
  const before={amount:item.amount,unit:item.unit,portions:item.portions,physicalAmount:item.physicalAmount||null,physicalUnit:item.physicalUnit||'',totalPrice:item.totalPrice,adjustmentFraction:item.adjustmentFraction||0};
  const revision={id:makeId('basis'),at:new Date().toISOString(),before,after:{amount:updated.amount,unit:updated.unit,portions:updated.portions,physicalAmount:updated.physicalAmount,physicalUnit:updated.physicalUnit,totalPrice:updated.totalPrice,remaining:value,remainingUnit:unit},reason:reason||'原采购/分装信息录入有误，人工核对修正'};
  Object.assign(item,updated,{adjustmentFraction:after-1+(Number(item.consumedFraction)||0),basisRevisions:[revision].concat(item.basisRevisions||[]).slice(0,100),adjustments:[{id:makeId('stock-adjustment'),at:revision.at,quantity:value,unit,reason:revision.reason+'（采购基础修正）'}].concat(item.adjustments||[]).slice(0,100)});
  syncPurchase(data,item,makeId);return remainingInfo(item,data);
}
module.exports = { number, round, key, quantity, priceUnit, unitCost, remaining, remainingInfo, balance, adjustRemaining, reviseBasis, fraction, quote, syncPurchase, unreadCount, allocated, applyConsumption, matchLines, reconcileUses };
