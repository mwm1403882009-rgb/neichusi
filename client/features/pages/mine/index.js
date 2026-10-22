const store = require('../../utils/store');
const inventory = require('../../utils/inventory');

const taskLabels = { mealIngredients:'根据菜名识别用料', mealDraft:'生成指定餐次',menuDraft:'生成剩余餐次菜单',menuDraftRepair:'复核菜单',methodsBatch:'生成现做步骤',methodOne:'按本餐用料生成做法', test: '连接测试', visionTest: '图片测试', asr: '语音转文字', dispatch: '内厨司理解需求', purchaseText: '整理采购描述', cookLog: '整理实际用餐', receiptOcr: '小票识别', receipt: '整理购物清单', recommend: '今日推荐', ocr: '图片识别', recipe: '整理菜谱', recipeRepair: '菜谱复核', week: '本周计划', weekMenu: '生成所选周菜单', weekMenuRepair: '菜单纠错', weekDetails: '补齐备菜方法', weekRepair: '计划纠错' };

function numberText(value) {
  return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function entryCost(item) {
  return item.estimatedCost != null && Number.isFinite(Number(item.estimatedCost)) ? Number(item.estimatedCost) : null;
}
function usageSummary(logs) {
  let input=0,output=0,total=0,cost=0,unpriced=0,unreported=0,hit=0,miss=0,write=0,audio=0,search=0,estimated=0,known=0,tokenFee=0,audioFee=0,searchFee=0;
  logs.forEach(item=>{
    if(item.billingType!=='audio'){input+=Number(item.inputTokens)||0;output+=Number(item.outputTokens)||0;total+=Number(item.totalTokens)||0;hit+=Number(item.cacheHitTokens)||0;miss+=Number(item.cacheMissTokens)||0;write+=Number(item.cacheWriteTokens)||0;}
    audio+=Number(item.audioSeconds)||0;search+=Number(item.searchCalls)||0;tokenFee+=Number(item.tokenCost)||0;audioFee+=Number(item.audioCost)||0;searchFee+=Number(item.searchCost)||0;
    const amount=entryCost(item);if(amount==null){unpriced++;known+=Number(item.knownCost)||0;}else cost+=amount;
    if(!item.usageReported)unreported++;if(item.costEstimated||item.billingVersion!==2)estimated++;
  });
  return {tokenFee:tokenFee.toFixed(4),audioFee:audioFee.toFixed(4),searchFee:searchFee.toFixed(4),calls:logs.length,input:numberText(input),output:numberText(output),total:numberText(total),hit:numberText(hit),miss:numberText(miss),write:numberText(write),audioText:audio.toFixed(1),search,estimated,unreported,unpriced,costText:unpriced?(cost+known>0?'已知¥'+(cost+known).toFixed(4)+' + '+unpriced+'次待核':'有'+unpriced+'次待核用量/单价'):'¥'+cost.toFixed(4)};
}

function localDate(at) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return String(at || '');
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDay(at) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return String(at || '').slice(0, 10);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

defineScreen({
  data: {
    counts: { recipes: 0, history: 0, fridge: 0, prices: 0 }, priceUnread: 0,
    usageToday: {}, usageMonth: {}, usageAll: {}, recentUsage: [],
    backupText: '', notice: '', showImporter: false, usageWarning:''
  },

  onShow() {
    const data = store.getData();
    const settings = store.getSettings();
    const logs = data.aiUsage || [];
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const todayPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const monthPrefix = todayPrefix.slice(0, 7);
    this.setData({
      counts: { recipes: data.recipes.length, history: data.history.length, fridge: data.fridge.length, prices: new Set(data.prices.map(row => inventory.key(row.ingredient)).concat((data.purchases || []).map(row => inventory.key(row.name)))).size },
      priceUnread: inventory.unreadCount(data),
      usageWarning:getApplication().globalData.usageWarning||'',
      usageToday: usageSummary(logs.filter(item => localDay(item.at) === todayPrefix), settings),
      usageMonth: usageSummary(logs.filter(item => localDay(item.at).slice(0, 7) === monthPrefix), settings),
      usageAll: usageSummary(logs, settings),
      recentUsage: logs.slice(0, 6).map(item => ({
        ...item, taskLabel: taskLabels[item.task] || taskLabels[String(item.task || '').replace(/FormatRepair$|Retry$/, '')] || item.task || 'AI调用', dateText: localDate(item.at),
        tokenText: item.billingType==='audio'?(Number(item.audioSeconds)||0).toFixed(1)+'秒音频':numberText(item.totalTokens)+' Token', costText: entryCost(item, settings) == null ? '待计价' : `¥${entryCost(item, settings).toFixed(4)}`,
        usageText: item.billingVersion!==2?'旧计价口径 · 历史金额不重算':item.billingType==='audio'?(item.costEstimated?'时长来自本机录音，估算':'时长来自接口'):(item.cacheReported?'命中 '+numberText(item.cacheHitTokens)+' / 未命中 '+numberText(item.cacheMissTokens)+' / 输出 '+numberText(item.outputTokens):'缺少缓存明细，按未命中估算')+(item.searchCalls!=null?' · 搜索'+item.searchCalls+'次':'')+(item.searchReported===false?' · 搜索用量待核':'')+(!item.usageReported?' · 接口未返回用量':'')
      }))
    });
  },

  go(event) {
    const url = event.currentTarget.dataset.url;
    if (event.currentTarget.dataset.tab) platform.switchTab({ url });
    else platform.navigateTo({ url });
  },

  clearUsage() {
    platform.showModal({
      title: '清空Token记录？', content: '只清除本机的AI用量统计，不影响菜谱、计划或模型账户账单。', confirmColor: '#a64234',
      success: result => {
        if (!result.confirm) return;
        store.update(data => { data.aiUsage = []; });
        this.onShow();
      }
    });
  },

  exportData() {
    const text = store.safeExport();
    platform.setClipboardData({ data: text, success: () => this.setData({ notice: '备份已复制到剪贴板，不含模型 API Key。请粘贴到你自己的安全位置保存。' }) });
  },
  showImport() { this.setData({ backupText: '', notice: '把御膳房备份文本粘贴到下面，再点“校验并导入”。', showImporter: true }); },
  input(event) { this.setData({ backupText: event.detail.value }); },
  readClipboard() { platform.getClipboardData({ success: result => this.setData({ backupText: result.data || '' }) }); },
  importData() {
    if (!this.data.backupText.trim()) return platform.showToast({ title: '请先粘贴备份文本', icon: 'none' });
    let parsed;
    try { parsed = JSON.parse(this.data.backupText); if (parsed.type !== 'yushanfang-backup') throw new Error('格式不匹配'); }
    catch (error) { return this.setData({ notice: '备份格式不正确，没有修改现有数据。' }); }
    platform.showModal({
      title: '导入并替换当前数据？', content: '会替换菜谱、周计划、库存、价格、历史和Token记录；模型密钥不会导入。建议先导出当前数据。', confirmText: '确认导入', confirmColor: '#a64234',
      success: result => {
        if (!result.confirm) return;
        try { store.safeImport(this.data.backupText); this.setData({ notice: '导入成功。请到各页面核对数量和内容。', backupText: '', showImporter: false }); this.onShow(); }
        catch (error) { this.setData({ notice: error.message || '导入失败，现有数据未修改' }); }
      }
    });
  }
});
