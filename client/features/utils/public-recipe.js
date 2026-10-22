// Read public recipe data only: no cookies, model credentials, executable scripts or login bypass.
const sourceInput=require('./source-input');
const HOSTS=['xiaohongshu.com','xhslink.cn','xhslink.com','xiachufang.com','douguo.com','meishichina.com'];
const MOBILE_UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
function xhs(value){const host=hostOf(value);return ['xiaohongshu.com','xhslink.cn','xhslink.com'].some(item=>host===item||host.endsWith('.'+item));}
function normalize(value){return String(value||'').trim().replace(/&amp;/gi,'&').replace(/^http:\/\//i,'https://');}
function hostOf(value){const match=normalize(value).match(/^https:\/\/([a-z0-9.-]+)(?:[/?#]|$)/i);return match?match[1].toLowerCase():'';}
function allowed(value){const host=hostOf(value);return !!host&&HOSTS.some(item=>host===item||host.endsWith('.'+item));}
function imageAllowed(value){const host=hostOf(value);return !!host&&['xhscdn.com','xiaohongshu.com'].some(item=>host===item||host.endsWith('.'+item));}
function decode(value){return String(value||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#x([0-9a-f]+);/gi,(_,code)=>{const n=parseInt(code,16);return n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&#(\d+);/g,(_,code)=>{const n=Number(code);return n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&amp;/gi,'&');}
function plain(value){return decode(value).replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|li|div)>/gi,'\n').replace(/<[^>]*>/g,'').trim();}
function jsonReady(value){let output='',quoted=false,escaped=false;for(let i=0;i<value.length;i++){const char=value[i];if(quoted){output+=char;if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}if(char==='"'){quoted=true;output+=char;}else if(value.slice(i,i+9)==='undefined'&&!/[\w$]/.test(value[i-1]||'')&&!/[\w$]/.test(value[i+9]||'')){output+='null';i+=8;}else output+=char;}return output;}
function objectAt(source,start){if(source[start]!=='{'&&source[start]!=='[')return null;const stack=[],opens={'{':'}','[':']'};let quoted=false,escaped=false;for(let i=start;i<source.length;i++){const char=source[i];if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}if(char==='"'){quoted=true;continue;}if(opens[char])stack.push(opens[char]);else if(char==='}'||char===']'){if(stack.pop()!==char)return null;if(!stack.length){try{return JSON.parse(jsonReady(source.slice(start,i+1)));}catch(error){return null;}}}}return null;}
function property(source,name){const match=new RegExp('"'+name+'"\\s*:\\s*').exec(source);return match?objectAt(source,match.index+match[0].length):null;}
function meta(html,name){for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const attrs={};for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[match[1].toLowerCase()]=match[2]==null?match[3]:match[2];if((attrs.property||attrs.name||'').toLowerCase()===name)return plain(attrs.content||'');}return '';}
function completeText(text){const body=String(text||''),actions=body.match(/清洗|洗净|擦干|切|腌|煎|炒|蒸|煮|炖|焖|烤|拌|焯|加入|放入|翻面|盛出/g)||[],method=/(?:做法|步骤|制作)[：:\s]|(?:^|\n)\s*\d+[.、]/.test(body);return body.length>=20&&sourceInput.detailed(body)&&actions.length>0&&(method||actions.length>=2)&&!/(?:做法|步骤|配方|用量|食材)[^\n。]{0,8}(?:见图|看图|在图|如图|下图|上图|图[一二三四五六七八九十\d]|图片|图中|视频)/.test(body);}
function noteImages(note){return (Array.isArray(note.imageList)?note.imageList:[]).map(image=>{if(typeof image==='string')return imageAllowed(image)?image:'';if(!image||typeof image!=='object')return '';const info=(Array.isArray(image.infoList)?image.infoList:[]).filter(row=>row&&typeof row==='object'),normal=info.find(row=>row.imageScene==='WB_DFT');return [image.urlDefault,normal&&normal.url,image.url,...info.map(row=>row.url)].find(value=>imageAllowed(value));}).filter(Boolean).map(normalize);}
function pageError(message,code='PAGE'){const error=Error(message);error.publicCode=code;return error;}
function noteId(value){return (normalize(value).match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:[/?#]|$)/i)||[])[1]||'';}
function publicNote(html,url){
  // Parse data, never execute the page's scripts. Mobile H5 and desktop use different state trees.
  const stateMatch=/window\.__INITIAL_STATE__\s*=\s*/.exec(html);
  const state=stateMatch?objectAt(html,stateMatch.index+stateMatch[0].length):null;
  const map=state&&state.note&&state.note.noteDetailMap||property(html,'noteDetailMap');
  const mobile=state&&state.noteData||property(html,'noteData');
  const candidates=[];
  if(map&&typeof map==='object'&&!Array.isArray(map))Object.entries(map).forEach(([id,value])=>{const note=value&&value.note||value;if(note&&typeof note==='object')candidates.push({id:note.noteId||id,note,mobile:false});});
  [mobile&&mobile.data&&mobile.data.noteData,mobile&&mobile.note,state&&state.note&&state.note.note].forEach(note=>{if(note&&typeof note==='object'&&!Array.isArray(note)&&note.noteId)candidates.push({id:note.noteId,note,mobile:true});});
  const requested=noteId(url),current=(html.match(/"(?:currentNoteId|firstNoteId)"\s*:\s*"([a-f0-9]{24})"/i)||[])[1];
  const identity=requested||current;
  const unique=Array.from(new Map(candidates.map(row=>[row.id,row])).values());
  const match=identity?unique.find(row=>row.id===identity):unique.length===1?unique[0]:null;
  if(match){const note=match.note,title=plain(note.title||''),body=plain(note.desc||note.description||''),images=Array.from(new Set(noteImages(note)));if(body||images.length)return {title,body,images,completeText:completeText(body),kind:match.mobile?'小红书公开笔记（手机H5）':'小红书公开笔记',url:normalize(url),noteId:match.id};throw pageError('对应笔记没有可读取的正文或图片，可能已失效或不可公开访问；请补充原文或截图','UNAVAILABLE');}
  if(candidates.length)throw pageError('页面中没有找到与链接对应的笔记正文，未采用推荐内容；请补充原文或截图');
  return null;
}
function recipeFromLd(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(recipeFromLd);if(node['@graph'])return recipeFromLd(node['@graph']);const types=Array.isArray(node['@type'])?node['@type']:[node['@type']];return types.includes('Recipe')?[node]:[];}
function instructionLines(value){if(typeof value==='string')return [plain(value)];if(Array.isArray(value))return value.flatMap(instructionLines);if(value&&typeof value==='object')return value.itemListElement?instructionLines(value.itemListElement):value.text?[plain(value.text)]:[];return [];}
function extract(html,url){
  if(typeof html!=='string'||html.length>2000000)throw Error('公开页面过大或格式异常，请补充笔记正文或截图');
  if(/^https:\/\/[^/]+\/login(?:[/?#]|$)/i.test(url))throw pageError('小红书返回了登录页，没有取得笔记正文；请补充正文或截图','LOGIN');
  const note=publicNote(html,url);if(note)return note;
  const recipes=[];for(const match of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{recipes.push(...recipeFromLd(JSON.parse(match[1])));}catch(error){}}
  if(recipes.length===1){const recipe=recipes[0],ingredients=Array.isArray(recipe.recipeIngredient)?recipe.recipeIngredient.map(plain):[],steps=instructionLines(recipe.recipeInstructions),body=['食材：',...ingredients,'做法：',...steps.map((step,i)=>(i+1)+'. '+step)].join('\n');if(ingredients.length&&steps.length)return {title:plain(recipe.name||''),body,images:[],completeText:true,kind:'网页公开菜谱',url:normalize(url)};}
  const description=meta(html,'og:description')||meta(html,'description');
  if(completeText(description)&&!/(?:登录|扫码|验证后|展开全文|展开更多|打开小红书)/.test(description))return {title:meta(html,'og:title'),body:description,images:[],completeText:true,kind:'网页公开正文',url:normalize(url)};
  if(/验证码|安全验证|访问验证|captcha/i.test(html))throw pageError('小红书返回了访问验证页，未读取到笔记；请补充正文或截图','VERIFY');
  if(/内容已删除|笔记不存在|内容不存在|内容暂时无法查看/.test(html))throw pageError('该笔记已失效或不可公开访问；请补充正文或截图','UNAVAILABLE');
  if(/请先登录|登录后查看|扫码登录/.test(html)||(/window\.__INITIAL_STATE__/.test(html)&&/<title[^>]*>\s*小红书\s*-\s*你的生活兴趣社区\s*<\/title>/i.test(html)))throw pageError('小红书返回了登录页或首页，没有取得笔记正文；请补充正文或截图','LOGIN');
  throw pageError('只读到了页面标题或摘要，没有完整食材和做法；请补充正文或截图');
}
function redirectUrl(location,base){const value=decode(location);if(/^https?:\/\//i.test(value))return normalize(value);if(value.startsWith('//'))return 'https:'+value;const origin='https://'+hostOf(base);if(value.startsWith('/'))return origin+value;if(value.startsWith('?'))return normalize(base).split('?')[0]+value;return normalize(base).split(/[?#]/)[0].replace(/\/[^/]*$/,'/')+value;}
function address(value){return String(value||'').split(/[?#]/)[0].slice(0,240);}
function redact(value){return String(value||'').replace(/https?:\/\/[^\s"'<>]+/gi,url=>address(url)).replace(/\b(authorization|cookie)\s*[:=][^\r\n]*/gi,'$1=[已隐藏]').replace(/\b(xsec_token|web_session|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,'$1=[已隐藏]').slice(0,600);}
function runtimeInfo(){return '内厨司 Android 0.1.4 · 基准 2026.10.22-r1';}
function request(url,mode,timeout){return new Promise((resolve,reject)=>{
  if(typeof platform.request!=='function')return reject(pageError('当前环境无法读取公开链接，请补充正文或截图','NETWORK'));
  const fail=error=>{const raw=redact(error&&error.errMsg||error&&error.message||'未知网络错误'),domain=/domain list|url not in|合法域名/i.test(raw),timed=/timeout/i.test(raw);
    const result=pageError(domain?'公开链接请求被拦截（本次请求域名 '+hostOf(url)+'）。已配置仍失败时，请复制读取诊断核对实际请求；也可补充正文或截图':timed?'读取公开链接超时，请重试或补充正文/截图':'公开链接读取失败，请检查网络，或补充笔记正文/截图',domain?'DOMAIN':timed?'TIMEOUT':'NETWORK');result.rawRequestError=raw;reject(result);};
  const header={Accept:'text/html,application/xhtml+xml'};if(xhs(url))header['User-Agent']=mode==='mobile'?MOBILE_UA:DESKTOP_UA;
  try{platform.request({url,method:'GET',dataType:'text',responseType:'text',timeout,header,success:resolve,fail});}catch(error){fail(error);}
});}
async function read(value,progress=()=>{}){
  const original=normalize(value);if(!allowed(original))throw Error('暂只自动读取小红书、下厨房、豆果和美食天下的公开HTTPS链接；其他来源请粘贴正文或截图');
  const started=Date.now(),trace=[],modes=xhs(original)?['mobile','desktop']:['default'];let lastError;
  for(const mode of modes){
    let url=original;const visited=new Set();
    try{
      for(let hop=0;hop<4;hop++){
        const remaining=25000-(Date.now()-started);if(remaining<=0)throw pageError('读取公开链接超时，请重试或补充正文/截图','TIMEOUT');
        if(visited.has(url))throw pageError('链接跳转循环，请补充正文或截图','REDIRECT');visited.add(url);
        const label=mode==='mobile'?'手机H5':mode==='desktop'?'桌面网页':'公开网页';
        progress('正在读取'+label+'公开笔记'+(hop?'（展开链接）':'')+'…');trace.push(label+' 第'+(hop+1)+'步 GET '+address(url));
        const response=await request(url,mode,Math.min(10000,remaining)),status=Number(response&&response.statusCode)||0;trace.push('HTTP '+status);
        if(status>=300&&status<400){const headers=response.header||{},location=headers.Location||headers.location;if(!location)throw pageError('分享链接跳转没有返回目标，请重新复制完整分享链接','REDIRECT');const target=redirectUrl(location,url);trace.push('跳转至 '+address(target));if(!allowed(target))throw pageError('链接跳转到了不支持的地址，已停止读取；请补充正文或截图','REDIRECT');if(/^https:\/\/[^/]+\/login(?:[/?#]|$)/i.test(target))throw pageError('小红书返回了登录页，没有取得笔记正文；请补充正文或截图','LOGIN');url=target;continue;}
        if(status===429)throw pageError('小红书限制了请求频率，请稍后再试，或补充正文/截图','RATE');
        if(status===401||status===403)throw pageError('公开页面拒绝了本次访问（HTTP '+status+'），请补充正文或截图','ACCESS');
        if(status<200||status>=300)throw pageError('公开笔记返回HTTP '+status+'，可能需要登录或链接已失效；请补充正文或截图','HTTP');
        // Some runtimes expose a final URL after automatic redirects; never accept a new untrusted host.
        const finalUrl=response.url?normalize(response.url):url;if(!allowed(finalUrl))throw pageError('请求返回了不支持的地址，已停止读取；请补充正文或截图','REDIRECT');
        if(response.url)trace.push('返回地址 '+address(finalUrl));
        const result=extract(response.data,finalUrl);if(!result.completeText&&!result.images.length)throw pageError('笔记正文不含完整做法，且未读到公开菜谱图片；请补充正文或截图');
        if(result.images.length>6)throw pageError('公开笔记超过6张图片，无法一次确认完整菜谱；请分批提供正文或所需菜谱截图','LIMIT');
        return {...result,requestedUrl:original,readMode:mode};
      }
      throw pageError('分享链接跳转次数过多，请复制笔记完整链接或补充正文/截图','REDIRECT');
    }catch(error){lastError=error;trace.push('结果 '+redact(error.message));if(error.rawRequestError)trace.push('安卓原始错误 '+error.rawRequestError);if(!['PAGE','LOGIN','HTTP'].includes(error.publicCode)||mode===modes[modes.length-1])break;progress('手机网页未取得完整原文，正在尝试桌面公开网页…');}
  }
  lastError.readDiagnostic=['公开链接读取诊断 · 2026.10.21-r2',runtimeInfo(),'未携带模型密钥、Cookie或登录凭据；地址参数已隐藏。','客户端自动跳转若未提供最终地址，本诊断只能显示请求起点与原始错误。',...trace].join('\n');throw lastError;
}
module.exports={read,extract,allowed,hostOf,completeText};
