import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const model=require('../client/features/utils/model.js');
// Public, synthetic 1-pixel PNG. No personal image or paid credentials are used.
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=';
const settings={provider:'mimo',label:'小米 MiMo',model:'mimo-v2.6-flash',visionModel:'mimo-v2.6-flash',baseUrl:'https://api.xiaomimimo.com/v1'};
function environment({failure=false,data=PNG,rejected=false}={}){
  const sent=[],reads=[],memory=new Map();globalThis.getApplication=()=>({globalData:{}});
  globalThis.platform={getStorageSync:key=>memory.get(key)||'',setStorageSync:(key,value)=>memory.set(key,value),removeStorageSync:key=>memory.delete(key),
    getFileSystemManager:()=>({readFile(options){reads.push(options.filePath);if(failure)options.fail({errMsg:'测试文件不存在'});else options.success({data});}}),
    request(options){sent.push(options.data);options.success(rejected?{statusCode:400,data:{error:{message:'Param Incorrect'}}}:{statusCode:200,data:{choices:[{message:{content:'{"ok":true,"rawText":"测试订单"}'}}]}});}};
  return {sent,reads};
}
test('MiMo receives actual Base64 bytes for an Android temporary order image',async()=>{const env=environment(),url='https://appassets.androidplatform.net/temp/image-test.png';await model.call(settings,'test-only-key','receiptOcr',{},[url]);assert.deepEqual(env.reads,[url]);assert.equal(env.sent[0].model,'mimo-v2.6-flash');assert.equal(env.sent[0].messages[1].content[1].image_url.url,'data:image/png;base64,'+PNG);assert.ok(!JSON.stringify(env.sent).includes('appassets.androidplatform.net'));});
test('saved Android photo is also read locally rather than sent as public URL',async()=>{const env=environment(),url='https://appassets.androidplatform.net/media/photo-test.jpg';await model.call(settings,'test-only-key','visionTest',{},[url]);assert.deepEqual(env.reads,[url]);assert.equal(env.sent[0].messages[1].content[1].image_url.url,'data:image/png;base64,'+PNG);});
test('public URLs and existing data URLs are preserved without local file reads',async()=>{const env=environment(),urls=['https://example.com/public.png','data:image/png;base64,'+PNG];await model.call(settings,'test-only-key','visionTest',{},urls);assert.equal(env.reads.length,0);assert.deepEqual(env.sent[0].messages[1].content.slice(1).map(row=>row.image_url.url),urls);});
test('unreadable local file stops before any provider request',async()=>{const env=environment({failure:true});await assert.rejects(()=>model.call(settings,'test-only-key','receiptOcr',{},['https://appassets.androidplatform.net/temp/missing.png']),/不存在|读取失败/);assert.equal(env.sent.length,0);});
test('multiple local order screenshots keep input order and do not leak device URLs',async()=>{const env=environment(),urls=['https://appassets.androidplatform.net/temp/a.png','https://appassets.androidplatform.net/media/b.png'];await model.call(settings,'test-only-key','receiptOcr',{},urls);assert.deepEqual(env.reads,urls);assert.equal(env.sent[0].messages[1].content.length,3);for(const part of env.sent[0].messages[1].content.slice(1))assert.equal(part.image_url.url,'data:image/png;base64,'+PNG);});
test('invalid file bytes are rejected locally, not relabelled as a JPEG image',async()=>{const env=environment({data:Buffer.from('not an image').toString('base64')});await assert.rejects(()=>model.call(settings,'test-only-key','receiptOcr',{},['https://appassets.androidplatform.net/temp/bad.jpg']),/图片|格式/);assert.equal(env.sent.length,0);});
test('provider parameter error identifies image request, model and HTTP status',async()=>{environment({rejected:true});await assert.rejects(()=>model.call(settings,'test-only-key','receiptOcr',{},['data:image/png;base64,'+PNG]),error=>/图片/.test(error.message)&&/mimo-v2.6-flash/.test(error.message)&&/400/.test(error.message));});
