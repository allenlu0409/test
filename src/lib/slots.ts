// 可預約時段計算（純函式，方便測試）。
import { diffDays } from "./time.ts";

export type Interval = [start: number, end: number];

export interface SlotInput {
  date: string;
  duration: number;
  /** 當日營業時間；null 或 closed 表示公休 */
  hours: { open: number; close: number; closed: boolean } | null;
  interval: number;
  staffIds: number[];
  /** 各服務人員當日已被占用的時段 */
  busy: Map<number, Interval[]>;
  now: { date: string; minutes: number };
  minLeadMinutes: number;
  maxAdvanceDays: number;
  isClosedDate?: boolean;
}

export interface Slot {
  start: number;
  staffIds: number[];
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export function computeSlots(input: SlotInput): Slot[] {
  const { date, duration, hours, interval, staffIds, busy, now } = input;
  if (!hours || hours.closed || input.isClosedDate) return [];
  if (duration <= 0 || interval <= 0 || staffIds.length === 0) return [];

  const dayDiff = diffDays(date, now.date);
  if (dayDiff < 0 || dayDiff > input.maxAdvanceDays) return [];

  const slots: Slot[] = [];
  for (let start = hours.open; start + duration <= hours.close; start += interval) {
    const minutesAhead = dayDiff * 1440 + start - now.minutes;
    if (minutesAhead < input.minLeadMinutes) continue;
    const want: Interval = [start, start + duration];
    const free = staffIds.filter((id) => !(busy.get(id) ?? []).some((b) => overlaps(want, b)));
    if (free.length) slots.push({ start, staffIds: free });
  }
  return slots;
}
