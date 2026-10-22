function pad(value) { return String(value).padStart(2, '0'); }
function dateKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function today() { return dateKey(new Date()); }
function addDays(source, amount) { const date = new Date(`${source}T12:00:00`); date.setDate(date.getDate() + amount); return dateKey(date); }
function mondayOf(source) { const date = new Date(`${source}T12:00:00`); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return dateKey(date); }
function nextWorkWeek() { const monday = mondayOf(addDays(today(), 7)); return ['周一','周二','周三','周四','周五'].map((label, i) => ({ label, date: addDays(monday, i) })); }
function daysUntil(source) { const a = new Date(`${today()}T12:00:00`); const b = new Date(`${source}T12:00:00`); return Math.round((b - a) / 86400000); }
function monthLabel(year, month) { return `${year}年${month + 1}月`; }
function monthGrid(year, month, history) {
  const first = new Date(year, month, 1); const start = first.getDay(); const total = new Date(year, month + 1, 0).getDate(); const items = [];
  for (let i = 0; i < start; i += 1) items.push({ blank: true, key: `b${i}` });
  for (let day = 1; day <= total; day += 1) { const key = `${year}-${pad(month + 1)}-${pad(day)}`; items.push({ key, day, today: key === today(), meals: history.filter(x => x.date === key) }); }
  while (items.length % 7) items.push({ blank: true, key: `e${items.length}` });
  return items;
}
module.exports = { today, addDays, mondayOf, nextWorkWeek, daysUntil, monthLabel, monthGrid };
