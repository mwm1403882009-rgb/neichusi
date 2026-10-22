const stock=require('./stock');
const inventory=require('./inventory');
const dates=require('./date');
const fields=['photoPath','name','type','originalName','amount','unit','totalPrice','portions','physicalAmount','physicalUnit','shelfDays','expiryMode','shelfStart','storageMode','platform'];
function key(row){return inventory.key(row.name)+'|'+inventory.key(stock.typeOf(row));}
function basics(row){const normalized=stock.normalize(row),out={};fields.forEach(field=>{if(normalized[field]!=null)out[field]=normalized[field];});return out;}
function save(data,row,makeId,id){
  const value=stock.validate({...row,purchaseDate:dates.today(),stockedDate:dates.today(),expiryDate:''}),list=data.frequentStock||(data.frequentStock=[]),same=list.find(item=>key(item)===key(value));
  if(id&&same&&same.id!==id)throw Error('同名同类型已有常买，请编辑已有项目');
  const existing=id?list.find(item=>item.id===id):same;if(id&&!existing)throw Error('这项常买已被移除');
  const entry={...basics(value),id:existing?existing.id:makeId('frequent-stock'),updatedAt:new Date().toISOString()};
  const index=existing?list.findIndex(item=>item.id===existing.id):-1;if(index>=0)list[index]=entry;else list.unshift(entry);return entry;
}
function purchase(row){return {...basics(row),purchaseDate:dates.today(),stockedDate:dates.today(),expiryDate:'',expiryMode:row.shelfDays==null||row.shelfDays===''?'date':'days'};}
function price(row,unit){const total=inventory.number(row.totalPrice);if(total==null)return '价格待填写';let scale=unit===row.physicalUnit&&Number(row.physicalAmount)>0?Number(row.physicalAmount):unit==='份'&&Number(row.portions)>0?Number(row.portions):unit===row.unit?Number(row.amount):0;return scale>0?'¥'+(total/scale).toFixed(2)+'/'+unit:'单价待核对';}
module.exports={key,basics,save,purchase,price};
