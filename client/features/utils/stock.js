const dates = require('./date');
function normalizeDate(value) {
  if (!String(value || '').trim()) return '';
  const match = String(value).trim().match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
  if (!match) return '';
  const result = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const parsed = new Date(`${result}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && dates.addDays(result, 0) === result ? result : '';
}
function typeOf(row) {
  if (row.type != null) return String(row.type).trim();
  const old = String(row.spec || '');
  const found = old.match(/保乐肩|肥牛|牛腩|牛腱|牛里脊|猪里脊|里脊|五花肉|肋排|排骨|鸡胸|鸡腿|虾仁|北豆腐|嫩豆腐/);
  return found ? found[0] : old;
}
function dayNumber(value) {
  if (value === '' || value == null) return null;
  const found = String(value).trim().match(/^(\d+)\s*天?$/);
  return found ? Number(found[1]) : NaN;
}
function normalize(row) {
  const purchaseDate = normalizeDate(row.purchaseDate);
  const stockedDate = normalizeDate(row.stockedDate) || dates.today();
  let shelfDays = row.shelfDays == null ? '' : row.shelfDays;
  let expiryDate = normalizeDate(row.expiryDate);
  if (!expiryDate && /\d+\s*天/.test(String(row.expiryDate || '')) && shelfDays === '') shelfDays = dayNumber(row.expiryDate);
  const expiryMode = row.expiryMode || (expiryDate && shelfDays === '' ? 'date' : 'days');
  const shelfStart = row.shelfStart === 'stocked' ? stockedDate : purchaseDate || stockedDate;
  const count = dayNumber(shelfDays);
  if (expiryMode === 'days') expiryDate = count != null && Number.isFinite(count) ? dates.addDays(shelfStart, count) : '';
  return { ...row, type: typeOf(row), spec: typeOf(row), originalName: row.originalName || row.spec || '', purchaseDate, stockedDate, shelfDays, expiryMode, expiryDate, storageMode: row.storageMode || '', shelfStart: row.shelfStart || 'purchase' };
}
function validate(row) {
  const fail = (field, message) => { const error = new Error(message); error.field = field; throw error; };
  if (!String(row.name || '').trim()) fail('name', '请填写食材名称');
  if (!(Number(row.amount) > 0) || !Number.isFinite(Number(row.amount))) fail('amount', '请填写大于0的采购总量');
  if (!String(row.unit || '').trim()) fail('unit', '请填写总量单位');
  ['totalPrice', 'portions'].forEach(field => {
    if (row[field] === '' || row[field] == null) return;
    if (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0 || (field === 'portions' && Number(row[field]) === 0)) fail(field, field === 'portions' ? '分装份数须大于0' : '实付总价须为有效金额');
  });
  if(row.physicalAmount!==''&&row.physicalAmount!=null){if(!(Number(row.physicalAmount)>0)||!Number.isFinite(Number(row.physicalAmount)))fail('physicalAmount','实物总数量应大于0');if(!String(row.physicalUnit||'').trim())fail('physicalUnit','请填写实物单位，如只、条、个');if(/^(只|条|个|枚)$/.test(row.physicalUnit)&&!Number.isInteger(Number(row.physicalAmount)))fail('physicalAmount','整只、整条、整枚的实物总数量请填写整数');}
  if (row.purchaseDate && !normalizeDate(row.purchaseDate)) fail('purchaseDate', '请重新选择有效购买日期');
  const result = normalize(row);
  if (result.expiryMode === 'days' && result.shelfDays !== '' && result.shelfDays != null && (!Number.isFinite(dayNumber(result.shelfDays)) || dayNumber(result.shelfDays) < 0)) fail('shelfDays', '预计保存天数请填写0或正整数');
  if (result.expiryMode === 'date' && row.expiryDate && !normalizeDate(row.expiryDate)) fail('expiryDate', '请重新选择有效到期日期');
  return { ...result, name: row.name.trim(), amount: Number(row.amount), unit: row.unit.trim(), totalPrice: row.totalPrice === '' || row.totalPrice == null ? null : Number(row.totalPrice), portions: row.portions === '' || row.portions == null ? null : Number(row.portions),physicalAmount:row.physicalAmount==null||row.physicalAmount===''?null:Number(row.physicalAmount),physicalUnit:String(row.physicalUnit||'').trim() };
}
function migrate(data) {
  data.fridge = (data.fridge || []).map(normalize);
  data.purchases = (data.purchases || []).map(row => { const type = typeOf(row); return { ...row, type, spec: type, comparisonKey: [row.name, type, row.priceUnit || ''].map(value => String(value || '').replace(/\s+/g, '').toLowerCase()).join('|') }; });
  data.priceAlerts = (data.priceAlerts || []).map(row => { const purchase = data.purchases.find(item => item.inventoryId === row.inventoryId); return purchase ? { ...row, type: purchase.type, comparisonKey: purchase.comparisonKey } : row; });
  return data;
}
module.exports = { normalizeDate, typeOf, dayNumber, normalize, validate, migrate };
