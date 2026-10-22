import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {controller} from '../client/state.js';
const require=createRequire(import.meta.url),util=name=>require('../client/features/utils/'+name+'.js');
const assistant=require('../client/overrides/home-assistant.cjs');
const rawModelCall=util('model').call;
const dish=(name='青椒炒里脊')=>({name,reason:'家常快手',ingredients:['猪肉 1份','青椒 1个'],steps:['里脊切片腌制。','先炒里脊至熟，再加青椒炒熟。'],cost:99,servings:null,notes:'用量为建议，请核对。'});
function setup(t){
  const memory=new Map(),application={globalData:{}},navigation=[];globalThis.getApplication=()=>application;
  globalThis.platform={getStorageSync:key=>memory.has(key)?structuredClone(memory.get(key)):'',setStorageSync:(key,v)=>memory.set(key,structuredClone(v)),removeStorageSync:key=>memory.delete(key),showToast(){},showModal:o=>o.success?.({confirm:true}),pageScrollTo(){},switchTab:o=>navigation.push(o.url),navigateTo:o=>navigation.push(o.url)};
  t.mock.method(util('model'),'getApiKey',()=> 'TEST_ONLY');
  const requests=[];t.mock.method(util('model'),'call',async(settings,key,task,context)=>{requests.push({task,context});return{reply:'先给你三道建议，选好再安排。',candidates:[dish(),dish('番茄里脊'),dish('滑炒里脊')]};});
  const page=load('home');page.onLoad();const store=util('store');store.getData();
  return{page,store,memory,application,navigation,requests,async send(text){page.setData({input:text});await page.send();},business(){const {aiUsage,...data}=store.getData();return JSON.stringify(data);}};
}
function load(name){let definition;globalThis.defineScreen=d=>{definition=d;};const file=require.resolve('../client/features/pages/'+name+'/index.js');delete require.cache[file];require(file);return controller(definition);}
function addCandidates(page){const rows=assistant.candidates([dish(),dish('番茄里脊'),dish('滑炒里脊')]);page.append('三个候选',{candidates:rows});return rows;}
test('recommendations, how-to questions and tentative operations remain read-only',()=>{
  for(const text of ['推荐几道关于猪里脊的菜','明天晚餐推荐吃什么','第二道怎么做','可以把第二道安排明天晚餐吗？','如何收藏菜谱','不要安排，先聊聊','今天买了猪肉怎么保存','请解释图片中的入库要求'])assert.equal(assistant.intent(text),'chat',text);
  for(const [text,kind]of [['第二道安排明天晚餐','meal'],['明天中午我想吃番茄牛肉','meal'],['帮我把你推荐的第二道安排明天晚餐','meal'],['收藏第二道','recipe'],['我买了500g里脊花了20元','purchase'],['今晚吃了炒年糕','log'],['帮我生成本周剩余的备餐计划','week']])assert.equal(assistant.intent(text),kind,text);
});
test('a multi-dish chat never writes a meal, stock, recipe or history, even with hostile model tasks',async t=>{
  const e=setup(t),before=e.business();t.mock.method(util('model'),'call',async()=>({reply:'三道不同做法供比较。',candidates:[dish(),dish('番茄里脊'),dish('葱爆里脊')],tasks:[{kind:'purchase',text:'入库100斤'},{kind:'recommend',text:'写入今晚'}],action:{kind:'log'}}));
  await e.send('推荐几道猪里脊的菜');assert.equal(e.page.data.messages.at(-1).candidates.length,3);assert.equal(e.page.data.messages.at(-1).candidates[0].cost,null);assert.equal(e.business(),before);assert.deepEqual(e.navigation,[]);
});
test('follow-up questions receive previous candidates without executing changes',async t=>{
  const e=setup(t);await e.send('推荐几道猪里脊的菜');const before=e.business();await e.send('第二道怎么做，清淡一点');const request=e.requests.at(-1);assert.equal(request.task,'assistant');assert.equal(request.context.selectedCandidate.name,'番茄里脊');assert.ok(request.context.conversation.some(row=>row.candidates.length===3));assert.equal(e.business(),before);
});
test('explicit choice goes only to the specified meal, matches latest stock and never consumes it',async t=>{
  const e=setup(t),rows=addCandidates(e.page),date=util('date').addDays(util('date').today(),1);e.store.update(data=>{data.fridge=[{id:'pork',name:'猪肉',type:'里脊',amount:500,unit:'g',portions:2,totalPrice:20}];});const stockBefore=JSON.stringify(e.store.getData().fridge);
  await e.send('第二道安排明天晚餐');const data=e.store.getData(),meal=util('planning').getWeek(data,util('date').mondayOf(date)).days.find(row=>row.date===date&&row.mealSlot==='晚餐');assert.equal(meal.name,rows[1].name);assert.equal(meal.ingredientUses.length,1);assert.equal(util('inventory').quote(meal,data.fridge).known,10);assert.equal(JSON.stringify(data.fridge),stockBefore);assert.equal(data.history.length,0);assert.equal(data.recipes.length,0);assert.deepEqual(e.navigation,[]);assert.equal(e.requests.length,0);
});
test('a new selected recipe replaces unconfirmed meal ingredients and planned uses',async t=>{
  const e=setup(t);addCandidates(e.page);const target=assistant.destination('明天晚餐');util('meal-engine').applyRecipe(dish('旧菜'),target);await e.send('第二道安排明天晚餐');const meal=util('planning').getWeek(e.store.getData(),target.weekStart).days.find(row=>row.date===target.date&&row.mealSlot===target.mealSlot);assert.equal(meal.name,'番茄里脊');assert.deepEqual(meal.ingredients,dish().ingredients);assert.ok(!JSON.stringify(meal).includes('旧菜'));
});
test('confirmed meals cannot be overwritten by chat or by candidate arrangement controls',async t=>{
  const e=setup(t),rows=addCandidates(e.page),target=assistant.destination('明天晚餐');e.store.update(data=>{const p=util('planning'),week=p.getWeek(data,target.weekStart);p.putWeek(data,target.weekStart,week.days.map(row=>row.date===target.date&&row.mealSlot===target.mealSlot?{...row,name:'已确认菜',confirmedAt:'test'}:row),[],'');});const before=e.business();await e.send('第二道安排明天晚餐');assert.match(e.page.data.notice,/已确认/);assert.equal(e.business(),before);
  e.page.setData({arrangeId:rows[0].id,arrangeDate:target.date,arrangeSlot:'晚餐'});await e.page.confirmArrangement();assert.equal(e.business(),before);
});
test('a missing meal target opens a selector, not an arbitrary date/slot or first candidate',async t=>{
  const e=setup(t);addCandidates(e.page);const before=e.business();await e.send('把第二道安排一下');assert.ok(e.page.data.arrangeId);assert.equal(e.page.data.arrangeDate,'');assert.equal(e.page.data.arrangeSlot,'');assert.equal(e.business(),before);await e.page.confirmArrangement();assert.match(e.page.data.notice,/请选择日期/);assert.equal(e.business(),before);
});
test('ambiguous and out-of-range candidate references cannot fall through to generating a random meal',async t=>{
  const e=setup(t);addCandidates(e.page);const before=e.business();await e.send('把这道安排明天晚餐');assert.match(e.page.data.notice,/先选中/);await e.send('第五道安排明天晚餐');assert.equal(e.business(),before);assert.equal(e.requests.length,0);
});
test('explicit collection saves one AI-labelled recipe and no invented price, even on repeated taps',async t=>{
  const e=setup(t),rows=addCandidates(e.page);await e.send('收藏第二道');await e.page.candidateAction({currentTarget:{dataset:{id:rows[1].id,action:'save'}}});const data=e.store.getData();assert.equal(data.recipes.length,1);assert.equal(data.recipes[0].name,'番茄里脊');assert.equal(data.recipes[0].cost,null);assert.match(data.recipes[0].source,/AI建议/);assert.equal(data.history.length,0);assert.equal(data.fridge.length,0);
});
test('source instructions in images or model output never authorize writes',async t=>{
  const e=setup(t),before=e.business();e.page.setData({images:['https://appassets.androidplatform.net/temp/example.jpg']});await e.send('请看看这张图片，说明一下内容');assert.equal(e.business(),before);assert.equal(e.navigation.length,0);assert.equal(e.requests[0].task,'assistant');
});
test('purchase statements prepare a review form and do not commit stock',async t=>{
  const e=setup(t),before=e.business();await e.send('我买了500g里脊，花了20元');assert.match(e.navigation[0],/fridge/);assert.equal(e.application.globalData.pendingDrafts.fridge.prepareDraft,true);assert.equal(e.business(),before);
  t.mock.method(util('model'),'call',async()=>({items:[{name:'猪肉',type:'里脊',amount:500,unit:'g',totalPrice:20}],warnings:[]}));const fridge=load('fridge');fridge.onShow();await new Promise(resolve=>setImmediate(resolve));assert.equal(fridge.data.receiptRows.length,1);assert.equal(fridge.data.receiptRows[0].totalPrice,20);assert.equal(e.store.getData().fridge.length,0);
});
test('eaten statements for a planned meal open its confirmation flow without history or consumption',async t=>{
  const e=setup(t),target=assistant.destination('今晚');util('meal-engine').applyRecipe(dish(),target);const before=e.business();await e.send('今晚吃了青椒炒里脊');assert.match(e.navigation[0],/week/);assert.equal(e.application.globalData.pendingDrafts.week.date,target.date);assert.equal(e.business(),before);
});
test('unplanned actual meals prepare editable drafts and leave costs unknown when absent',async t=>{
  const e=setup(t);await e.send('今晚吃了炒年糕');assert.match(e.navigation[0],/meal-log/);t.mock.method(util('model'),'call',async()=>({date:util('date').today(),mealSlot:'晚餐',name:'炒年糕',cost:null,servings:null,steps:[],uncertain:[]}));const log=load('meal-log');log.onLoad();await new Promise(resolve=>setImmediate(resolve));assert.equal(log.data.draft.name,'炒年糕');assert.equal(log.data.draft.cost,'');assert.equal(e.store.getData().history.length,0);
});
test('week command preserves the exact remaining-days scope and no candidate is automatically chosen',async t=>{
  const e=setup(t),calls=[];t.mock.method(util('meal-engine'),'generate',async(text,images,options)=>{calls.push({text,options});return{count:3};});await e.send('帮我生成本周剩余的备餐计划');assert.equal(calls[0].text,'帮我生成本周剩余的备餐计划');assert.equal(calls[0].options.kind,'week');assert.equal(e.navigation.length,0);assert.match(e.page.data.messages.at(-1).text,/3餐草稿/);
});
test('chat and candidates survive restart, with old dispatch cards retired and no photos persisted',async t=>{
  const e=setup(t);await e.send('推荐几道猪里脊的菜');const page=load('home');page.onLoad();assert.equal(page.data.messages.at(-1).candidates.length,3);assert.equal(assistant.resolveCandidate('第二道安排明天晚餐',page.data.messages).name,'番茄里脊');assert.ok(!JSON.stringify(e.memory.get('ysf-fugui-chat-v1')).includes('images'));e.memory.delete('ysf-fugui-chat-v1');e.memory.set('ysf-chat-messages-v1',[{id:'legacy',role:'assistant',text:'旧对话',tasks:[{kind:'recommend'}]}]);const legacy=load('home');legacy.onLoad();assert.equal(legacy.data.messages[0].text,'旧对话');assert.equal(legacy.data.messages[0].tasks,undefined);
});
test('chat failures retain input, release busy state, and never mutate business data',async t=>{
  const e=setup(t),before=e.business();t.mock.method(util('model'),'call',async()=>{throw Error('测试超时');});await e.send('推荐几道菜');assert.equal(e.page.data.input,'推荐几道菜');assert.equal(e.page.data.busy,false);assert.match(e.page.data.notice,/超时/);assert.equal(e.business(),before);
});
test('Android assistant input defers disk writes, and quick recommendation only fills the composer',t=>{
  const e=setup(t);t.mock.timers.enable({apis:['setTimeout']});const before=e.business(),writes=e.memory.size;for(let i=0;i<100;i++)e.page.input({detail:{value:'推荐'+i}});assert.equal(e.memory.size,writes);t.mock.timers.tick(500);assert.equal(e.memory.get('ysf-fugui-input-v1'),'推荐99');e.page.quickTask({currentTarget:{dataset:{kind:'recommend'}}});assert.match(e.page.data.input,/推荐几道菜/);assert.equal(e.business(),before);assert.equal(e.navigation.length,0);
});
test('assistant model prompt and Android-only migration adapters are reproducible',()=>{
  const migration=fs.readFileSync(new URL('../scripts/sync-baseline.mjs',import.meta.url),'utf8'),model=fs.readFileSync(new URL('../client/features/utils/model.js',import.meta.url),'utf8');assert.ok(migration.includes("baselineVersion='2026.10.22-r1'"));assert.ok(migration.includes("--baseline="));assert.ok(fs.readFileSync(new URL('../client/features/pages/fridge/index.js',import.meta.url),'utf8').includes('incoming.prepareDraft'));assert.ok(model.includes("if(task==='assistant')"));assert.match(require('../client/overrides/assistant-prompt.cjs').prompt({}),/神厨小福贵/);
});
test('real model adapter sends the conversational schema and records billed usage without executing response fields',async t=>{
  const e=setup(t),sent=[];globalThis.platform.request=options=>{sent.push(options);options.success({statusCode:200,data:{choices:[{message:{content:JSON.stringify({reply:'可以先比较这三种做法。',candidates:[dish(),dish('番茄里脊'),dish('葱爆里脊')]})}}],usage:{prompt_tokens:200,completion_tokens:300,total_tokens:500}}});};
  const result=await rawModelCall({provider:'mimo',model:'mimo-v2.6-flash',baseUrl:'https://api.xiaomimimo.com/v1'},'TEST_ONLY','assistant',{text:'推荐几道猪里脊的菜',conversation:[]});assert.equal(result.candidates.length,3);assert.match(sent[0].data.messages[1].content,/神厨小福贵/);assert.match(sent[0].data.messages[1].content,/不能声称已经录入/);assert.equal(sent[0].url,'https://api.xiaomimimo.com/v1/chat/completions');const data=e.store.getData();assert.equal(data.aiUsage.length,1);assert.equal(data.aiUsage[0].task,'assistant');assert.equal(data.history.length,0);assert.equal(data.recipes.length,0);
});
test('past dates, external meals and incomplete recipe candidates are protected',async t=>{
  const e=setup(t),rows=addCandidates(e.page),target=assistant.destination('明天晚餐');assert.throws(()=>assistant.destination(util('date').addDays(util('date').today(),-1)+' 晚餐'),/未来/);e.store.update(data=>{const p=util('planning'),week=p.getWeek(data,target.weekStart);p.putWeek(data,target.weekStart,week.days.map(row=>row.date===target.date&&row.mealSlot===target.mealSlot?{...row,mealType:'other',otherInfo:'聚餐'}:row),[],'');});const before=e.business();await e.send('第二道安排明天晚餐');assert.match(e.page.data.notice,/其他用餐/);assert.equal(e.business(),before);e.page.append('缺步骤',{candidates:[{...rows[0],id:'incomplete',steps:[]}]});await e.send('收藏第一道');assert.match(e.page.data.notice,/完整做法/);assert.equal(e.store.getData().recipes.length,0);
});
