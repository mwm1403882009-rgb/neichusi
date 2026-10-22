// Only trusted, checked-in UI templates are compiled. User text is always a text node.
export function parseTemplate(source) {
  const root = {tag:'block',attrs:{},children:[],id:0}, stack=[root]; let cursor=0, serial=0;
  const decode = text => text.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  while(cursor<source.length){
    if(source.startsWith('<!--',cursor)){const end=source.indexOf('-->',cursor);if(end<0)throw Error('Unclosed comment');cursor=end+3;continue;}
    if(source[cursor]!=='<'){let end=source.indexOf('<',cursor);if(end<0)end=source.length;stack.at(-1).children.push(decode(source.slice(cursor,end)));cursor=end;continue;}
    let end=cursor+1,quote='';for(;end<source.length;end++){const c=source[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
    if(end>=source.length)throw Error('Unclosed tag');
    const raw=source.slice(cursor+1,end);cursor=end+1;
    if(raw.startsWith('/')){const tag=raw.slice(1).trim();if(stack.length<2||stack.at(-1).tag!==tag)throw Error('Mismatched '+tag);stack.pop();continue;}
    const match=/^([\w-]+)([\s\S]*)$/.exec(raw.trim());if(!match)throw Error('Bad tag '+raw);
    const attrs={};for(const a of match[2].replace(/\/\s*$/,'').matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)){attrs[a[1]]=a[2]!==undefined?decode(a[2]):a[3]!==undefined?decode(a[3]):a[4]!==undefined?decode(a[4]):true;}
    const node={tag:match[1],attrs,children:[],id:++serial};stack.at(-1).children.push(node);
    if(!/\/\s*$/.test(raw))stack.push(node);
  }
  if(stack.length!==1)throw Error('Unclosed '+stack.at(-1).tag);return root;
}
export function portableCss(text){return text.replace(/(-?[\d.]+)rpx/g,'calc(var(--rpx) * $1)').replace(/(?<![\w.-])page\s*\{/g,'body{').replace(/(?<![\w-])(view|text|image|scroll-view)(?![\w-])/g,tag=>({view:'div',text:'span',image:'img','scroll-view':'div'}[tag]));}
