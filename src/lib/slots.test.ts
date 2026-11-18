import test from "node:test";
import assert from "node:assert/strict";
import { computeSlots, type Interval } from "./slots.ts";
import { addDays, weekdayOf, parseTime, fmtTime, isDateStr, nowInTz } from "./time.ts";

const base = {
  date: "2026-11-20",
  duration: 60,
  hours: { open: 600, close: 780, closed: false },
  interval: 30,
  staffIds: [1, 2],
  busy: new Map<number, Interval[]>(),
  now: { date: "2026-11-18", minutes: 600 },
  minLeadMinutes: 60,
  maxAdvanceDays: 30,
};

test("營業時間內依間隔產生時段，且不超過打烊", () => {
  const s = computeSlots(base).map((x) => x.start);
  assert.deepEqual(s, [600, 630, 660, 690, 720]);
});

test("公休日與特休日沒有時段", () => {
  assert.equal(computeSlots({ ...base, hours: { ...base.hours, closed: true } }).length, 0);
  assert.equal(computeSlots({ ...base, hours: null }).length, 0);
  assert.equal(computeSlots({ ...base, isClosedDate: true }).length, 0);
});

test("已有預約的人員被排除，全員忙碌則時段消失", () => {
  const busy = new Map<number, Interval[]>([
    [1, [[600, 660]]],
    [2, [[630, 690]]],
  ]);
  const s = computeSlots({ ...base, busy });
  assert.equal(s.find((x) => x.start === 600), undefined);
  assert.equal(s.find((x) => x.start === 630), undefined);
  assert.deepEqual(s.find((x) => x.start === 660)?.staffIds, [1]);
  assert.deepEqual(s.find((x) => x.start === 690)?.staffIds, [1, 2]);
});

test("最短提前時間與最遠可預約天數", () => {
  const today = computeSlots({ ...base, date: "2026-11-18", now: { date: "2026-11-18", minutes: 615 } });
  assert.deepEqual(today.map((x) => x.start), [690, 720]);
  assert.equal(computeSlots({ ...base, date: "2026-11-17" }).length, 0);
  assert.equal(computeSlots({ ...base, date: "2026-12-25" }).length, 0);
});

test("日期工具", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekdayOf("2026-11-18"), 3);
  assert.equal(parseTime("09:30"), 570);
  assert.equal(parseTime("25:00"), null);
  assert.equal(fmtTime(570), "09:30");
  assert.equal(isDateStr("2026-02-30"), false);
  assert.deepEqual(nowInTz("Asia/Taipei", new Date("2026-11-18T16:30:00Z")), { date: "2026-11-19", minutes: 30 });
});
