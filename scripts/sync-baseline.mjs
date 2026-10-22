import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseTemplate,portableCss} from './template.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const appVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const source=path.resolve(root,'../wechat-miniprogram/miniprogram');
const baselineVersion='2026.10.22-r1';
if(!process.argv.includes('--baseline='+baselineVersion))throw Error('Explicit --baseline='+baselineVersion+' required; this command must not silently import later mini-program changes.');
if(!fs.readFileSync(path.join(source,'pages/mine/index.wxml'),'utf8').includes('个人自用版 · '+baselineVersion))throw Error('The mini-program version does not match the explicitly selected Android baseline.');
const output=path.join(root,'client/features');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'package.json'),'{"type":"commonjs"}\n');
const config=JSON.parse(fs.readFileSync(path.join(source,'app.json'),'utf8'));
const hashes={};
function read(file){const text=fs.readFileSync(path.join(source,file),'utf8');hashes[file]=crypto.createHash('sha256').update(text).digest('hex');return text;}
function adapt(text){return text.replace(/\bwx\b/g,'platform').replace(/\bgetApp\b/g,'getApplication').replace(/\bPage\(/g,'defineScreen(').replace(/\bComponent\(/g,'defineWidget(').replace(/\bApp\(/g,'defineApplication(').replace(/退出小程序重进/g,'退出App重进').replace(/当前微信版本/g,'当前App版本').replace(/微信单项存储上限/g,'单项备份安全上限').replace(/微信本地/g,'App本地').replace(/小程序照片接口需要隐私声明[^']*/g,'照片访问失败，请在系统设置检查相机和照片权限');}
for(const file of fs.readdirSync(path.join(source,'utils')).filter(name=>name.endsWith('.js'))){let code=adapt(read('utils/'+file));
  // Native AudioRecord writes a real 16 kHz PCM WAV, supported by MiMo ASR.
  if(file==='model.js'){
    code=code.replace("'data:audio/mp3;base64,'", "'data:audio/wav;base64,'").replace("format: 'mp3'", "format: 'wav'");
    const replacements=[
      ["images.map(url => /^(?:data:|https?:)/i.test(url) ? url : readImage(url))", "images.map(url => require('../../overrides/image-input.cjs').resolve(url,readImage))"],
      ['success: result => resolve(`data:${mimeFromPath(path)};base64,${result.data}`),', "success: result => {try{resolve(require('../../overrides/image-input.cjs').asDataUrl(result.data));}catch(error){reject(error);}},"],
      ['if (response.statusCode < 200 || response.statusCode >= 300) throw responseError(response, body, settings);', "if (response.statusCode < 200 || response.statusCode >= 300) throw images.length ? require('../../overrides/image-input.cjs').requestError(responseError(response,body,settings),response,settings,selectedModel) : responseError(response, body, settings);"],
      ['if (repairedResponse.statusCode < 200 || repairedResponse.statusCode >= 300) throw responseError(repairedResponse, repairedBody, settings);', "if (repairedResponse.statusCode < 200 || repairedResponse.statusCode >= 300) throw images.length ? require('../../overrides/image-input.cjs').requestError(responseError(repairedResponse,repairedBody,settings),repairedResponse,settings,selectedModel) : responseError(repairedResponse, repairedBody, settings);"]
    ];
    for(const [before,after]of replacements){if(!code.includes(before))throw Error('Android image adapter no longer matches baseline: '+before);code=code.replace(before,after);}
  }
  if(file==='photos.js')code=code.replace(/function isLocal\(path\)\{[^\n]*\}/,"function isLocal(path){return typeof path==='string' && /^https:\\/\\/appassets\\.androidplatform\\.net\\/(?:media|temp)\\/[a-zA-Z0-9._-]+$/.test(path);}").replace(/请在微信的小程序设置中开启后重试/g,'请在安卓系统的App权限中开启后重试').replace(/请更新微信后重试/g,'请更新App后重试').replace(/当前微信无法保存本机照片/g,'当前App无法保存本机照片');

  if(file==='public-recipe.js')code=code.replace(/function runtimeInfo\(\)\{[^\n]*\}/,"function runtimeInfo(){return '内厨司 Android "+appVersion+" · 基准 "+baselineVersion+"';}").replace(/微信原始错误/g,'安卓原始错误').replace(/微信拦截了链接或跳转域名请求/g,'公开链接请求被拦截');
  if(file==='defaults.js'){code=code.replace(/function initialData\(\) \{[\s\S]*?\r?\nmodule\.exports/,"function initialData() { return {version:3,recipes:[],weekPlan:[],weekPrompt:'',batchSteps:[],fridge:[],prices:[],history:[],aiUsage:[],purchases:[],priceLogs:[],priceAlerts:[],frequentStock:[]}; }\nmodule.exports");}
  fs.mkdirSync(path.join(output,'utils'),{recursive:true});fs.writeFileSync(path.join(output,'utils',file),code);
}
const templates={}, styles={},titles={};
for(const page of config.pages.filter(name=>!name.includes('/today/'))){const dir=path.dirname(page);fs.mkdirSync(path.join(output,dir),{recursive:true});fs.writeFileSync(path.join(output,page+'.js'),adapt(read(page+'.js')));let template=read(page+'.wxml');
  if(page==='pages/mine/index'){template=template.replace('个人自用版 · '+baselineVersion,'安卓预览版 · '+appVersion+' · 基准 '+baselineVersion).replace('换手机、清理微信数据或切换小程序版本前先备份。图片和 API Key 不会进入备份。','卸载或换机前请备份。可恢复小程序 JSON 备份；旧照片路径不能跨应用读取。API Key 不进入备份。').replace('当前为个人自用本地版：数据只在这台手机的微信里，不会自动同步到电脑或其他手机。','内厨司安卓本地版：数据保存在当前App，不自动与微信或其他手机同步。卸载会清除数据；语音、图片仅在主动调用时发往所选模型服务商。');}
  if(page==='pages/model/index')template=template.replace('手机使用需在同一 AppID 的微信公众平台“开发管理 → 开发设置 → 服务器域名”添加此域名。','安卓App直接连接你配置的HTTPS服务，不需要配置微信合法域名；请核对服务商地址及账号权限。').replace('当前需要放行的 request 域名','当前API服务器').replace('复制语音 request 域名','复制语音服务器').replace('只在今日推荐主动勾选后启用','只在内厨司主动勾选后启用');
  if(page==='pages/week/index'){
    const file=path.join(output,page+'.js'),code=fs.readFileSync(file,'utf8');
    if(!code.includes('defineScreen({')||!code.trimEnd().endsWith('});'))throw Error('Android weekly input adapter no longer matches baseline');
    fs.writeFileSync(file,code.replace('defineScreen({',"defineScreen(require('../../../overrides/week-input.cjs').enhance({").replace(/\}\);\s*$/,'}));\n'));
  }
  templates[page]=parseTemplate(template);styles[page]=portableCss(read(page+'.wxss'));titles[page]=JSON.parse(read(page+'.json')).navigationBarTitleText||'内厨司';
}
const widgets={};for(const name of ['stock-form','photo-picker']){const base='components/'+name+'/index';fs.mkdirSync(path.join(output,'components',name),{recursive:true});fs.writeFileSync(path.join(output,base+'.js'),adapt(read(base+'.js')));widgets[name]={template:parseTemplate(read(base+'.wxml')),css:portableCss(read(base+'.wxss'))};}
fs.writeFileSync(path.join(output,'app.js'),adapt(read('app.js')));
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({baseline:baselineVersion,pages:Object.keys(templates),tabs:config.tabBar.list,titles,templates,styles,widgets,css:portableCss(read('app.wxss'))}));
fs.writeFileSync(path.join(root,'baseline.json'),JSON.stringify({version:baselineVersion,files:hashes},null,2)+'\n');
console.log('Synced '+Object.keys(hashes).length+' baseline files; no WeChat project, AppID, keys or user storage copied.');
