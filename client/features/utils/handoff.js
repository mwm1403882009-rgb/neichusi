const pages = { home: '/pages/home/index', today: '/pages/today/index', week: '/pages/week/index', fridge: '/pages/fridge/index', log: '/pages/meal-log/index', recipe: '/pages/recipe-import/index', history: '/pages/history/index' };
const tabs = ['home', 'week', 'fridge'];
function appDrafts() { const app = getApplication(); if (!app.globalData.pendingDrafts) app.globalData.pendingDrafts = {}; return app.globalData.pendingDrafts; }
function send(target, payload) {
  if (!pages[target]) throw new Error('暂不支持这个页面');
  const draft = { ...payload, receivedAt: Date.now() };
  appDrafts()[target] = draft;
  const { images, ...safe } = draft;
  platform.setStorageSync('ysf-handoff-' + target, safe);
  if (tabs.includes(target)) platform.switchTab({ url: pages[target] }); else platform.navigateTo({ url: pages[target] });
}
function take(target) {
  const draft = appDrafts()[target] || platform.getStorageSync('ysf-handoff-' + target);
  delete appDrafts()[target]; platform.removeStorageSync('ysf-handoff-' + target);
  return draft || null;
}
module.exports = { send, take, pages };
