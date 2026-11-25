// 自動化營運相關的測試：兩步驟驗證、異常通知、週報、引導信、客人改期。
process.env.DATABASE_PATH = ":memory:";
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.APP_URL = "https://yuehao.example";
process.env.ADMIN_EMAILS = "ops@example.com";

import test from "node:test";
import assert from "node:assert/strict";
import { all, get, run, type Business } from "./db.ts";
import { base32Decode, base32Encode, newBackupCodes, newSecret, totpAt, useBackupCode, verifyTotp } from "./totp.ts";
import { collectAlerts, sendOperatorAlerts, sendWeeklyDigest } from "./alerts.ts";
import { DRIP, sendDripEmails } from "./drip.ts";
import { createBooking, rescheduleByCustomer, seedDefaultHours } from "./booking.ts";
import { addDays, nowInTz, weekdayOf } from "./time.ts";

const mails = (to: string) => all<{ subject: string; body: string }>("SELECT subject, body FROM mail_log WHERE recipient = ? ORDER BY id", to);

let n = 0;
function makeBiz(ageDays = 0) {
  n++;
  const owner = run("INSERT INTO users (email, password_hash, name, email_verified) VALUES (?, 'x', 'O', 1)", `s${n}@example.com`).id;
  const id = run("INSERT INTO businesses (owner_id, name, slug, min_lead_minutes, created_at) VALUES (?, ?, ?, 0, datetime('now', ?))", owner, `店${n}`, `ops-${n}`, `-${ageDays * 24 + 1} hours`).id;
  seedDefaultHours(id);
  run("UPDATE hours SET closed = 0 WHERE business_id = ?", id);
  const service = run("INSERT INTO services (business_id, name, duration_min, price) VALUES (?, '剪髮', 60, 800)", id).id;
  const staff = run("INSERT INTO staff (business_id, name) VALUES (?, 'S')", id).id;
  return { biz: get<Business>("SELECT * FROM businesses WHERE id = ?", id)!, service, staff, email: `s${n}@example.com` };
}
// 台北中午，引導信只在白天寄
const noon = () => new Date(`${nowInTz("Asia/Taipei").date}T04:00:00Z`);

test("TOTP：符合 RFC 6238 測試向量，容許前後一格，錯碼不過", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(base32Decode(secret).toString(), "12345678901234567890");
  assert.equal(totpAt(secret, 59_000), "287082");
  assert.equal(totpAt(secret, 1111111109_000), "081804");
  assert.equal(totpAt(secret, 2000000000_000), "279037");
  assert.ok(verifyTotp(secret, "287082", 59_000));
  assert.ok(verifyTotp(secret, "287 082", 59_000 + 30_000), "上一格的碼");
  assert.equal(verifyTotp(secret, "287082", 59_000 + 90_000), false, "過期太久");
  assert.equal(verifyTotp(secret, "000000", 59_000), false);
  assert.equal(verifyTotp(secret, "abc", 59_000), false);
  assert.match(newSecret(), /^[A-Z2-7]{32}$/);
});

test("備用碼：每組只能用一次", () => {
  const { codes, hashes } = newBackupCodes();
  assert.equal(codes.length, 8);
  const left = useBackupCode(hashes, codes[0].toUpperCase());
  assert.equal(left?.length, 7);
  assert.equal(useBackupCode(left!, codes[0]), null);
  assert.equal(useBackupCode(hashes, "not-a-code"), null);
});

test("異常通知：有異常才寄、同一天同樣的異常只寄一次；狀況變了會再寄", async () => {
  assert.deepEqual(collectAlerts(), []);
  assert.equal(await sendOperatorAlerts(), 0);
  for (let i = 0; i < 3; i++) run("INSERT INTO mail_log (recipient, subject, body, status) VALUES ('x@example.com', 's', '', 'failed:500')");
  assert.equal(await sendOperatorAlerts(), 1);
  assert.equal(await sendOperatorAlerts(), 0, "不重複寄");
  assert.equal(mails("ops@example.com").length, 1);
  assert.match(mails("ops@example.com")[0].body, /寄送失敗/);

  const { biz } = makeBiz();
  run("INSERT INTO payments (business_id, provider, plan, amount, reference, status) VALUES (?, 'ecpay', 'pro', 499, 'F1', 'failed')", biz.id);
  run("INSERT INTO ecpay_cancellations (trade_no, reason, attempts) VALUES ('STUCK1', 'test', 6), ('FRESH1', 'test', 1)");
  const keys = collectAlerts().map((a) => a.key);
  assert.ok(keys.some((k) => k.startsWith("charge")) && keys.includes("ecpay-cancel:STUCK1"), keys.join());
  assert.equal(await sendOperatorAlerts(), 3);
  assert.equal(mails("ops@example.com").length, 2);
  run("DELETE FROM ecpay_cancellations; DELETE FROM mail_log WHERE status LIKE 'failed%'");
});

