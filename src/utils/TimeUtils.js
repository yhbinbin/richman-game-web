// 简单的农历和星期日期工具类预留
const LUNAR_MONTHS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const LUNAR_DAYS = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", 
                    "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", 
                    "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
const WEEK_DAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function getWeekday(date) {
  return `星期${WEEK_DAYS[date.getDay()]}`;
}

export function getLunarDate(date) {
  // 简易假农历算法（基于基准日偏移），为了演示和预留拓展，未来可接入lunar-javascript
  // 假定以游戏开始时的时间作为一个起点
  const baseDate = new Date('2026-01-01');
  const diffDays = Math.floor((date - baseDate) / (1000 * 60 * 60 * 24));
  const totalLunarDays = 311 + diffDays; // 假设起始偏差
  
  let lunarMonth = Math.floor((totalLunarDays / 30)) % 12;
  let lunarDay = totalLunarDays % 30;

  if (lunarMonth < 0) lunarMonth += 12;
  if (lunarDay < 0) lunarDay += 30;

  return `农历${LUNAR_MONTHS[lunarMonth]}月${LUNAR_DAYS[lunarDay]}`;
}

export function formatFullDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const gregorian = `${y}-${m}-${d}`;
  const weekday = getWeekday(date);
  const lunar = getLunarDate(date);
  return `${gregorian} ${weekday} ${lunar}`;
}
