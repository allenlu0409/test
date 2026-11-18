// 整合測試：用記憶體資料庫跑真實的預約規則。
process.env.DATABASE_PATH = ":memory:";
(process.env as Record<string, string>).NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { all, get, run, type Business } from "./db.ts";
import { availableSlots, conflictsWithOthers, createBooking, monthlyOnlineCount, seedDefaultHours, quotaReached } from "./booking.ts";
import { sendDueReminders, notifyBookingCreated } from "./notify.ts";
import { verifyWebhook } from "./stripe.ts";
import { addDays, localMidnightUtc, nowInTz, weekdayOf } from "./time.ts";

let n = 0;
function makeBiz(plan = "free", staffCount = 1) {
  n++;
  const owner = run("INSERT INTO users (email, password_hash, name) VALUES (?, 'x', 'Owner')", `o${n}@example.com`).id;
  const id = run("INSERT INTO businesses (owner_id, name, slug, plan, min_lead_minutes) VALUES (?, ?, ?, ?, 0)", owner, `店${n}`, `shop-${n}`, plan).id;
  seedDefaultHours(id);
  const service = run("INSERT INTO services (business_id, name, duration_min, price) VALUES (?, '剪髮', 60, 800)", id).id;
  const staff = Array.from({ length: staffCount }, (_, i) => run("INSERT INTO staff (business_id, name) VALUES (?, ?)", id, `S${i}`).id);
  return { biz: get<Business>("SELECT * FROM businesses WHERE id = ?", id)!, service, staff };
}

/** 幾天後第一個非週一（預設公休）的日期 */
function openDay(offset = 3): string {
  let d = addDays(nowInTz("Asia/Taipei").date, offset);
  while (weekdayOf(d) === 1) d = addDays(d, 1);
  return d;
}

const who = (i: number) => ({ name: `客人${i}`, phone: `09110000${String(i).padStart(2, "0")}` });

test("同一時段、單一人員：只有第一筆成功", () => {
  const { biz, service } = makeBiz();
  const date = openDay();
  const results = Array.from({ length: 5 }, (_, i) => createBooking({ biz, serviceId: service, staffId: null, date, start: 600, source: "online", ...who(i) }));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.match((results[1] as { error: string }).error, /時段/);
  // 與已訂時段重疊的開始時間也要消失（10:00–11:00 已訂，10:30 不可約）
  const svc = get<never>("SELECT * FROM services WHERE id = ?", service)!;
  const starts = availableSlots(biz, svc, date, null).map((s) => s.start);
  assert.ok(!starts.includes(600) && !starts.includes(630));
  assert.ok(starts.includes(660));
});

test("兩位人員：同時段可收兩筆並分派給不同人，第三筆被拒", () => {
  const { biz, service } = makeBiz("pro", 2);
  const date = openDay();
  const r = [0, 1, 2].map((i) => createBooking({ biz, serviceId: service, staffId: null, date, start: 720, source: "online", ...who(i) }));
  assert.deepEqual(r.map((x) => x.ok), [true, true, false]);
  const staffIds = r.filter((x) => x.ok).map((x) => (x as { booking: { staff_id: number } }).booking.staff_id);
  assert.equal(new Set(staffIds).size, 2);
});

test("取消後時段重新開放", () => {
  const { biz, service } = makeBiz();
  const date = openDay();
  const first = createBooking({ biz, serviceId: service, staffId: null, date, start: 840, source: "online", ...who(1) });
  assert.ok(first.ok);
  run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", first.booking.id);
  assert.ok(createBooking({ biz, serviceId: service, staffId: null, date, start: 840, source: "online", ...who(2) }).ok);
});

