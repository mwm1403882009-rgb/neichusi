// Android appassets is a private WebView origin, never a provider-fetchable URL.
function isDeviceImage(value){return /^https?:\/\/appassets\.androidplatform\.net(?::\d+)?(?:[/?#]|$)/i.test(String(value||''));}
function resolve(value,readImage){const source=String(value||'');if(isDeviceImage(source))return readImage(source);if(/^(?:data:|https?:)/i.test(source))return source;return readImage(source);}
function asDataUrl(data){
  if(typeof data!=='string'||!data.length||data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('图片数据为空或编码不完整，请重新选择原图');
  let head;try{head=atob(data.slice(0,32));}catch(error){throw Error('图片编码无效，请重新选择原图');}
  const bytes=Array.from(head,char=>char.charCodeAt(0));let mime='';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
  else if([137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte))mime='image/png';
  else if(/^GIF8[79]a/.test(head))mime='image/gif';
  else if(head.slice(0,4)==='RIFF'&&head.slice(8,12)==='WEBP')mime='image/webp';
  else if(head.slice(0,2)==='BM')mime='image/bmp';
  if(!mime)throw Error('图片内容不是支持的格式，请重新选择JPG、PNG、GIF或WebP原图');
  return 'data:'+mime+';base64,'+data;
}
function requestError(error,response,settings,model){const detail=String(error.message||'请求失败').replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi,'[图片数据已隐藏]').replace(/\b(?:sk|tp)-[A-Za-z0-9_-]{8,}/g,'[密钥已隐藏]').slice(0,240);return Error('图片识别失败（'+(settings.label||settings.provider)+' / '+model+'，HTTP '+response.statusCode+'）：'+detail);}
module.exports={isDeviceImage,resolve,asDataUrl,requestError};
