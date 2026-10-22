const {list}=require('./list-data');
const { initialData, providers } = require('./defaults');
const planning = require('./planning');
const stock = require('./stock');

const LEGACY_DATA_KEY = 'ysf-data-v1';
const SETTINGS_KEY = 'ysf-settings-v1';
const KEYS = {
  meta: 'ysf-meta-v2', recipes: 'ysf-recipes-v2', weekPlan: 'ysf-week-v2',
  fridge: 'ysf-fridge-v2', prices: 'ysf-prices-v2', priceLogs: 'ysf-price-logs-v2',
  history: 'ysf-history-v2', aiUsage: 'ysf-ai-usage-v2', weeks: 'ysf-weeks-v3', purchases: 'ysf-purchases-v3', priceAlerts: 'ysf-alerts-v3', frequentStock:'ysf-frequent-stock-v3'
};
const MAX_SAFE_KEY_BYTES = 900000;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function bytes(value) { return unescape(encodeURIComponent(JSON.stringify(value))).length; }
function assertPiece(name, value) {
  if (bytes(value) > MAX_SAFE_KEY_BYTES) {
    throw new Error(`${name}数据接近单项备份安全上限，请先导出备份并清理旧记录`);
  }
}
function normalizeLists(data){['recipes','weekPlan','fridge','prices','priceLogs','history','aiUsage','purchases','priceAlerts','frequentStock','batchSteps'].forEach(key=>{data[key]=list(data[key]);});if(data.weeks&&typeof data.weeks==='object')Object.keys(data.weeks).forEach(key=>{data.weeks[key].days=list(data.weeks[key].days);data.weeks[key].batchSteps=list(data.weeks[key].batchSteps);});return data;}
function pieces(data) {
  normalizeLists(data);
  planning.migrate(data);
  stock.migrate(data);
  data.history = (data.history || []).map(item => {
    if (item.recipeSnapshot) return item;
    const recipe = (data.recipes || []).find(row => row.id === item.recipeId);
    return recipe ? { ...item, recipeSnapshot: { ...recipe, name: item.name, plannedDate: item.date, cost: item.totalCost == null ? null : item.totalCost } } : item;
  });
  return {
    meta: { version: 3, batchSteps: data.batchSteps || [], weekPrompt: data.weekPrompt || '' },
    recipes: data.recipes || [], weekPlan: data.weekPlan || [], fridge: data.fridge || [],
    prices: data.prices || [], priceLogs: data.priceLogs || [], history: data.history || [],
    aiUsage: (data.aiUsage || []).slice(0, 500), weeks: data.weeks, purchases: data.purchases || [], priceAlerts: data.priceAlerts || [], frequentStock:data.frequentStock||[]
  };
}
function writeData(data) {
  const next = pieces(data);
  const writes = {};
  Object.keys(KEYS).filter(name => name !== 'weeks').forEach(name => { assertPiece(name, next[name]); writes[KEYS[name]] = clone(next[name]); });
  const weekIds = Object.keys(next.weeks);
  weekIds.forEach(start => { assertPiece(start + '周计划', next.weeks[start]); writes['ysf-week-archive-' + start] = clone(next.weeks[start]); });
  writes[KEYS.weeks] = { index: weekIds };
  const before = {};
  Object.keys(writes).forEach(key => { before[key] = platform.getStorageSync(key); });
  try { Object.keys(writes).forEach(key => { if (JSON.stringify(before[key]) !== JSON.stringify(writes[key])) platform.setStorageSync(key, writes[key]); }); }
  catch (error) {
    Object.keys(before).forEach(key => { try { if (before[key] === '' || before[key] == null) platform.removeStorageSync(key); else platform.setStorageSync(key, before[key]); } catch (ignored) {} });
    throw new Error('本机存储不足或写入失败，操作未完成。请先导出备份，再清理不需要的旧数据。');
  }
}
function readWeeks() {
  const saved = platform.getStorageSync(KEYS.weeks);
  if (!saved) return null;
  if (!Array.isArray(saved.index)) return saved;
  const weeks = {};
  saved.index.forEach(start => { const week = platform.getStorageSync('ysf-week-archive-' + start); if (week) weeks[start] = week; });
  return weeks;
}
function ensureData() {
  if (!platform.getStorageSync(KEYS.meta)) {
    const legacy = platform.getStorageSync(LEGACY_DATA_KEY);
    writeData(legacy && Array.isArray(legacy.recipes) ? legacy : initialData());
  }
  if (!platform.getStorageSync(SETTINGS_KEY)) {
    platform.setStorageSync(SETTINGS_KEY, { provider: 'deepseek', ...providers.deepseek, rememberKey: false });
  }
}
function getData() {
  ensureData();
  const meta = platform.getStorageSync(KEYS.meta) || {};
  const data = clone({
    version: 3, batchSteps: meta.batchSteps || [], weekPrompt: meta.weekPrompt || '',
    recipes: platform.getStorageSync(KEYS.recipes) || [],
    weekPlan: platform.getStorageSync(KEYS.weekPlan) || [],
    fridge: platform.getStorageSync(KEYS.fridge) || [],
    prices: platform.getStorageSync(KEYS.prices) || [],
    priceLogs: platform.getStorageSync(KEYS.priceLogs) || [],
    history: platform.getStorageSync(KEYS.history) || [],
    aiUsage: platform.getStorageSync(KEYS.aiUsage) || [], weeks: readWeeks(),
    purchases: platform.getStorageSync(KEYS.purchases) || [], priceAlerts: platform.getStorageSync(KEYS.priceAlerts) || [], frequentStock:platform.getStorageSync(KEYS.frequentStock)||[]
  });
  normalizeLists(data);
  planning.migrate(data);
  stock.migrate(data);
  if (meta.version < 3) {
    data.history = data.history.map(item => {
      if (item.recipeSnapshot) return item;
      const recipe = data.recipes.find(row => row.id === item.recipeId);
      return recipe ? { ...item, recipeSnapshot: { ...recipe, name: item.name, plannedDate: item.date, cost: item.totalCost == null ? null : item.totalCost } } : item;
    });
  }
  if (!platform.getStorageSync(KEYS.weeks) || meta.version < 3) writeData(data);
  return data;
}
function setData(data) { writeData(data); return data; }
function update(mutator) { const data = getData(); mutator(data); return setData(data); }
function getSettings() { ensureData(); return clone(platform.getStorageSync(SETTINGS_KEY)); }
function setSettings(settings) { platform.setStorageSync(SETTINGS_KEY, clone(settings)); return settings; }
function id(prefix) { return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`; }
function recordAiUsage(entry) {
  const data = getData();
  data.aiUsage = [{ id: id('usage'), ...entry }, ...(data.aiUsage || [])].slice(0, 500);
  setData(data);
}
function safeExport() {
  return JSON.stringify({ type: 'yushanfang-backup', version: 3, exportedAt: new Date().toISOString(), data: getData(), settings: getSettings() }, null, 2);
}
function validateImport(parsed) {
  if (parsed.type !== 'yushanfang-backup' || !parsed.data ||
      !Array.isArray(parsed.data.recipes) || !Array.isArray(parsed.data.weekPlan) ||
      !Array.isArray(parsed.data.fridge) || !Array.isArray(parsed.data.prices) ||
      !Array.isArray(parsed.data.history)) {
    throw new Error('不是有效的御膳房备份');
  }
  if(parsed.data.frequentStock!=null&&!Array.isArray(parsed.data.frequentStock))throw new Error('备份中的常买清单格式无效');
  const next = pieces(parsed.data);
  Object.keys(next).filter(name => name !== 'weeks').forEach(name => assertPiece(name, next[name]));
  Object.keys(next.weeks).forEach(start => assertPiece(start + '周计划', next.weeks[start]));
}
function safeImport(text) {
  const parsed = JSON.parse(text);
  validateImport(parsed);
  const before = getData();
  try {
    writeData(parsed.data);
    if (parsed.settings) setSettings({ ...parsed.settings, rememberKey: false });
    // 备份从不包含 API Key；恢复时同步清除本机旧 Key，避免误用旧凭据。
    platform.removeStorageSync('ysf-api-key');
    platform.removeStorageSync('ysf-api-keys');
    platform.removeStorageSync('ysf-api-key-provider');
    if (typeof getApplication === 'function') { const app = getApplication(); if (app && app.globalData) { app.globalData.apiKey = ''; app.globalData.apiKeys = {}; } }
  } catch (error) {
    writeData(before);
    throw error;
  }
  return parsed.data;
}

module.exports = { ensureData, getData, setData, update, getSettings, setSettings, recordAiUsage, id, safeExport, safeImport };