test("公休日、過去的日期、別家店的服務與人員都不能約", () => {
  const a = makeBiz();
  const b = makeBiz();
  const date = openDay();
  let monday = date;
  while (weekdayOf(monday) !== 1) monday = addDays(monday, 1);
  const base = { biz: a.biz, serviceId: a.service, staffId: null, start: 600, source: "online" as const, ...who(1) };
  assert.equal(createBooking({ ...base, date: monday }).ok, false);
  assert.equal(createBooking({ ...base, date: addDays(nowInTz("Asia/Taipei").date, -1) }).ok, false);
  assert.equal(createBooking({ ...base, date, serviceId: b.service }).ok, false);
  assert.equal(createBooking({ ...base, date, staffId: b.staff[0] }).ok, false);
  assert.equal(createBooking({ ...base, date, source: "manual", staffId: b.staff[0] }).ok, false);
  assert.equal(all("SELECT id FROM bookings WHERE business_id = ?", a.biz.id).length, 0);
});

test("免費版每月 30 筆線上預約額滿後拒絕；手動預約不受限；升級後解除", () => {
  const { biz, service, staff } = makeBiz();
  const customer = run("INSERT INTO customers (business_id, name, phone) VALUES (?, 'x', '0900000000')", biz.id).id;
  for (let i = 0; i < 30; i++) {
    run(
      "INSERT INTO bookings (business_id, service_id, staff_id, customer_id, date, start_min, end_min, token, status) VALUES (?, ?, ?, ?, '2020-01-01', 0, 60, ?, ?)",
      biz.id, service, staff[0], customer, crypto.randomUUID(), i < 29 ? "completed" : "cancelled",
    );
  }
  assert.equal(monthlyOnlineCount(biz), 29, "已取消的不占額度");
  assert.equal(quotaReached(biz), false);
  run("UPDATE bookings SET status = 'no_show' WHERE business_id = ? AND status = 'cancelled'", biz.id);
  assert.equal(quotaReached(biz), true);
  const date = openDay();
  const online = createBooking({ biz, serviceId: service, staffId: null, date, start: 600, source: "online", ...who(1) });
  assert.equal(online.ok, false);
  assert.match((online as { error: string }).error, /額滿/);
  assert.ok(createBooking({ biz, serviceId: service, staffId: null, date, start: 600, source: "manual", ...who(1) }).ok);
  assert.equal(quotaReached({ ...biz, plan: "pro" }), false);
});

test("同一支手機視為同一位顧客；輸入驗證", () => {
  const { biz, service } = makeBiz();
  const date = openDay();
  const base = { biz, serviceId: service, staffId: null, date, source: "online" as const };
  assert.ok(createBooking({ ...base, start: 600, name: "王小明", phone: "0912-345-678" }).ok);
  assert.ok(createBooking({ ...base, start: 720, name: "王小明", phone: "0912 345 678", email: "ming@example.com" }).ok);
  const customers = all<{ email: string }>("SELECT email FROM customers WHERE business_id = ?", biz.id);
  assert.equal(customers.length, 1);
  assert.equal(customers[0].email, "ming@example.com");
  assert.equal(createBooking({ ...base, start: 840, name: "", phone: "0912345678" }).ok, false);
  assert.equal(createBooking({ ...base, start: 840, name: "A", phone: "123" }).ok, false);
  assert.equal(createBooking({ ...base, start: 840, name: "A", phone: "0912345678", email: "bad" }).ok, false);
  assert.equal(createBooking({ ...base, start: 615, name: "A", phone: "0912345678" }).ok, false, "不在時段格線上的時間");
});

