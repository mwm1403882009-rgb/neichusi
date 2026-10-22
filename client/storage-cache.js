// A bounded read-through cache of raw JSON avoids repeated synchronous bridge decryption.
// All mutations still commit to encrypted native storage before the cache is changed.
export function cachedStorage(bridge,{maxChars=4*1024*1024,maxKeys=64}={}){
  const cache=new Map();let chars=0;
  const forget=key=>{if(cache.has(key)){chars-=cache.get(key).length;cache.delete(key);}};
  const remember=(key,raw)=>{
    forget(key);
    // Model credentials retain their existing access/lifetime behavior, outside this business cache.
    if(/api-key|settings/i.test(key)||raw.length>maxChars)return;
    cache.set(key,raw);chars+=raw.length;
    while(chars>maxChars||cache.size>maxKeys)forget(cache.keys().next().value);
  };
  return{
    get(key){if(cache.has(key)){const raw=cache.get(key);forget(key);remember(key,raw);return raw;}const raw=bridge.get(key)||'';remember(key,raw);return raw;},
    set(key,raw){if(!bridge.set(key,raw))return false;remember(key,raw);return true;},
    remove(key){if(!bridge.remove(key))return false;forget(key);return true;},
    clear(){cache.clear();chars=0;}
  };
}
