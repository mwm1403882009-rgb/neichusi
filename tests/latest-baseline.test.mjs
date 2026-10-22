import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {controller} from '../client/state.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),util=name=>require('../client/features/utils/'+name+'.js');
function setup(t){const memory=new Map(),app={globalData:{}};globalThis.getApplication=()=>app;globalThis.platform={getStorageSync:key=>memory.has(key)?structuredClone(memory.get(key)):'',setStorageSync:(key,value)=>memory.set(key,structuredClone(value)),removeStorageSync:key=>memory.delete(key),showModal:o=>o.success?.({confirm:true}),showToast(){},switchTab(){},navigateTo(){},pageScrollTo(){}};t.mock.method(util('model'),'getApiKey',()=> 'TEST_ONLY');const store=util('store');store.getData();return{store,memory};}
function screen(name){let def;globalThis.defineScreen=v=>{def=v;};const file=require.resolve('../client/features/pages/'+name+'/index.js');delete require.cache[file];require(file);return controller(def);}
test('latest mini-program baseline is explicit and the removed homepage sentence is absent',()=>{
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'baseline.json'))),manifest=JSON.parse(fs.readFileSync(path.join(root,'client/features/manifest.json')));assert.equal(baseline.version,'2026.10.22-r1');assert.equal(manifest.baseline,baseline.version);assert.ok(baseline.files['utils/public-recipe.js']);assert.ok(baseline.files['utils/home-assistant.js']);assert.ok(!JSON.stringify(manifest.templates['pages/home/index']).includes('可以先聊吃什么'));assert.ok(!fs.readFileSync(path.join(root,'client/assistant-view.jsx'),'utf8').includes('选好再安排，不会一问就录入'));
  assert.throws(()=>execFileSync(process.execPath,['scripts/sync-baseline.mjs'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}),error=>error.status===1&&error.stderr.includes('Explicit --baseline=2026.10.22-r1 required'));
});
test('actual Tuesday outside dining saves other with zero cost, survives reload and counts only once',async t=>{
  const {store}=setup(t),dates=util('date'),start=dates.mondayOf(dates.today()),date=dates.addDays(start,1);store.update(data=>{data.fridge=[{id:'pork',name:'猪肉',amount:500,unit:'g',portions:2,totalPrice:20}];});const before=JSON.stringify(store.getData().fridge),log=screen('meal-log');t.mock.method(util('model'),'call',async()=>({date,mealSlot:'晚餐',name:'炒年糕',cost:0,steps:[]}));log.setData({text:'周二晚上在外吃了炒年糕，0元'});await log.parse();assert.equal(log.data.mealTypeIndex,1);log.confirm();log.confirm();assert.equal(store.getData().history.length,1);assert.equal(store.getData().history[0].mealType,'other');assert.equal(store.getData().recipes.length,0);assert.equal(JSON.stringify(store.getData().fridge),before);
  const week=screen('week');week.onShow();assert.equal(week.data.stats.other.count,1);assert.equal(week.data.stats.other.costText,'0.00');week.selectDay(3);assert.equal(week.data.current.otherInfo,'炒年糕');assert.ok(week.data.current.confirmedAt);store.safeImport(store.safeExport());const reloaded=screen('week');reloaded.onShow();assert.equal(reloaded.data.stats.other.count,1);
});
test('legacy other meal with missing type or missing history is counted without rewriting money or stock',t=>{
  setup(t);const stats=util('meal-stats'),day={date:'2026-10-20',mealSlot:'晚餐',mealType:'other',otherInfo:'炒年糕',otherCost:0,historyId:'h',confirmedAt:'legacy'},data={fridge:[],history:[{id:'h',date:day.date,mealSlot:day.mealSlot,name:'炒年糕',totalCost:0}]},before=JSON.stringify(data);let result=stats.summary(data,'2026-10-19',[day]);assert.equal(result.other.count,1);assert.equal(result.self.count,0);assert.equal(JSON.stringify(data),before);result=stats.summary({fridge:[],history:[]},'2026-10-19',[day,day]);assert.equal(result.other.count,1);assert.equal(result.planOther.count,0);
  const {confirmedAt,...draft}=day;result=stats.summary({fridge:[],history:[]},'2026-10-19',[draft]);assert.equal(result.other.count,0);assert.equal(result.planOther.count,1);
});
test('explicit self history and ingredient evidence cannot be reclassified merely by a later outside draft',t=>{
  setup(t);const stats=util('meal-stats'),day={date:'2026-10-20',mealSlot:'晚餐',mealType:'other',otherInfo:'炒年糕',confirmedAt:'old'},history=[{date:day.date,mealSlot:day.mealSlot,name:day.otherInfo,totalCost:0,recipeSnapshot:{ingredients:['年糕1份']}}];const result=stats.summary({fridge:[],history},'2026-10-19',[day]);assert.equal(result.self.count,1);assert.equal(result.other.count,0);
});
test('shared source reader follows bounded public redirects and parses real body data, not a title',async t=>{
  setup(t);const noteId='1234567890abcdef12345678',body='食材：猪肉1份，青椒1个\n做法：1. 猪肉切片，青椒洗净切块。2. 热锅炒熟猪肉后加入青椒翻炒至熟。',urls=[];platform.request=options=>{urls.push(options.url);assert.equal(options.header.Authorization,undefined);assert.equal(options.header.Cookie,undefined);if(urls.length===1)options.success({statusCode:302,header:{Location:'https://www.xiaohongshu.com/explore/'+noteId},data:''});else options.success({statusCode:200,data:'<script>window.__INITIAL_STATE__='+JSON.stringify({noteData:{data:{noteData:{noteId,title:'青椒炒肉',desc:body,imageList:[]}}}})+'</script>'});};const result=await util('public-recipe').read('https://xhslink.cn/o/example');assert.equal(urls.length,2);assert.equal(result.title,'青椒炒肉');assert.equal(result.body,body);assert.equal(result.readMode,'mobile');
});
test('public reader rejection preserves diagnostics without claiming WeChat AppID on Android',async t=>{
  setup(t);platform.request=options=>options.fail({errMsg:'test request denied'});await assert.rejects(()=>util('public-recipe').read('https://xhslink.cn/o/test'),error=>{assert.match(error.readDiagnostic,/内厨司 Android 0.1.4/);assert.ok(!error.readDiagnostic.includes('当前AppID'));return true;});
});
test('Java request policy enforces separate public-read and authenticated-model boundaries',()=>{
  const bin=path.join(root,'.tools/jdk/bin'),out=path.join(root,'build/policy-tests');fs.mkdirSync(out,{recursive:true});execFileSync(path.join(bin,'javac.exe'),['-encoding','UTF-8','--release','8','-d',out,path.join(root,'native/src/cn/neichusi/app/RequestPolicy.java'),path.join(root,'tests/native/RequestPolicyTest.java')],{windowsHide:true});const result=execFileSync(path.join(bin,'java.exe'),['-cp',out,'cn.neichusi.app.RequestPolicyTest'],{encoding:'utf8',windowsHide:true});assert.match(result,/PASS: 37 native policy assertions/);
  const source=fs.readFileSync(path.join(root,'native/src/cn/neichusi/app/MainActivity.java'),'utf8');assert.ok(source.includes('status>=300&&status<400&&!publicRead'));assert.ok(source.includes('if(publicRead&&location!=null)'));assert.ok(source.includes('RequestPolicy.headerAllowed(publicRead,key)'));assert.ok(source.includes('setInstanceFollowRedirects(false)'));
});
