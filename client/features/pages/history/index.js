const store = require('../../utils/store');
const dates = require('../../utils/date');
const inventory = require('../../utils/inventory');
const planning = require('../../utils/planning');
const handoff = require('../../utils/handoff');
function money(value) { return value == null || value === '' ? '待填写' : '¥' + Number(value).toFixed(2); }
defineScreen({
  data: { weekdays: ['日','一','二','三','四','五','六'], year: new Date().getFullYear(), month: new Date().getMonth(), label: '', grid: [], monthHistory: [], shownHistory: [], selectedDate: '', monthCount: 0, monthCost: '', pendingCount: 0 },
  onShow() { this.render(); },
  render() {
    const history = store.getData().history || [];
    const prefix = this.data.year + '-' + String(this.data.month+1).padStart(2,'0');
    const monthHistory = history.filter(row => String(row.date || '').slice(0,7) === prefix).sort((a,b) => (b.date+b.mealSlot).localeCompare(a.date+a.mealSlot)).map(row => ({
      ...row, totalCostText: row.totalCost == null && row.knownCost != null ? '已计 ' + money(row.knownCost) + ' · 有待计价项' : money(row.totalCost),
      unitPriceText: money(row.unitPrice)
    }));
    const selectedDate = this.data.selectedDate.startsWith(prefix) ? this.data.selectedDate : '';
    const grid = dates.monthGrid(this.data.year, this.data.month, history).map(day => ({ ...day, selected: day.key === selectedDate, meals: (day.meals || []).slice().sort((a,b) => (a.mealSlot === '午餐' ? 0 : 1) - (b.mealSlot === '午餐' ? 0 : 1)), count: (day.meals || []).length }));
    this.setData({ label: dates.monthLabel(this.data.year, this.data.month), grid, monthHistory, selectedDate,
      shownHistory: selectedDate ? monthHistory.filter(row => row.date === selectedDate) : monthHistory,
      monthCount: monthHistory.length, monthCost: monthHistory.reduce((sum,row) => sum + Number(row.totalCost == null ? row.knownCost || 0 : row.totalCost),0).toFixed(2),
      pendingCount: monthHistory.filter(row => row.totalCost == null).length });
  },
  selectDate(event) { const date = event.currentTarget.dataset.date; if (!date) return; this.setData({ selectedDate: date }); this.render(); },
  allDates() { this.setData({ selectedDate: '' }); this.render(); },
  today() { const now = new Date(); this.setData({ year: now.getFullYear(), month: now.getMonth(), selectedDate: dates.today() }); this.render(); },
  move(event) { const date = new Date(this.data.year, this.data.month + Number(event.currentTarget.dataset.step),1); this.setData({ year: date.getFullYear(), month: date.getMonth(), selectedDate: '' }); this.render(); },
  open(event) { const row=store.getData().history.find(item=>item.id===event.currentTarget.dataset.history);if(row&&row.mealType==='other')return handoff.send('week',{date:row.date,mealSlot:row.mealSlot,openMeal:true});platform.navigateTo({ url: '/pages/recipe-edit/index?historyId=' + event.currentTarget.dataset.history }); },
  remove(event) {
    const id = event.currentTarget.dataset.history;
    platform.showModal({ title: '删除这条历史？', content: '本餐已扣库存会返还，已记录标记会取消，菜谱继续保留。', success: result => {
      if (!result.confirm) return;
      try {
        store.update(data => {
          const removed = data.history.find(row => row.id === id);
          if (removed) inventory.applyConsumption(data, removed, []);
          data.history = data.history.filter(row => row.id !== id);
          planning.mapMeals(data, meal => { if (meal.historyId !== id && !(removed && meal.date === removed.date && meal.mealSlot === removed.mealSlot)) return meal; const { confirmedAt, historyId, ...rest } = meal; return rest; });
        });
        this.render();
      } catch (error) { platform.showToast({ title: error.message, icon: 'none' }); }
    } });
  }
});
