// Native inputs already own their visible value and cursor during bindinput.
// Keep the logic-side draft without echoing value/parent objects through setData.
function capture(page,path,value){
  const keys=String(path).split('.');let data=page.data;
  keys.slice(0,-1).forEach(key=>{if(!data[key])data[key]={};data=data[key];});
  data[keys[keys.length-1]]=value;
}
module.exports={capture};
