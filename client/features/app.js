const store = require('./utils/store');

defineApplication({
  globalData: { apiKey: '' },
  onLaunch() {
    store.ensureData();
    const settings = store.getSettings();
    if (settings.rememberKey) this.globalData.apiKey = platform.getStorageSync('ysf-api-key') || '';
  }
});
