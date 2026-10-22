function parse(value){const text=String(value||'').replace(/\\([_&?=])/g,'$1');const urls=Array.from(new Set((text.match(/https?:\/\/[^\s\])}>，。；]+/gi)||[]).map(url=>url.replace(/[)）.,，。;；]+$/,''))));return {text,urls,sourceUrl:urls[0]||'',shareText:urls.length?text:'',referenceText:urls.length?'':text};}
function detailed(value){const text=String(value||'').replace(/https?:\/\/\S+/g,'');return /\d+(?:\.\d+)?\s*(克|g|kg|勺|毫升|分钟|个|只|条)/i.test(text)||/(食材|配料)[：:]|(?:^|\n)\s*\d+[.、]/.test(text);}
module.exports={parse,detailed};