test("通知：新預約寄給店家與顧客；提醒只有付費方案、只寄一次", async () => {
  const mails = () => all<{ recipient: string; subject: string }>("SELECT recipient, subject FROM mail_log ORDER BY id");
  run("DELETE FROM mail_log");
  const pro = makeBiz("pro");
  const free = makeBiz("free");
  const now = new Date();
  const tomorrow = addDays(nowInTz("Asia/Taipei", now).date, 1);
  // 提醒以「明天」為準；為避開公休日，直接把明天設為營業
  for (const x of [pro, free]) run("UPDATE hours SET closed = 0 WHERE business_id = ?", x.biz.id);

  const made = [pro, free].map((x, i) =>
    createBooking({ biz: x.biz, serviceId: x.service, staffId: null, date: tomorrow, start: 1140, source: "online", name: "林小美", phone: `092200000${i}`, email: `c${i}@example.com` }),
  );
  assert.ok(made.every((m) => m.ok), JSON.stringify(made));
  await notifyBookingCreated((made[0] as { booking: { id: number } }).booking.id);
  assert.deepEqual(mails().map((m) => m.recipient).sort(), ["c0@example.com", `o${n - 1}@example.com`].sort());

  run("DELETE FROM mail_log");
  const noon = new Date(`${nowInTz("Asia/Taipei", now).date}T04:00:00Z`); // 台北中午 12 點
  const early = new Date(`${nowInTz("Asia/Taipei", now).date}T00:00:00Z`); // 台北早上 8 點
  assert.equal(await sendDueReminders(early), 0, "早上 9 點前不寄");
  assert.equal(await sendDueReminders(noon), 1, "只有專業版那一筆");
  assert.equal(await sendDueReminders(noon), 0, "不重寄");
  assert.equal(mails()[0].recipient, "c0@example.com");
  assert.match(mails()[0].subject, /明天見/);
});

test("Stripe webhook 簽章驗證", () => {
  const secret = "whsec_test";
  const payload = '{"type":"x"}';
  const t = 1_800_000_000;
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  assert.equal(verifyWebhook(payload, `t=${t},v1=${sig}`, secret, t + 10), true);
  assert.equal(verifyWebhook(payload + " ", `t=${t},v1=${sig}`, secret, t + 10), false, "內容被改");
  assert.equal(verifyWebhook(payload, `t=${t},v1=${sig}`, "other", t + 10), false, "密鑰不符");
  assert.equal(verifyWebhook(payload, `t=${t},v1=${sig}`, secret, t + 3600), false, "重放舊事件");
  assert.equal(verifyWebhook(payload, null, secret, t), false);
  assert.equal(verifyWebhook(payload, `t=${t},v1=zz`, secret, t), false);
});

test("線上預約不能改掉既有顧客的姓名與 Email；店家手動建立可以更正姓名", () => {
  const { biz, service } = makeBiz();
  const date = openDay();
  const base = { biz, serviceId: service, staffId: null, date, phone: "0933111222" };
  assert.ok(createBooking({ ...base, start: 600, source: "online", name: "陳美玲", email: "real@example.com" }).ok);
  assert.ok(createBooking({ ...base, start: 720, source: "online", name: "XXX", email: "attacker@example.com" }).ok);
  const c = () => get<{ name: string; email: string }>("SELECT name, email FROM customers WHERE business_id = ?", biz.id)!;
  assert.deepEqual(c(), { name: "陳美玲", email: "real@example.com" });
  assert.ok(createBooking({ ...base, start: 840, source: "manual", name: "陳美伶" }).ok);
  assert.equal(c().name, "陳美伶");
});

test("跨過午夜的預約被拒絕", () => {
  const { biz, service } = makeBiz();
  const r = createBooking({ biz, serviceId: service, staffId: null, date: openDay(), start: 1410, source: "manual", ...who(1) });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /午夜/);
});

test("未到的預約復原前會偵測到時段已被別人約走", () => {
  const { biz, service } = makeBiz();
  const date = openDay();
  const first = createBooking({ biz, serviceId: service, staffId: null, date, start: 900, source: "online", ...who(1) });
  assert.ok(first.ok);
  assert.equal(conflictsWithOthers(first.booking), false);
  run("UPDATE bookings SET status = 'no_show' WHERE id = ?", first.booking.id);
  assert.ok(createBooking({ biz, serviceId: service, staffId: null, date, start: 930, source: "online", ...who(2) }).ok, "未到後時段重新開放");
  assert.equal(conflictsWithOthers(first.booking), true);
});

test("商家時區的日界線換算成 UTC", () => {
  const at = new Date("2026-11-18T05:00:00Z");
  assert.equal(localMidnightUtc("2026-11-01", "Asia/Taipei", at), "2026-10-31 16:00:00");
  assert.equal(localMidnightUtc("2026-11-01", "UTC", at), "2026-11-01 00:00:00");
});
