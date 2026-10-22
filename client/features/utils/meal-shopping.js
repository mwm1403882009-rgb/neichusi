const {list:asList}=require('./list-data');
const {lines}=require('./recipe-data');
function list(days,history=[]){
  const latest=new Map();asList(days).forEach(day=>latest.set(day.date+'|'+day.mealSlot,day));
  const items=[];latest.forEach(day=>{const actual=asList(history).find(row=>row.date===day.date&&row.mealSlot===day.mealSlot);if((actual?actual.mealType:day.mealType)==='other')return;const ingredients=actual&&actual.recipeSnapshot?actual.recipeSnapshot.ingredients:day.ingredients;items.push(...lines(ingredients));});
  return Array.from(new Set(items));
}
module.exports={list};
