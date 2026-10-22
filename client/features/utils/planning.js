const {list}=require('./list-data');
const dates = require('./date');
const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function schedule(start, count = 7) {
  const monday = dates.mondayOf(start || dates.today());
  return labels.slice(0, count).reduce((rows, label, i) => rows.concat(['午餐', '晚餐'].map(mealSlot => ({
    id: `plan-${dates.addDays(monday, i)}-${mealSlot}`, date: dates.addDays(monday, i), label, mealSlot,
    name: '', side: '', ingredients: [], ingredientUses: [], extraCosts: [], cookingMethod: ''
  }))), []);
}
function migrate(data) {
  if (!data.weeks || typeof data.weeks !== 'object' || Array.isArray(data.weeks)) {
    data.weeks = {};
    list(data.weekPlan).forEach(meal => {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(meal.date || '') ? dates.mondayOf(meal.date) : dates.mondayOf(dates.today());
      if (!data.weeks[start]) data.weeks[start] = { days: [], batchSteps: data.batchSteps || [], prompt: data.weekPrompt || '' };
      data.weeks[start].days.push({ ...meal, id: `plan-${meal.date}-${meal.mealSlot || '午餐'}` });
    });
  }
  return data;
}
function getWeek(data, start) {
  migrate(data);
  const saved = data.weeks[start] || {};
  return { ...saved, days: schedule(start).map(base => ({ ...base, ...list(saved.days).find(meal => meal.date === base.date && meal.mealSlot === base.mealSlot), id: base.id })), batchSteps: list(saved.batchSteps), prompt: saved.prompt || '' };
}
function putWeek(data, start, days, batchSteps, prompt) {
  migrate(data);
  data.weeks[start] = { ...(data.weeks[start] || {}), days:list(days), batchSteps:list(batchSteps), prompt: prompt || '' };
  data.weekPlan = list(days);
  data.batchSteps = list(batchSteps);
  data.weekPrompt = prompt || '';
}
function allMeals(data) { migrate(data); return Object.keys(data.weeks).reduce((rows, key) => rows.concat(list(data.weeks[key].days)), []); }
function mapMeals(data, fn) {
  migrate(data);
  Object.keys(data.weeks).forEach(key => { data.weeks[key].days = list(data.weeks[key].days).map(fn); });
  data.weekPlan = list(data.weekPlan).map(fn);
}
module.exports = { schedule, migrate, getWeek, putWeek, allMeals, mapMeals };
