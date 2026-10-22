function clean(value){return String(value||'').toLowerCase().replace(/\s|[·、,，：:]/g,'').replace(/^(?:冷冻|冷藏|新鲜|鲜切|新买的)/,'');}
const kinds=[
  ['牛肉','保乐肩',/保乐肩|牛保肩|保肩牛|牛肩肉|牛肩胛|保肩/],
  ['牛肉','肥牛',/肥牛/],['牛肉','牛腩',/牛腩/],['牛肉','牛腱',/牛腱/],['牛肉','牛里脊',/牛里脊/],['牛肉','牛排',/牛排/],
  ['猪肉','里脊',/猪里脊|里脊/],['猪肉','五花肉',/五花/],['猪肉','排骨',/排骨|肋排/],
  ['鸡肉','鸡腿',/琵琶腿|鸡腿/],['鸡肉','鸡胸',/鸡胸/],['鸡肉','鸡翅',/鸡翅/],
  ['鱼','金鲳鱼',/金鲳|金昌鱼/],['鱼','鲈鱼',/鲈鱼/],['鱼','鳕鱼',/鳕鱼/],['虾','虾仁',/虾仁/]
];
function identity(value){const name=clean(value),kind=kinds.find(row=>row[2].test(name));if(kind)return{name,group:kind[0],type:kind[1]};const groups=[['牛肉',/牛肉/],['猪肉',/猪肉/],['鸡肉',/鸡肉/],['羊肉',/羊肉/],['鱼',/^(海鱼|鱼肉|鱼)$/],['虾',/^(虾|鲜虾|大虾)$/]];const group=groups.find(row=>row[1].test(name));return{name,group:group?group[0]:'',type:''};}
function rank(query,item){
  const q=identity(query),name=identity(item.name),type=identity(item.type||item.spec),combined=identity((item.name||'')+(item.type||item.spec||''));
  const identities=[type,name,combined],types=identities.filter(row=>row.type);
  if(!q.name)return 0;
  if(q.type){if(types.some(row=>row.type===q.type&&row.group===q.group))return 100;if(types.length&&types.some(row=>row.group===q.group))return 0;}
  if(q.group&&!q.type&&identities.some(row=>row.group===q.group))return 70;
  if([clean(item.name),clean(item.type||item.spec),combined.name].filter(Boolean).some(text=>text===q.name))return 95;
  if(q.group&&identities.some(row=>row.group===q.group))return 70;
  const candidates=[clean(item.type||item.spec),clean(item.name)].filter(text=>text.length>=2);
  return candidates.some(text=>text.includes(q.name)||q.name.includes(text))?60:0;
}
function matches(query,items){const ranked=items.map(item=>({item,score:rank(query,item)})),max=Math.max(0,...ranked.map(row=>row.score));return max?ranked.filter(row=>row.score===max).map(row=>row.item):[];}
function parse(line){
  const text=String(line||'').trim(),amount=text.match(/(\d+(?:\.\d+)?|半|一|二|两|三|四|五|六|七|八|九|十)\s*(份|kg|千克|公斤|g|克|斤|两|个|根|盒|包|ml|毫升|升|只|条|枚)/i);
  const numerals={半:.5,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  return {text,name:clean(amount?text.replace(amount[0],''):text.replace(/适量|少许/g,'')),quantity:amount?(numerals[amount[1]]||Number(amount[1])):null,unit:amount?amount[2]:''};
}
module.exports={clean,identity,rank,matches,parse};
