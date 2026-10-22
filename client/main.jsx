import React,{useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import manifest from './features/manifest.json';
import packageInfo from '../package.json';
import {platform,setUi,callNative,native} from './platform';
import {controller} from './state';
import {value} from './binding';
import {AssistantView,assistantCss} from './assistant-view';
const h=React.createElement;
// Display the APK version without re-importing a newer, independent mini-program baseline.
function versionLabel(node){if(!node||typeof node!=='object')return;node.children=node.children.map(child=>{if(typeof child==='string')return child.replace(/安卓预览版 · \d+\.\d+\.\d+/, '安卓预览版 · '+packageInfo.version);versionLabel(child);return child;});}
versionLabel(manifest.templates['pages/mine/index']);
manifest.titles['pages/home/index']='神厨小福贵';
manifest.tabs.find(tab=>tab.pagePath==='pages/home/index').text='小福贵';
const loaders={
  'pages/home/index':()=>require('./features/pages/home/index.js'),
  'pages/week/index':()=>require('./features/pages/week/index.js'),
  'pages/recipes/index':()=>require('./features/pages/recipes/index.js'),
  'pages/fridge/index':()=>require('./features/pages/fridge/index.js'),
  'pages/mine/index':()=>require('./features/pages/mine/index.js'),
  'pages/recipe-edit/index':()=>require('./features/pages/recipe-edit/index.js'),
  'pages/recipe-import/index':()=>require('./features/pages/recipe-import/index.js'),
  'pages/prices/index':()=>require('./features/pages/prices/index.js'),
  'pages/history/index':()=>require('./features/pages/history/index.js'),
  'pages/model/index':()=>require('./features/pages/model/index.js'),
  'pages/meal-log/index':()=>require('./features/pages/meal-log/index.js')
};
let registering='',app;const definitions={},widgetDefinitions={};
globalThis.defineScreen=definition=>{definitions[registering]=definition;};
globalThis.defineWidget=definition=>{widgetDefinitions[registering]=definition;};
globalThis.defineApplication=definition=>{app=definition;};
globalThis.getApplication=()=>app;
registering='photo-picker';require('./features/components/photo-picker/index.js');
registering='stock-form';require('./features/components/stock-form/index.js');
require('./features/app.js');
const instances=new Map();let current=null,stack=[];
function report(error){console.error(error);platform.showToast({title:error?.message||'操作未完成，请重试'});}
function invoke(owner,name,event){if(!name)return;try{const result=owner[name]?.(event);if(result?.then)result.catch(report);return result;}catch(error){report(error);}}
function style(raw){if(!raw)return undefined;const out={};String(raw).replace(/(-?[\d.]+)rpx/g,'calc(var(--rpx) * $1)').split(';').forEach(pair=>{const i=pair.indexOf(':');if(i>0){const key=pair.slice(0,i).trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase());out[key]=pair.slice(i+1).trim();}});return out;}
function eventFor(owner,attrs,scope,type,detail={},nativeEvent){const dataset={};for(const [key,raw]of Object.entries(attrs))if(key.startsWith('data-'))dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value(raw,scope);return {type,detail,currentTarget:{dataset},target:{dataset},touches:nativeEvent?.touches,changedTouches:nativeEvent?.changedTouches};}
function bind(owner,attrs,scope,key,type,detail,nativeEvent){const name=value(attrs[key]??attrs[key.replace('bind','bind:')],scope);return invoke(owner,name,eventFor(owner,attrs,scope,type,detail,nativeEvent));}
function NativeInput({node,scope,owner,props}){
  const attrs=node.attrs,external=value(attrs.value,scope)??'', [text,setText]=useState(String(external)), focused=useRef(false),composing=useRef(false),last=useRef(external);
  useLayoutEffect(()=>{if(last.current!==external){last.current=external;if(!focused.current)setText(String(external));}},[external]);
  const textarea=node.tag==='textarea',kind=value(attrs.type,scope),password=value(attrs.password,scope),type=password?'password':kind==='number'||kind==='digit'?'text':'text';
  const change=e=>{const text=e.target.value;setText(text);if(!composing.current)bind(owner,attrs,scope,'bindinput','input',{value:text,cursor:e.target.selectionStart},e);};
  const inputProps={...props,value:text,placeholder:value(attrs.placeholder,scope),disabled:!!value(attrs.disabled,scope),maxLength:Number(value(attrs.maxlength,scope))>0?Number(value(attrs.maxlength,scope)):undefined,onChange:change,onCompositionStart:()=>{composing.current=true;},onCompositionEnd:e=>{composing.current=false;change(e);},onFocus:e=>{focused.current=true;bind(owner,attrs,scope,'bindfocus','focus',{value:e.target.value},e);},onBlur:e=>{focused.current=false;bind(owner,attrs,scope,'bindchange','change',{value:e.target.value},e);bind(owner,attrs,scope,'bindblur','blur',{value:e.target.value},e);owner.flushPendingInput?.();}};
  if(!textarea)Object.assign(inputProps,{type,inputMode:kind==='digit'?'decimal':kind==='number'?'numeric':undefined,autoComplete:password?'off':undefined});
  return h(textarea?'textarea':'input',inputProps);
}
function Picker({node,scope,owner,props,children}){const attrs=node.attrs,range=value(attrs.range,scope)||[],rangeKey=attrs['range-key'],mode=attrs.mode;return h('div',{...props,className:(props.className||'')+' app-picker'},children,mode==='date'?h('input',{type:'date',value:value(attrs.value,scope)||'',disabled:!!value(attrs.disabled,scope),onChange:e=>bind(owner,attrs,scope,'bindchange','change',{value:e.target.value},e)}):h('select',{value:value(attrs.value,scope)??0,disabled:!!value(attrs.disabled,scope),onChange:e=>bind(owner,attrs,scope,'bindchange','change',{value:e.target.value},e),'aria-label':typeof children?.[0]==='string'?children[0]:'选择'},range.map((item,index)=>h('option',{key:index,value:index},String(rangeKey?item[rangeKey]:item??'')))));}
function WidgetView({name,attrs,scope,parent}){
  const def=widgetDefinitions[name],props={};for(const key of Object.keys(def.properties||{})){const attr=key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());if(attrs[key]!==undefined||attrs[attr]!==undefined)props[key]=value(attrs[key]??attrs[attr],scope);}
  const [instance]=useState(()=>{const obj=controller(def,props);for(const [key,observer]of Object.entries(def.observers||{}))observer.call(obj,obj.data[key]);return obj;});
  useSyncExternalStore(instance.subscribe,instance.getVersion);instance.triggerEvent=(type,detail)=>bind(parent,attrs,scope,'bind:'+type,type,detail);
  const previous=useRef(JSON.stringify(props));const serialized=JSON.stringify(props);
  useLayoutEffect(()=>{if(previous.current===serialized)return;previous.current=serialized;let changed=false;for(const [key,next]of Object.entries(props)){if(JSON.stringify(instance.data[key])!==JSON.stringify(next)){instance.data[key]=next;def.observers?.[key]?.call(instance,next);changed=true;}}if(changed)instance.setData({});},[serialized]);
  return h('div',{className:'widget-host'},renderChildren(manifest.widgets[name].template.children,instance.data,instance));
}
function renderChildren(nodes,scope,owner){let branch=false,chain=false;const results=[];for(const node of nodes){if(typeof node==='string'){if(node.trim())results.push(value(node,scope));continue;}const attrs=node.attrs;if(attrs['wx:for']!==undefined){results.push(renderNode(node,scope,owner));chain=false;continue;}if(attrs['wx:if']!==undefined){branch=!!value(attrs['wx:if'],scope);chain=true;if(branch)results.push(renderNode(node,scope,owner));}else if(attrs['wx:elif']!==undefined){const show=chain&&!branch&&!!value(attrs['wx:elif'],scope);if(show){branch=true;results.push(renderNode(node,scope,owner));}}else if(attrs['wx:else']!==undefined){if(chain&&!branch)results.push(renderNode(node,scope,owner));chain=false;}else{chain=false;results.push(renderNode(node,scope,owner));}}return results;}
function renderNode(node,scope,owner,loopKey){const attrs=node.attrs;
  if(attrs['wx:for']!==undefined&&loopKey===undefined){const rows=value(attrs['wx:for'],scope);return (Array.isArray(rows)?rows:[]).map((item,index)=>{const key=attrs['wx:key'],childScope={...scope,[attrs['wx:for-item']||'item']:item,[attrs['wx:for-index']||'index']:index},id=key==='*this'?String(item):key?item?.[key]:index;if(attrs['wx:if']!==undefined&&!value(attrs['wx:if'],childScope))return null;return renderNode(node,childScope,owner,String(id??index));});}
  const key=node.id+':'+(loopKey??'');
  if(widgetDefinitions[node.tag])return h(WidgetView,{key,name:node.tag,attrs,scope,parent:owner});
  const children=renderChildren(node.children,scope,owner);
  if(node.tag==='block')return h(React.Fragment,{key},children);
  const props={key,id:value(attrs.id,scope)||undefined,className:value(attrs.class,scope)||undefined,style:style(value(attrs.style,scope))};
  if(attrs.bindtap||attrs.catchtap)props.onClick=e=>{if(attrs.catchtap)e.stopPropagation();bind(owner,attrs,scope,attrs.catchtap?'catchtap':'bindtap','tap',{},e);};
  for(const [type,react]of [['start','onTouchStart'],['move','onTouchMove'],['end','onTouchEnd'],['cancel','onTouchCancel']])if(attrs['bindtouch'+type])props[react]=e=>bind(owner,attrs,scope,'bindtouch'+type,'touch'+type,{},e);
  if(node.tag==='input'||node.tag==='textarea')return h(NativeInput,{key,node,scope,owner,props});
  if(node.tag==='picker')return h(Picker,{key,node,scope,owner,props,children});
  if(node.tag==='switch')return h('input',{...props,type:'checkbox',className:'app-switch',checked:!!value(attrs.checked,scope),disabled:!!value(attrs.disabled,scope),onChange:e=>bind(owner,attrs,scope,'bindchange','change',{value:e.target.checked},e),'aria-label':'切换'});
  if(node.tag==='image')return h('img',{...props,src:value(attrs.src,scope)||undefined,alt:'',loading:'lazy',onError:e=>bind(owner,attrs,scope,'binderror','error',{},e)});
  if(node.tag==='button'){props.type='button';props.disabled=!!value(attrs.disabled,scope);}
  if(node.tag==='scroll-view')props.className=(props.className||'')+(attrs['scroll-x']!==undefined?' app-scroll-x':' app-scroll-y');
  return h(node.tag==='button'?'button':node.tag==='text'?'span':'div',props,children);
}
class Boundary extends React.Component{constructor(props){super(props);this.state={error:null};}static getDerivedStateFromError(error){return {error};}render(){return this.state.error?h('div',{className:'app-error'},'页面显示失败，原数据未清除。\n'+this.state.error.message,h('button',{onClick:()=>location.reload()},'重新打开')):this.props.children;}}
function ScreenView({entry}){const owner=entry.instance;useSyncExternalStore(owner.subscribe,owner.getVersion);return h(React.Fragment,null,h('style',null,manifest.css+'\n'+Object.values(manifest.widgets).map(widget=>widget.css).join('\n')+'\n'+manifest.styles[entry.path]+'\n'+assistantCss),h('main',{className:'app-scroll','data-screen':entry.path},entry.path==='pages/home/index'?h(AssistantView,{owner}):renderChildren(manifest.templates[entry.path].children,owner.data,owner)));}
function Dialog({dialog,close}){
  const [input,setInput]=useState(dialog.options?.placeholderText||''),options=dialog.options||{};
  const result=value=>{close();if(dialog.kind==='sheet'){if(value<0)options.fail?.({errMsg:'cancel'});else options.success?.({tapIndex:value});}else options.success?.({confirm:value,cancel:!value,content:input});};
  let content;
  if(dialog.kind==='preview')content=h(React.Fragment,null,h('img',{src:dialog.path,className:'app-preview'}),h('button',{className:'app-sheet-item',onClick:close},'关闭'));
  else if(dialog.kind==='sheet')content=h(React.Fragment,null,(options.itemList||[]).map((text,index)=>h('button',{key:index,className:'app-sheet-item',onClick:()=>result(index)},text)),h('button',{className:'app-sheet-item',onClick:()=>result(-1)},'取消'));
  else content=h(React.Fragment,null,h('h3',null,options.title||'请确认'),h('p',null,options.content||''),options.editable&&h('textarea',{value:input,onChange:e=>setInput(e.target.value)}),h('div',{className:'app-dialog-actions'},options.showCancel!==false&&h('button',{onClick:()=>result(false)},options.cancelText||'取消'),h('button',{className:'primary',onClick:()=>result(true)},options.confirmText||'确认')));
  return h('div',{className:'app-dialog-overlay'},h('section',{className:'app-dialog',role:'dialog','aria-modal':true},content));
}
function ApplicationView(){
  const [entry,setEntry]=useState(null),[toast,setToast]=useState(''),[dialog,setDialog]=useState(null),timer=useRef();
  const navigate=(url,mode)=>{
    if(dialog){setDialog(null);return;}
    if(mode==='back'){if(!stack.length){if(current?.path!=='pages/home/index')return navigate('/pages/home/index','tab');if(native)callNative('minimize').catch(report);return;}current?.instance.onHide?.();current?.instance.onUnload?.();current.instance._disposed=true;current=stack.pop();current.instance.onShow?.();setEntry(current);requestAnimationFrame(()=>window.scrollTo(0,current.scroll||0));return;}
    const parsed=new URL(url,'https://app.local'),path=parsed.pathname.replace(/^\//,'');if(!loaders[path])return report(Error('找不到这个页面'));
    if(current){current.scroll=window.scrollY;current.instance.onHide?.();if(mode==='push')stack.push(current);else{for(const old of [current,...stack]){if(!instances.has(old.path)){old.instance.onUnload?.();old.instance._disposed=true;}}stack=[];}}
    const isTab=manifest.tabs.some(tab=>tab.pagePath===path);let target=isTab&&instances.get(path);
    if(!target){registering=path;loaders[path]();target={path,instance:controller(definitions[path]),scroll:0};if(isTab)instances.set(path,target);target.instance.onLoad?.(Object.fromEntries(parsed.searchParams));}
    current=target;target.instance.onShow?.();setEntry({...target});requestAnimationFrame(()=>window.scrollTo(0,mode==='tab'?target.scroll:0));
  };
  setUi({toast:message=>{setToast(String(message||''));clearTimeout(timer.current);timer.current=setTimeout(()=>setToast(''),5000);},dialog:setDialog,navigate});
  globalThis.__androidBack=()=>dialog?setDialog(null):navigate(null,'back');
  globalThis.__androidPause=()=>current?.instance.onHide?.();
  globalThis.__androidResume=()=>current?.instance.onShow?.();
  useEffect(()=>{try{app.onLaunch();navigate('/pages/home/index','tab');}catch(error){report(error);}const hide=()=>{if(document.hidden)current?.instance.onHide?.();else current?.instance.onShow?.();};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
  return h(React.Fragment,null,h('header',{className:'app-header'},entry&&!manifest.tabs.some(tab=>tab.pagePath===entry.path)&&h('button',{className:'app-back',onClick:()=>navigate(null,'back'),'aria-label':'返回'},'‹'),entry?manifest.titles[entry.path]:'内厨司'),entry&&h(Boundary,{key:entry.path},h(ScreenView,{key:entry.instance,entry})),h('nav',{className:'app-tabs'},manifest.tabs.map((tab,index)=>h('button',{key:tab.pagePath,className:entry?.path===tab.pagePath?'active':'',onClick:()=>navigate('/'+tab.pagePath,'tab')},h('span',{className:'nav-icon'},['♧','▦','▤','▣','···'][index]),tab.text))),toast&&h('div',{className:'app-toast',role:'status'},toast),dialog&&h(Dialog,{key:dialog.options?.title||dialog.kind,dialog,close:()=>setDialog(null)}));
}
window.addEventListener('error',event=>{if(event.error)report(event.error);});window.addEventListener('unhandledrejection',event=>{event.preventDefault();report(event.reason);});
createRoot(document.getElementById('root')).render(h(ApplicationView));