test("週報：只在週一早上九點後寄一次，內容列出值得聯繫的店家", async () => {
  makeBiz(5); // 開店五天、沒有線上預約
  const today = nowInTz("Asia/Taipei").date;
  let monday = today;
  while (weekdayOf(monday) !== 1) monday = addDays(monday, 1);
  const at = (date: string, utcHour: number) => new Date(`${date}T${String(utcHour).padStart(2, "0")}:00:00Z`);
  const before = mails("ops@example.com").length;
  assert.equal(await sendWeeklyDigest(at(addDays(monday, 1), 4)), false, "不是週一");
  assert.equal(await sendWeeklyDigest(at(monday, 0)), false, "台北早上八點，還沒到");
  assert.equal(await sendWeeklyDigest(at(monday, 2)), true);
  assert.equal(await sendWeeklyDigest(at(monday, 5)), false, "當天不重寄");
  const digest = mails("ops@example.com").slice(before);
  assert.equal(digest.length, 1);
  assert.match(digest[0].subject, /週報/);
  assert.match(digest[0].body, /每月經常性收入/);
  assert.match(digest[0].body, /還沒收到線上預約的店家/);
});

test("引導信：依開店天數一次一封；收到預約、關閉通知、未驗證信箱都不寄", async () => {
  const day1 = makeBiz(1);
  const day8 = makeBiz(8);
  const fresh = makeBiz(0);
  const booked = makeBiz(4);
  const optedOut = makeBiz(4);
  const unverified = makeBiz(4);
  const customer = run("INSERT INTO customers (business_id, name, phone) VALUES (?, 'c', '0900111222')", booked.biz.id).id;
  run("INSERT INTO bookings (business_id, service_id, staff_id, customer_id, date, start_min, end_min, token) VALUES (?, ?, ?, ?, '2020-01-01', 0, 60, 'drip-t')", booked.biz.id, booked.service, booked.staff, customer);
  run("UPDATE businesses SET tips_off = 1 WHERE id = ?", optedOut.biz.id);
  run("UPDATE users SET email_verified = 0 WHERE id = ?", unverified.biz.owner_id);

  const midnight = new Date(`${nowInTz("Asia/Taipei").date}T18:00:00Z`); // 台北凌晨兩點
  assert.equal(await sendDripEmails(midnight), 0, "半夜不寄");
  await sendDripEmails(noon());
  assert.equal(mails(day1.email).length, 1);
  assert.equal(mails(day1.email)[0].subject, DRIP[0].subject);
  assert.match(mails(day1.email)[0].body, /https:\/\/yuehao\.example\/b\/ops-/);
  assert.equal(mails(day8.email).length, 1, "一次只寄一封，不會把三封一起補寄");
  for (const x of [fresh, booked, optedOut, unverified]) assert.equal(mails(x.email).length, 0);

  await sendDripEmails(noon());
  assert.equal(mails(day1.email).length, 1, "第二封要等到第三天");
  assert.equal(mails(day8.email)[1].subject, DRIP[1].subject);
  await sendDripEmails(noon());
  await sendDripEmails(noon());
  assert.deepEqual(mails(day8.email).map((m) => m.subject), DRIP.map((d) => d.subject), "三封寄完就停");
});

test("客人自己改期：讓出原時段、不能改到被占用或不開放的時間、已取消的不能改", () => {
  const { biz, service } = makeBiz();
  const date = addDays(nowInTz("Asia/Taipei").date, 3);
  const book = (start: number, i: number) => createBooking({ biz, serviceId: service, staffId: null, date, start, source: "online", name: `客${i}`, phone: `09330000${10 + i}` });
  const a = book(600, 1);
  const b = book(720, 2);
  assert.ok(a.ok && b.ok);

  assert.match((rescheduleByCustomer(a.booking.token, date, 720) as { error: string }).error, /訂走/);
  assert.match((rescheduleByCustomer(a.booking.token, date, 600) as { error: string }).error, /原本的時間/);
  assert.equal(rescheduleByCustomer(a.booking.token, addDays(date, -10), 600).ok, false, "過去的日期");
  assert.equal(rescheduleByCustomer("no-such-token", date, 840).ok, false);

  // 往後挪半小時：新時段和自己原本的時間重疊，應該允許
  const moved = rescheduleByCustomer(a.booking.token, date, 630);
  assert.ok(moved.ok);
  assert.deepEqual([moved.booking.start_min, moved.booking.end_min, moved.booking.id], [630, 690, a.booking.id]);
  assert.ok(book(600, 3).ok === false, "10:00 開始的一小時會和 10:30 重疊");
  assert.ok(rescheduleByCustomer(a.booking.token, date, 840).ok);
  assert.ok(book(600, 4).ok, "原本的時段已經讓出來");

  run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", b.booking.id);
  assert.match((rescheduleByCustomer(b.booking.token, date, 900) as { error: string }).error, /無法線上改期/);
});
