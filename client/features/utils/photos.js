const food=require('./ingredients');
const {list}=require('./list-data');
function icon(item={}){
  if(item.emoji&&item.emoji!=='🍳')return item.emoji;
  const text=[item.name,item.type,item.category,...list(item.ingredients)].filter(Boolean).join(' '),group=food.identity(text).group;
  if(/鸡蛋|鸭蛋|蛋羹|炒蛋/.test(text)&&!/(鸡腿|鸡翅|鸡胸)/.test(text))return '🥚';
  if(group==='牛肉'||group==='羊肉'||/牛肉|肥牛|牛腩|保乐肩|牛保肩|羊肉/.test(text))return '🥩';
  if(group==='猪肉'||/猪肉|里脊|排骨|五花/.test(text))return '🐷';
  if(group==='鸡肉'||/鸡|鸭|鹅/.test(text))return '🍗';
  if(/虾|蟹|贝|蛤|蚝|海鲜/.test(text))return '🦐';if(/鱼|鲳|鲈|鳕/.test(text))return '🐟';
  if(/奶|酸奶/.test(text))return '🥛';if(/豆腐|豆干|豆皮/.test(text))return '🧊';
  if(/面|粉|年糕/.test(text))return '🍜';if(/饭|米|粥/.test(text))return '🍚';if(/汤|羹/.test(text))return '🍲';
  if(/菜|豆芽|瓜|茄|椒|萝卜|菌|菇|蔬|玉米/.test(text))return '🥬';if(/果|苹果|橙|香蕉|柠檬/.test(text))return '🍎';return '🍽️';
}
function view(item){return {...item,photoPath:isLocal(item.photoPath)?item.photoPath:'',defaultIcon:icon(item)};}
function isLocal(path){return typeof path==='string' && /^https:\/\/appassets\.androidplatform\.net\/(?:media|temp)\/[a-zA-Z0-9._-]+$/.test(path);}
async function choose(){
  if(typeof platform.chooseMedia!=='function')throw Error('当前App版本不支持选图，请更新App后重试');
  const selected=await new Promise((resolve,reject)=>platform.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['original'],success:resolve,fail:error=>{const raw=String(error&&error.errMsg||''),canceled=/cancel/i.test(raw);const message=Error(canceled?'已取消选图':/privacy|隐私/i.test(raw)?'照片访问失败，请在系统设置检查相机和照片权限':/auth|deny|permission|权限/i.test(raw)?'相机或相册权限未获授权，请在安卓系统的App权限中开启后重试':'无法打开相机或相册，请检查照片权限后重试');message.canceled=canceled;reject(message);}}));
  const file=list(selected.tempFiles)[0];if(!file||!file.tempFilePath)throw Error('没有选到可用图片，请重试');
  if(Number(file.size)>8*1024*1024)throw Error('这张照片超过8MB，请选较小照片后重试');
  let manager;try{if(platform.getFileSystemManager)manager=platform.getFileSystemManager();}catch(error){}
  const save=manager&&typeof manager.saveFile==='function'?options=>manager.saveFile(options):typeof platform.saveFile==='function'?options=>platform.saveFile(options):null;
  if(!save)throw Error('当前App无法保存本机照片，请更新App后重试');
  return new Promise((resolve,reject)=>save({tempFilePath:file.tempFilePath,success:result=>{if(!result.savedFilePath||result.savedFilePath===file.tempFilePath)return reject(Error('未获得持久照片路径，原照片未修改'));resolve(result.savedFilePath);},fail:()=>reject(Error('照片保存失败，可能是本机文件空间不足；原照片未修改'))}));
}
function preview(path){if(path&&platform.previewImage)platform.previewImage({current:path,urls:[path],fail:()=>platform.showToast({title:'照片无法打开，请重新添加',icon:'none'})});}
module.exports={icon,view,choose,preview,isLocal};
