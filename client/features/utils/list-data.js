// Recover the numeric-key object produced by old dot-index setData paths.
// Never invent meals from draft names or infer a confirmation from price.
function list(value){if(Array.isArray(value))return value;if(value&&typeof value==='object')return Object.keys(value).filter(key=>/^\d+$/.test(key)).sort((a,b)=>Number(a)-Number(b)).map(key=>value[key]).filter(item=>item!=null);return [];}
module.exports={list};
