// 純函式的日期／時間工具。日期一律以商家時區的 'YYYY-MM-DD' 字串表示，時間為當日第幾分鐘。

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isDateStr(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toEpochDay(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
}

export function addDays(date: string, n: number): string {
  return new Date((toEpochDay(date) + n) * 86400000).toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return toEpochDay(a) - toEpochDay(b);
}

/** 0 = 週日 … 6 = 週六 */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function fmtTime(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (mi > 59 || h * 60 + mi > 1440) return null;
  return h * 60 + mi;
}

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function fmtDateLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y} 年 ${m} 月 ${d} 日（週${WEEKDAYS[weekdayOf(date)]}）`;
}

export function fmtDateShort(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${WEEKDAYS[weekdayOf(date)]}）`;
}

export function nowInTz(tz: string, at: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function fmtMoney(n: number): string {
  return `NT$${Math.round(n).toLocaleString("en-US")}`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} 小時 ${m} 分`;
  if (h) return `${h} 小時`;
  return `${m} 分鐘`;
}

/** 商家時區某日 00:00 對應的 UTC 時間字串（'YYYY-MM-DD HH:MM:SS'），用來和資料庫的 UTC created_at 比較 */
export function localMidnightUtc(date: string, tz: string, at: Date = new Date()): string {
  const now = nowInTz(tz, at);
  const offsetMin = toEpochDay(now.date) * 1440 + now.minutes - Math.floor(at.getTime() / 60000);
  return new Date((toEpochDay(date) * 1440 - offsetMin) * 60000).toISOString().slice(0, 19).replace("T", " ");
}
