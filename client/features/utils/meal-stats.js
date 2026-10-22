const {list:asList}=require('./list-data');
const inventory = require('./inventory');
const dates = require('./date');
function group() { return {count:0,cost:0,pending:0}; }
function finish(value) { return {...value,costText:inventory.round(value.cost).toFixed(2)}; }
function typeOf(row,day){
  if(row.mealType==='other'||row.mealType==='self')return row.mealType;
  if(row.recipeSnapshot&&row.recipeSnapshot.mealType==='other')return 'other';
  if(row.otherInfo||/外食|其他用餐|外卖|堂食/.test(row.source||''))return 'other';
  if(asList(row.consumption).length||asList(row.recipeSnapshot&&row.recipeSnapshot.ingredients).length)return 'self';
  // Only a linked/confirmed plan can supply missing legacy metadata; an edited draft cannot reclassify history.
  if(day&&day.mealType==='other'&&(day.confirmedAt||(day.historyId&&day.historyId===row.id))&&(day.otherInfo===row.name||(!day.otherInfo&&row.name==='外食 / 其他')))return 'other';
  if(day&&day.mealType==='other'&&day.otherInfo&&day.otherInfo===row.name&&!asList(row.consumption).length&&!asList(row.recipeSnapshot&&row.recipeSnapshot.ingredients).length)return 'other';
  return 'self';
}
function summary(data, start, days) {
  const end=dates.addDays(start,6), actual={self:group(),other:group()}, planned={self:group(),other:group()};
  const meals=new Map();asList(days).filter(day=>day.date>=start&&day.date<=end).forEach(day=>meals.set(day.date+'|'+day.mealSlot,day));
  // 同一天、同餐次只计一次，避免旧版本重复记录或计划+历史双算。
  const history=new Map();asList(data.history).filter(row=>row.date>=start&&row.date<=end).forEach(row=>{const key=row.date+'|'+row.mealSlot;if(!history.has(key))history.set(key,row);});
  history.forEach((row,key)=>{const target=actual[typeOf(row,meals.get(key))];target.count++;if(row.totalCost==null){target.cost+=Number(row.knownCost)||0;target.pending++;}else target.cost+=Number(row.totalCost)||0;});
  meals.forEach((day,key)=>{if(history.has(key))return;
    if(day.confirmedAt){const target=actual[day.mealType==='other'?'other':'self'],cost=day.mealType==='other'?inventory.number(day.otherCost):null;target.count++;if(cost==null)target.pending++;else target.cost+=cost;return;}
    if(day.mealType!=='other'&&!String(day.name||'').trim())return;if(day.mealType==='other'&&!day.otherInfo&&inventory.number(day.otherCost)==null)return;const target=planned[day.mealType==='other'?'other':'self'],quote=inventory.quote(day,data.fridge);target.count++;target.cost+=quote.known;if(quote.total==null)target.pending++;
  });
  return {self:finish(actual.self),other:finish(actual.other),planSelf:finish(planned.self),planOther:finish(planned.other)};
}
module.exports={summary,typeOf};
