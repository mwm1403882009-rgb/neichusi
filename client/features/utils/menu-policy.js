const {lines}=require('./recipe-data');
function proteins(meal){if(meal.mealType==='other')return [];const text=[meal.name,...lines(meal.ingredients)].join(' '),out=[];
  if(/鱼|鲫|鲤|鲈|鳜|鲳|鳕|河鲜/.test(text.replace(/鱿鱼|墨鱼|章鱼|鱼香/g,'')))out.push('鱼类/河鲜');
  if(/虾|蟹|贝|蛤|蚝|鱿鱼|墨鱼|章鱼|海鲜/.test(text))out.push('海鲜');if(/鸡(?!蛋)|鸭(?!蛋)|鹅(?!蛋)/.test(text))out.push('禽肉');if(/牛|羊/.test(text))out.push('牛羊肉');if(/猪|里脊|排骨|五花/.test(text))out.push('猪肉');if(/鸡蛋|鸭蛋|滑蛋|炒蛋|蛋羹/.test(text))out.push('蛋类');if(/豆腐|豆干|香干|豆皮|毛豆|腐竹/.test(text))out.push('豆制品');return out;
}
const rules=[['鱼类/河鲜','鱼|河鲜','鱼|鲫|鲤|鲈|鳜|鲳|鳕|河鲜'],['海鲜','海鲜|虾|蟹|贝','海鲜|虾|蟹|贝|蛤|蚝|鱿鱼|墨鱼|章鱼'],['禽肉','鸡肉|鸭肉|禽肉','鸡(?!蛋)|鸭(?!蛋)|鹅(?!蛋)'],['牛肉','牛肉','牛肉|牛腩|牛排'],['猪肉','猪肉|里脊|排骨','猪肉|里脊|排骨|五花'],['蛋类','鸡蛋|蛋类','鸡蛋|鸭蛋|滑蛋|炒蛋|蛋羹'],['豆制品','豆腐|豆制品','豆腐|豆干|香干|豆皮|腐竹']];
function exclusions(text){
  return rules.filter(row=>{
    const re=new RegExp('(不吃|不要|不想吃|去掉|排除|不能吃|忌口|可以吃|想吃|允许|恢复)[^，。；\\n]{0,5}('+row[1]+')','g');
    let match,last;while((match=re.exec(String(text))))last=match;
    return last&&/^(不吃|不要|不想吃|去掉|排除|不能吃|忌口)$/.test(last[1]);
  });
}
function dishKey(name){return String(name||'').replace(/\s/g,'').replace(/(?:搭配|配|佐).*/,'').replace(/鸡腿肉?|鸡胸肉?|鸡块|鸡翅/g,'鸡').replace(/牛腩|肥牛|牛里脊|牛排|保乐肩/g,'牛肉').replace(/猪里脊|猪肉片|猪肉丝/g,'猪肉');}
function issues(drafts,all,text,strict=true){const found=[];drafts.forEach(day=>{
  const content=[day.name,...lines(day.ingredients),...lines(day.methodSteps||day.steps)].join(' ');
  exclusions(text).forEach(row=>{if(new RegExp(row[2]).test(row[0]==='鱼类/河鲜'?content.replace(/鱿鱼|墨鱼|章鱼|鱼香/g,''):content))found.push(day.name+'含排除项：'+row[0]);});
  if(!strict)return;
  all.filter(other=>other.id!==day.id&&other.mealType!=='other'&&other.name).forEach(other=>{
    if(dishKey(other.name)===dishKey(day.name))found.push('本周重复相同菜式：'+day.name);
    if(other.date===day.date&&proteins(other).some(item=>proteins(day).includes(item)))found.push(day.date+'午晚餐重复主蛋白：'+day.name+' / '+other.name);
  });
});return Array.from(new Set(found));}
function constraintText(text){const out=[];rules.forEach(row=>{const re=new RegExp('(不吃|不要|不想吃|去掉|排除|不能吃|忌口|可以吃|想吃|允许|恢复)[^，。；\\n]{0,5}('+row[1]+')','g');let match,last;while((match=re.exec(String(text||''))))last=match;if(last)out.push((/^(不吃|不要|不想吃|去掉|排除|不能吃|忌口)$/.test(last[1])?'不吃':'可以吃')+last[2]);});out.push(...(String(text||'').match(/少辣|少盐|少油|清淡/g)||[]));return Array.from(new Set(out)).join('；');}
module.exports={proteins,exclusions,issues,constraintText};
