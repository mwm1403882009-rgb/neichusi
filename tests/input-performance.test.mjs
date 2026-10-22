import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {controller} from '../client/state.js';
const require=createRequire(import.meta.url);
const util=name=>require('../client/features/utils/'+name+'.js');
function setup(t){
  t.mock.timers.reset();
  t.mock.timers.enable({apis:['setTimeout']});
  const memory=new Map(),counts={reads:0,writes:0},application={globalData:{}};
  globalThis.getApplication=()=>application;
  globalThis.platform={getStorageSync:key=>{counts.reads++;return memory.has(key)?structuredClone(memory.get(key)):'';},setStorageSync:(key,value)=>{counts.writes++;memory.set(key,structuredClone(value));},removeStorageSync:key=>memory.delete(key),showToast(){},showModal:o=>o.success?.({confirm:true}),showActionSheet:o=>o.success?.({tapIndex:0}),pageScrollTo(){},nextTick:callback=>callback()};
  let definition;globalThis.defineScreen=value=>{definition=value;};const file=require.resolve('../client/features/pages/week/index.js');delete require.cache[file];require(file);
  const page=controller(definition),store=util('store');store.getData();page.onShow();
  return{page,store,counts,resetCounts(){counts.reads=0;counts.writes=0;},input(text){page.editLines({currentTarget:{dataset:{field:'ingredients'}},detail:{value:text}});},tick(ms=500){t.mock.timers.tick(ms);}};
}
test('continuous ingredient deletion performs no synchronous storage or whole-screen updates',t=>{
  const env=setup(t),{page,counts}=env;page.changeCurrent({name:'炒猪肉',ingredients:['猪肉1份','辣椒1份']});env.resetCounts();const version=page.getVersion();let text=Array.from({length:20},(_,i)=>'食材'+i+' 1份').join('\n');
  for(let i=0;i<120;i++){text=text.slice(0,-1);env.input(text);}
  assert.equal(counts.reads,0,'editing must not repeatedly decrypt the entire Android store');assert.equal(counts.writes,0,'editing must not commit storage per key');assert.equal(page.getVersion(),version,'focused input must not trigger full-screen recalculation');assert.equal(page.data.ingredientsText,text);assert.deepEqual(page.data.current.ingredients,util('recipe-data').lines(text));
  env.tick();assert.ok(counts.writes>0);assert.equal(page.getVersion(),version+1);
});
test('a typing burst saves only the final text and reconciles costs once after idle',t=>{
  const env=setup(t),{page,store}=env;store.update(data=>{data.fridge=[{id:'pork',name:'猪肉',amount:500,unit:'g',portions:2,totalPrice:20},{id:'pepper',name:'辣椒',amount:200,unit:'g',portions:2,totalPrice:6}];});page.onShow();page.changeCurrent({name:'炒猪肉',ingredients:['猪肉1份','辣椒1份'],ingredientUses:[{id:'p',inventoryId:'pork',name:'猪肉',quantity:1,unit:'份'},{id:'v',inventoryId:'pepper',name:'辣椒',quantity:1,unit:'份'}]});
  const key=page.data.weekStart;env.input('猪肉1份\n辣椒');env.tick(200);env.input('猪肉1份\n');env.tick(200);assert.equal(util('planning').getWeek(store.getData(),key).days[0].ingredients.length,2);env.tick(300);const saved=util('planning').getWeek(store.getData(),key).days[0];assert.deepEqual(saved.ingredients,['猪肉1份']);assert.equal(saved.ingredientUses.length,1);assert.equal(page.data.costQuote.total,10);assert.equal(store.getData().history.length,0);
});
test('immediate confirmation flushes latest ingredient edits and deducts only that meal once',t=>{
  const env=setup(t),{page,store}=env;store.update(data=>{data.fridge=[{id:'pork',name:'猪肉',amount:500,unit:'g',portions:2,totalPrice:20},{id:'pepper',name:'辣椒',amount:200,unit:'g',portions:2,totalPrice:6}];});page.onShow();page.changeCurrent({name:'炒猪肉',cookSteps:['炒熟'],ingredients:['猪肉1份','辣椒1份'],ingredientUses:[{id:'p',inventoryId:'pork',name:'猪肉',quantity:1,unit:'份'},{id:'v',inventoryId:'pepper',name:'辣椒',quantity:1,unit:'份'}]});env.input('猪肉1份');page.confirmMeal();page.confirmMeal();env.tick();const data=store.getData();assert.equal(data.history.length,1);assert.equal(data.history[0].totalCost,10);assert.equal(util('inventory').remainingInfo(data.fridge[0]).actual,1);assert.equal(util('inventory').remainingInfo(data.fridge[1]).actual,2);
});
test('switching meals or weeks flushes the original draft and cancels stale timers',t=>{
  const env=setup(t),{page,store}=env;page.changeCurrent({name:'原餐'});const start=page.data.weekStart;env.input('猪肉1份\n\n辣椒1份\n');page.selectDay(1);env.input('鸡蛋2个');page.moveWeek({currentTarget:{dataset:{step:1}}});env.tick();const days=util('planning').getWeek(store.getData(),start).days;assert.deepEqual(days[0].ingredients,['猪肉1份','辣椒1份']);assert.deepEqual(days[1].ingredients,['鸡蛋2个']);assert.equal(page.data.current.name,'');
});
test('pause, unload and input blur flush drafts without waiting for a debounce timer',t=>{
  for(const method of ['flushPendingInput','onHide','onUnload']){const env=setup(t),{page,store}=env;env.input('鸡蛋2个');assert.equal(typeof page.flushPendingInput,'function');page[method]();assert.deepEqual(util('planning').getWeek(store.getData(),page.data.weekStart).days[0].ingredients,['鸡蛋2个']);env.tick();}
});
test('failed persistence retains input and prevents confirmation until retry succeeds',t=>{
  const env=setup(t),{page,store}=env;page.changeCurrent({name:'炒猪肉'});env.input('猪肉1份');const write=platform.setStorageSync;platform.setStorageSync=()=>{throw Error('storage full');};page.confirmMeal();assert.ok(page._pendingInput);assert.equal(page.data.ingredientsText,'猪肉1份');assert.equal(store.getData().history.length,0);assert.match(page.data.notice,/写入失败|存储/);platform.setStorageSync=write;assert.equal(page.flushPendingInput(),true);assert.equal(page._pendingInput,null);assert.deepEqual(util('planning').getWeek(store.getData(),page.data.weekStart).days[0].ingredients,['猪肉1份']);
});
test('clearing ingredients completely removes planned uses but does not change actual stock or history',t=>{
  const env=setup(t),{page,store}=env;store.update(data=>{data.fridge=[{id:'pork',name:'猪肉',amount:500,unit:'g',portions:2,totalPrice:20}];});page.onShow();page.changeCurrent({name:'炒猪肉',ingredients:['猪肉1份'],ingredientUses:[{id:'p',inventoryId:'pork',name:'猪肉',quantity:1,unit:'份'}]});const before=JSON.stringify(store.getData().fridge);env.input('');env.tick();assert.deepEqual(page.data.current.ingredients,[]);assert.deepEqual(page.data.current.ingredientUses,[]);assert.equal(page.data.ingredientsText,'');assert.equal(JSON.stringify(store.getData().fridge),before);assert.equal(store.getData().history.length,0);
});
test('name, method and ingredients edited together persist as one coherent draft',t=>{
  const env=setup(t),{page,store}=env;page.editField({currentTarget:{dataset:{field:'name'}},detail:{value:'牛肉炒豆芽'}});page.editMethod({detail:{value:'\n牛肉切片\n\n加入豆芽炒熟\n'}});env.input('牛肉1份\n\n豆芽100g\n');env.tick();const saved=util('planning').getWeek(store.getData(),page.data.weekStart).days[0];assert.equal(saved.name,'牛肉炒豆芽');assert.deepEqual(saved.ingredients,['牛肉1份','豆芽100g']);assert.deepEqual(saved.cookSteps,['牛肉切片','加入豆芽炒熟']);assert.equal(page.data.ingredientsText,'牛肉1份\n\n豆芽100g\n');assert.equal(page.data.methodText,'\n牛肉切片\n\n加入豆芽炒熟\n');
});
test('Android input override is reapplied on migration and native blur flushes pending input',()=>{
  const migration=fs.readFileSync(new URL('../scripts/sync-baseline.mjs',import.meta.url),'utf8'),client=fs.readFileSync(new URL('../client/main.jsx',import.meta.url),'utf8');assert.ok(migration.includes("require('../../../overrides/week-input.cjs').enhance({"));assert.ok(migration.includes('must not silently import later mini-program changes'));assert.ok(client.includes('owner.flushPendingInput?.()'));assert.ok(client.includes('if(!focused.current)setText(String(external))'));
});
