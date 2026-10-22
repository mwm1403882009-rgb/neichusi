const { today, addDays, nextWorkWeek } = require('./date');

const providers = {
  deepseek: { label: 'DeepSeek', model: 'deepseek-v4-flash', visionModel: 'deepseek-v4-flash-vision-exp', baseUrl: 'https://api.deepseek.com', inputPricePerMillion: '', outputPricePerMillion: '' },
  mimo: { label: '小米 MiMo', model: 'mimo-v2.6-flash', visionModel: 'mimo-v2.6-flash', baseUrl: 'https://api.xiaomimimo.com/v1', inputPricePerMillion: '', outputPricePerMillion: '' },
  kimi: { label: 'Kimi', model: 'kimi-k2.6', visionModel: 'kimi-k2.6', baseUrl: 'https://api.moonshot.cn/v1', inputPricePerMillion: '', outputPricePerMillion: '' },
  glm: { label: '智谱 GLM', model: 'glm-5.2', visionModel: 'glm-4.6v', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', inputPricePerMillion: '', outputPricePerMillion: '' },
  hunyuan: { label: '腾讯混元 HY', model: 'hy4-preview', visionModel: 'hy-vision-2.0-instruct', baseUrl: 'https://tokenhub.tencentmaas.com/v1', inputPricePerMillion: '', outputPricePerMillion: '' },
  qwen: { label: '阿里千问 Qwen', model: 'qwen-plus', visionModel: 'qwen3-vl-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', inputPricePerMillion: '', outputPricePerMillion: '' }
};
const candidates = [
  { name:'葱姜蒸鲫鱼配青菜杂粮饭',emoji:'🐟',cost:35.8,prepMinutes:32,proteinCategories:['鱼类/河鲜'],ingredients:['鲫鱼 1条约450g','上海青 250g','杂粮饭 300g','姜 15g','小葱 2根'],steps:['鲫鱼处理干净，擦干后铺姜片腌10分钟。','水开上锅蒸约10分钟，关火焖2分钟。','倒去盘中汁水，铺葱丝并淋少量蒸鱼豉油。','上海青少油快炒，与杂粮饭搭配。'],notes:'鱼刺较多，食用时留意；蒸制时间按鱼的厚度调整。',tags:['河鲜','少油蒸制'] },
  { name:'虾仁彩椒滑蛋配玉米',emoji:'🦐',cost:38.6,prepMinutes:24,proteinCategories:['海鲜','蛋类'],ingredients:['虾仁 220g','鸡蛋 2个','彩椒 200g','玉米 1根','生菜 180g'],steps:['虾仁擦干，加少量胡椒和淀粉抓匀。','鸡蛋炒至七成熟后盛出。','虾仁炒至变色，加入彩椒和鸡蛋快速翻匀。','玉米蒸熟，生菜焯烫后搭配。'],notes:'虾仁熟透即可，久炒会变硬；甲壳类过敏者勿食。',tags:['海鲜','快手'] },
  { name:'香菇焖鸡腿配西兰花',emoji:'🍗',cost:31.8,prepMinutes:35,proteinCategories:['禽肉'],ingredients:['鸡腿肉 260g','香菇 120g','西兰花 220g','杂粮饭 300g'],steps:['鸡腿去骨切块，少油煎至表面金黄。','加入香菇、生抽和少量水焖15分钟。','西兰花焯熟，与杂粮饭搭配。'],notes:'鸡肉彻底熟透；留少量汤汁便于复热。',tags:['禽肉','餐盒友好'] },
  { name:'番茄牛肉杂粮饭',emoji:'🍅',cost:37.2,prepMinutes:30,proteinCategories:['牛羊肉'],ingredients:['牛肉 180g','番茄 2个','菜花 220g','杂粮饭 300g'],steps:['牛肉逆纹切片，生抽、淀粉和少量油腌10分钟。','番茄切块，菜花焯水2分钟。','快炒牛肉至变色后盛出。','炒软番茄，加少量水煮出汁，放回牛肉和菜花。'],notes:'番茄汁与米饭分开装，复热口感更好。',tags:['牛肉','高蛋白'] },
  { name:'芹菜香干炒里脊',emoji:'🥬',cost:28.5,prepMinutes:26,proteinCategories:['猪肉','豆制品'],ingredients:['猪里脊 160g','香干 120g','芹菜 250g','胡萝卜 100g','小米饭 300g'],steps:['里脊逆纹切丝，腌10分钟。','芹菜切段，胡萝卜和香干切丝。','快炒里脊至变色后盛出。','炒香蔬菜和香干，放回里脊少盐调味。'],notes:'选择瘦里脊，避免再搭配加工肉。',tags:['猪肉','豆制品'] },
  { name:'豆腐毛豆菌菇煲',emoji:'🍄',cost:22.6,prepMinutes:22,proteinCategories:['豆制品'],ingredients:['嫩豆腐 1盒','毛豆 120g','香菇 180g','青菜 200g'],steps:['香菇切片，豆腐切块并吸去表面水分。','少油煎豆腐至两面微黄。','加入香菇和毛豆，加生抽与半碗水焖6分钟。','放青菜煮熟即可。'],notes:'嫩豆腐不建议冷冻，优先当天或次日食用。',tags:['豆制品','清库存'] },
  { name:'番茄肉酱意面配蒜香西兰花',emoji:'🍝',cost:32.4,prepMinutes:32,proteinCategories:['牛羊肉'],ingredients:['意面 180g','番茄 2个','牛肉末 160g','西兰花 250g','蒜 3瓣'],steps:['意面按包装时间少煮1分钟，保留半杯面汤。','牛肉末炒散，加入番茄丁熬成肉酱。','放入意面，用面汤调整浓度。','西兰花焯水后与蒜末快炒。'],notes:'面与酱分装；冷藏不超过2天。',tags:['意面','营养搭配'] },
  { name:'冬瓜里脊丸子汤配小米饭',emoji:'🥣',cost:27.8,prepMinutes:34,proteinCategories:['猪肉'],ingredients:['猪里脊末 180g','冬瓜 300g','小葱 2根','小米饭 300g'],steps:['里脊末加少量葱姜水和淀粉，顺一个方向搅匀。','冬瓜切片，水开后转小火挤入丸子。','丸子熟透后加入冬瓜煮软，少量盐调味。','汤和小米饭分装。'],notes:'丸子彻底熟透；留汤复热不易发干。',tags:['猪肉','汤菜'] },
  { name:'黄瓜木耳炒蛋配玉米',emoji:'🥚',cost:18.9,prepMinutes:18,proteinCategories:['蛋类'],ingredients:['鸡蛋 3个','黄瓜 1根','泡发木耳 100g','玉米 1根'],steps:['鸡蛋打散，炒至刚凝固后盛出。','黄瓜切片，木耳焯水后沥干。','少油快炒黄瓜和木耳，放回鸡蛋翻匀。','玉米蒸熟后搭配。'],notes:'鸡蛋不要久炒，木耳泡发后及时烹调。',tags:['蛋类','快手'] },
  { name:'黑椒鸡胸肉配南瓜芦笋',emoji:'🍗',cost:30.6,prepMinutes:25,proteinCategories:['禽肉'],ingredients:['鸡胸肉 220g','南瓜 250g','芦笋 180g','黑胡椒 少许'],steps:['鸡胸肉切厚片，加少量生抽、淀粉和黑胡椒腌制。','南瓜蒸熟，芦笋焯水。','鸡胸肉少油煎至两面上色并彻底熟透。','与南瓜和芦笋分区装盒。'],notes:'鸡胸肉避免过度加热；切开最厚处确认熟透。',tags:['禽肉','少油'] },
  { name:'冬瓜虾仁汤配荞麦面',emoji:'🦐',cost:34.2,prepMinutes:22,proteinCategories:['海鲜'],ingredients:['虾仁 200g','冬瓜 300g','荞麦面 160g','小葱 2根'],steps:['虾仁擦干，加少量胡椒和淀粉抓匀。','冬瓜切片煮至透明。','放入虾仁煮至完全变色，少量盐调味。','荞麦面另煮并分装，食用时再组合。'],notes:'虾仁不要久煮；面、汤分开保存。',tags:['海鲜','汤面'] }
];
function recipe(candidate, id) { return { id, ...candidate, source:'御膳房',sourceUrl:'',plannedDate:today(),servings:2,reason:'',inventoryUsed:[],nutritionNote:'主食、蔬菜和蛋白质搭配；一餐不能代替整周膳食。' }; }
function prepOptions(meal, index) {
  const monday = index < 2;
  const semi = {
    sundaySteps: ['按一餐份量完成清洗和切配；肉类按菜谱调味腌制，但不要加热到半熟。', monday ? '肉类、蔬菜和酱汁分开密封冷藏，标注菜名与食用日期。' : '需冷冻的肉类立即密封冷冻；不耐冻蔬菜另行冷藏或当天准备，分别标注菜名与日期。'],
    storage: monday ? '冷藏' : '冷冻',
    thawPlan: monday ? '全程冷藏，周一取出后尽快彻底烹熟。' : '食用前一晚转入冷藏室缓慢解冻；蔬菜按适宜方式冷藏或当天另配。',
    daySteps: meal.steps,
    quality: '当天现做更容易控制肉类嫩度，也能保留蔬菜的爽脆口感。',
    safety: '生熟分区操作；腌制和解冻全程冷藏，解冻后尽快彻底烹熟，不再次冷冻。'
  };
  const cooked = {
    sundaySteps: meal.steps.concat(['彻底做熟后按一餐份量分装，并在2小时内尽快散热、密封保存。']),
    storage: monday ? '冷藏' : '冷冻',
    thawPlan: monday ? '全程冷藏，周一取出后直接充分复热。' : '食用前一晚转入冷藏室解冻。',
    daySteps: ['取出一餐份量，加少量水或原汤防止变干。', '充分复热至中心滚烫，只复热一次，立即食用。'],
    quality: '当天最省时间；焖炖菜较耐复热，快炒肉、鱼虾和绿叶菜可能变老或变软。',
    safety: '做熟后不要在室温久放；快速散热、及时冷藏或冷冻，复热后剩余部分不再保存。'
  };
  return { semi, cooked };
}
function weekPlan() {
  const meals = [candidates[2], candidates[5], candidates[3], candidates[1], candidates[4], candidates[8], candidates[9], candidates[6], candidates[10], candidates[7]];
  const cookingMethods = ['焖', '煲', '炒', '炒', '炒', '炒', '煎', '熬酱', '煮汤', '煮汤'];
  const recommendations = [
    ['cooked', '香菇焖鸡腿带汤汁、耐复热，周日全熟后当天只需热透，能明显节省时间。'],
    ['semi', '嫩豆腐冷冻后组织和口感会明显改变，优先保留半成品方案并在周一晚餐现做。'],
    ['semi', '牛肉片属于短时快炒食材，周二现炒更容易保持嫩度；周日切片腌制后应立即冷冻。'],
    ['semi', '虾仁和滑蛋复热容易变硬、出水，当天快速炒熟的口感通常更好。'],
    ['semi', '里脊丝属于短时快炒食材，当天炒更容易保持嫩度和芹菜口感。'],
    ['semi', '炒蛋和黄瓜复热后容易出水变老，周三晚餐现炒时间也较短。'],
    ['semi', '鸡胸肉容易因复热过度而发柴，建议腌制冷冻后在当天控制火候煎熟。'],
    ['cooked', '番茄肉酱耐冷冻和复热，周日做好肉酱能明显缩短周四晚餐时间；面条建议当天煮。'],
    ['semi', '虾仁久煮和复热容易变硬，汤底可提前准备，虾仁在周五当天煮熟。'],
    ['cooked', '丸子汤带汤汁、耐复热，周日彻底做熟后冷冻比周五当天重新制作更省时间。']
  ];
  const schedule = [];
  nextWorkWeek().forEach(day => ['午餐', '晚餐'].forEach(mealSlot => schedule.push({ ...day, mealSlot })));
  return schedule.map((d, i) => {
    const options = prepOptions(meals[i], i);
    const selected = recommendations[i][0];
    const chosen = options[selected];
    return {
      id: `plan-${i + 1}`, date: d.date, label: d.label, mealSlot: d.mealSlot, name: meals[i].name, cookingMethod: cookingMethods[i],
      side: i === 1 ? '红薯 · 菜花' : '杂粮饭 · 时蔬', ingredients: meals[i].ingredients,
      prepOptions: options, aiRecommendedMode: selected, selectedPrepMode: selected,
      recommendationReason: recommendations[i][1], storage: chosen.storage,
      prepSteps: chosen.sundaySteps, cookSteps: chosen.daySteps,
      eatTips: [chosen.thawPlan, chosen.quality, chosen.safety].join('；')
    };
  });
}
function initialData() { return {version:3,recipes:[],weekPlan:[],weekPrompt:'',batchSteps:[],fridge:[],prices:[],history:[],aiUsage:[],purchases:[],priceLogs:[],priceAlerts:[],frequentStock:[]}; }
module.exports = { providers, candidates, recipe, initialData, weekPlan };
