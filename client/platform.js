import {cachedStorage} from './storage-cache.js';
let serial=0;const pending=new Map();let ui={toast:message=>console.info(message)};
export function setUi(value){ui={...ui,...value};}
export const native=!!globalThis.AndroidBridge;
const storage=native?cachedStorage(globalThis.AndroidBridge):null;
globalThis.__nativeResult=(id,ok,value)=>{const row=pending.get(id);if(!row)return;clearTimeout(row.timer);pending.delete(id);if(ok)row.resolve(value);else row.reject(Error(String(value||'操作失败，请重试')));};
export function callNative(method,args={},timeout=80000){
  if(!native)return Promise.reject(Error('此功能需要在安卓App中使用'));
  const id=String(++serial);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('操作等待超时，请重试'));},timeout);pending.set(id,{resolve,reject,timer});try{AndroidBridge.invoke(id,method,JSON.stringify(args));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});
}
function callbacks(options,operation){operation.then(result=>{options.success?.(result);options.complete?.(result);},error=>{const result={errMsg:error.message};options.fail?.(result);options.complete?.(result);if(!options.fail)ui.toast(error.message);});}
export function getStored(key){try{const raw=native?storage.get(key):localStorage.getItem('neichusi:'+key);return raw?JSON.parse(raw):'';}catch(error){throw Error('本机数据读取失败，请保留数据并尝试重启App：'+error.message);}}
export function setStored(key,value){const raw=JSON.stringify(value);if(native){if(!storage.set(key,raw))throw Error('本机数据未保存，请检查存储空间');}else localStorage.setItem('neichusi:'+key,raw);}
export function removeStored(key){if(native){if(!storage.remove(key))throw Error('无法移除本机记录');}else localStorage.removeItem('neichusi:'+key);}
const handlers={start:[],stop:[],error:[]};
let recording=false;
globalThis.__recorderEvent=(kind,value)=>{if(kind==='stop'||kind==='error')recording=false;handlers[kind]?.forEach(callback=>callback(value));};
const recorder={
  onStart:callback=>handlers.start.push(callback),onStop:callback=>handlers.stop.push(callback),onError:callback=>handlers.error.push(callback),
  start(options){if(recording)return;recording=true;callNative('recordStart',{duration:Math.min(options.duration||60000,60000)}).then(()=>globalThis.__recorderEvent('start',{}),error=>globalThis.__recorderEvent('error',{errMsg:error.message}));},
  stop(){callNative('recordStop').catch(error=>globalThis.__recorderEvent('error',{errMsg:error.message}));}
};
const mediaStore=new Map();
export const platform={
  getStorageSync:getStored,setStorageSync:setStored,removeStorageSync:removeStored,
  getWindowInfo:()=>({windowWidth:innerWidth,windowHeight:innerHeight}),nextTick:callback=>requestAnimationFrame(()=>requestAnimationFrame(callback)),
  showToast:options=>ui.toast(options.title),
  showModal(options){ui.dialog({kind:'modal',options});},
  showActionSheet(options){ui.dialog({kind:'sheet',options});},
  switchTab:options=>ui.navigate(options.url,'tab'),navigateTo:options=>ui.navigate(options.url,'push'),navigateBack:()=>ui.navigate(null,'back'),
  pageScrollTo(options){requestAnimationFrame(()=>requestAnimationFrame(()=>{const target=options.selector&&document.querySelector(options.selector);if(target){target.scrollIntoView({behavior:'smooth',block:'start'});options.success?.({});}else if(options.scrollTop!=null)window.scrollTo({top:options.scrollTop,behavior:'smooth'});else options.fail?.({errMsg:'未找到目标面板'});}));},
  authorize(options){callbacks(options,callNative('microphonePermission'));},
  openSetting(options){callbacks(options,callNative('settings'));},
  getRecorderManager:()=>recorder,
  request(options){const promise=native?callNative('request',{url:options.url,method:options.method||'GET',headers:options.header||{},data:options.data,timeout:Math.min(options.timeout||65000,70000)},80000):fetch(options.url,{method:options.method||'GET',headers:options.header,body:options.data==null?undefined:JSON.stringify(options.data)}).then(async response=>{const text=await response.text();let data=text;try{data=JSON.parse(text);}catch{}return {statusCode:response.status,data};});callbacks(options,promise);return {abort(){/* Native request has a bounded timeout; callers discard stale results. */}};},
  chooseMedia(options){
    if(native){callbacks(options,callNative('chooseImages',{count:Math.min(options.count||1,6)},180000));return;}
    const input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=options.count>1;input.oncancel=()=>options.fail?.({errMsg:'cancel'});input.onchange=async()=>{const files=Array.from(input.files||[]).slice(0,options.count||1),tempFiles=[];for(const file of files){const url=URL.createObjectURL(file);mediaStore.set(url,file);tempFiles.push({tempFilePath:url,size:file.size});}options.success?.({tempFiles});};input.click();
  },
  compressImage(options){if(native)callbacks(options,callNative('compressImage',{path:options.src,quality:options.quality||85}));else options.success?.({tempFilePath:options.src});},
  getFileSystemManager(){return {
    readFile(options){if(native)callbacks(options,callNative('readFile',{path:options.filePath}));else{const blob=mediaStore.get(options.filePath);if(!blob)return options.fail?.({errMsg:'图片无法读取，请重新添加'});const reader=new FileReader();reader.onload=()=>options.success?.({data:String(reader.result).split(',')[1]});reader.onerror=()=>options.fail?.({errMsg:'图片读取失败'});reader.readAsDataURL(blob);}},
    saveFile(options){if(native)callbacks(options,callNative('saveFile',{path:options.tempFilePath}));else options.success?.({savedFilePath:options.tempFilePath});}
  };},
  saveFile(options){platform.getFileSystemManager().saveFile(options);},
  previewImage(options){ui.dialog({kind:'preview',path:options.current||options.urls?.[0],options});},
  setClipboardData(options){callbacks(options,native?callNative('clipboardSet',{text:options.data}):navigator.clipboard.writeText(options.data).then(()=>({})));},
  getClipboardData(options){callbacks(options,native?callNative('clipboardGet'):navigator.clipboard.readText().then(data=>({data})));}
};
globalThis.platform=platform;
