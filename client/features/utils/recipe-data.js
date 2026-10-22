const categories=['全部','猪肉','牛羊肉','禽肉','鱼类','虾贝海鲜','蛋豆','素菜','主食','汤羹','其他'];
function lines(value){return Array.isArray(value)?value.map(String).map(s=>s.trim()).filter(Boolean):String(value||'').split('\n').map(s=>s.trim()).filter(Boolean);}
function methods(day){
  if(Object.prototype.hasOwnProperty.call(day,'methodSteps'))return lines(day.methodSteps);
  const old=day.prepOptions||{},cooked=old.cooked||{};
  const current=lines(day.cookSteps).length?lines(day.cookSteps):lines(day.steps);
  if(current.length&&current.every(s=>/复热|取出一餐|中心滚烫/.test(s))){const original=lines(cooked.sundaySteps).filter(s=>!/(2小时|两小时|密封|冷藏|冷冻|分装|散热)/.test(s));if(original.length)return original;}
  return current;
}
function normalize(day){const methodSteps=methods(day);return {...day,mealType:day.mealType==='other'?'other':'self',otherInfo:day.otherInfo||'',otherCost:day.otherCost==null?'':day.otherCost,ingredients:lines(day.ingredients),ingredientUses:(day.ingredientUses||[]).map((row,i)=>({...row,id:row.id||(day.id||'meal')+'-use-'+i})),extraCosts:day.extraCosts||[],methodSteps,cookSteps:methodSteps};}
function classify(recipe){
  if(recipe.category&&categories.includes(recipe.category)&&recipe.category!=='全部')return recipe.category;
  const text=[recipe.name,...lines(recipe.ingredients)].join(' ');
  if(/猪|里脊|排骨|五花/.test(text))return '猪肉';if(/牛|羊/.test(text))return '牛羊肉';
  if(/鸡(?!蛋)|鸭(?!蛋)|鹅(?!蛋)/.test(text))return '禽肉';if(/虾|蟹|贝|蛤|蚝|鱿鱼|章鱼|海鲜/.test(text))return '虾贝海鲜';
  if(/鱼|鲫|鲤|鲈|鲳|鳕|河鲜/.test(text))return '鱼类';if(/蛋|豆腐|豆干|豆皮|腐竹|毛豆/.test(text))return '蛋豆';
  if(/汤|羹/.test(text))return '汤羹';if(/饭|面|饺|粥|馒头|饼|包子/.test(text))return '主食';if(/菜|瓜|茄|菌|菇|笋|萝卜|薯/.test(text))return '素菜';return '其他';
}
function numbers(value,fields=['cost','servings','prepMinutes']){const next={...value};fields.forEach(field=>{const raw=next[field];if(raw==null||String(raw).trim()===''){next[field]=null;return;}const n=Number(raw);if(!Number.isFinite(n)||n<0||(field==='servings'&&n===0))throw Error(field==='servings'?'份数应大于0，未知可留空':'金额和耗时请填写有效非负数字');next[field]=n;});return next;}
module.exports={categories,lines,methods,normalize,classify,numbers};
