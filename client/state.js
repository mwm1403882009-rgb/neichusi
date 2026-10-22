export function clone(value){return JSON.parse(JSON.stringify(value));}
export function setPath(target,path,value){const keys=String(path).replace(/\[(\d+)\]/g,'.$1').split('.');if(keys.some(key=>['__proto__','prototype','constructor'].includes(key)))throw Error('Unsafe data path');let node=target;for(let i=0;i<keys.length-1;i++){if(node[keys[i]]==null)node[keys[i]]=/^\d+$/.test(keys[i+1])?[]:{};node=node[keys[i]];}node[keys.at(-1)]=value;}
export function controller(definition,properties={}){
  const instance={...definition,data:clone(definition.data||{}),_version:0,_listeners:new Set(),_disposed:false};
  for(const [name,spec]of Object.entries(definition.properties||{}))instance.data[name]=clone(spec.value??null);
  Object.assign(instance.data,properties);
  for(const [name,method]of Object.entries({...definition,...definition.methods}))if(typeof method==='function')instance[name]=method.bind(instance);
  instance.subscribe=callback=>{instance._listeners.add(callback);return()=>instance._listeners.delete(callback);};
  instance.getVersion=()=>instance._version;
  instance.setData=(patch,callback)=>{if(instance._disposed)return;for(const [key,value]of Object.entries(patch))setPath(instance.data,key,value);instance._version++;instance._listeners.forEach(callback=>callback());if(callback)queueMicrotask(callback);};
  return instance;
}
