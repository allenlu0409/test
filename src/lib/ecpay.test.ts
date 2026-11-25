process.env.DATABASE_PATH = ":memory:";
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.APP_URL = "https://yuehao.example";

import test from "node:test";
import assert from "node:assert/strict";
import { get, run, type Business } from "./db.ts";
import { buildCheckout, checkMacValue, newTradeNo, verifyMac, type EcpayConfig } from "./ecpay.ts";
import { handleFirstPayment, handlePeriodPayment } from "./ecpay-events.ts";
import { expireOverdue, pendingEcpayCancels, GRACE_DAYS } from "./billing.ts";

// 綠界公開的測試環境金鑰與官方測試向量
const KEY = "pwFHCqoQZGmho4w6";
const IV = "EkRm7iFT261dpevs";
const cfg: EcpayConfig = { merchantId: "3002607", hashKey: KEY, hashIV: IV, host: "https://payment-stage.ecpay.com.tw" };

test("CheckMacValue 與綠界官方測試向量一致", () => {
  assert.equal(
    checkMacValue(
      { MerchantID: "3002607", MerchantTradeNo: "Test1234567890", MerchantTradeDate: "2025/01/01 12:00:00", PaymentType: "aio", TotalAmount: "100", TradeDesc: "測試", ItemName: "測試商品", ReturnURL: "https://example.com/notify", ChoosePayment: "ALL", EncryptType: "1" },
      KEY,
      IV,
    ),
    "291CBA324D31FB5A4BBBFDF2CFE5D32598524753AFD4959C3BF590C5B2F57FB2",
  );
  assert.equal(checkMacValue({ MerchantID: "3002607", ItemName: "Tom's Shop", TotalAmount: "100" }, KEY, IV), "CF0A3D4901D99459D8641516EC57210700E8A5C9AB26B1D021301E9CB93EF78D");
  assert.equal(checkMacValue({ MerchantID: "3002607", ItemName: "My Test Product", TotalAmount: "300" }, KEY, IV), "7712A5E6EDC3B57086063C88568084C66CE882A21D40E74DE5ACA3B478C6F316");
});

test("結帳表單：欄位符合定期定額規格且簽章可驗證", () => {
  const { action, fields } = buildCheckout({ plan: "pro", businessId: 42, tradeNo: newTradeNo(42), at: new Date("2026-11-25T04:05:06Z") }, cfg);
  assert.equal(action, "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5");
  assert.equal(fields.TotalAmount, "499");
  assert.equal(fields.PeriodAmount, fields.TotalAmount, "首期金額必須等於每期金額");
  assert.equal(fields.MerchantTradeDate, "2026/11/25 12:05:06", "台北時間");
  assert.match(fields.MerchantTradeNo, /^[A-Z0-9]{1,20}$/);
  assert.equal(fields.ReturnURL, "https://yuehao.example/api/ecpay/notify");
  assert.ok(verifyMac(fields, cfg));
  assert.equal(verifyMac({ ...fields, TotalAmount: "1" }, cfg), false, "竄改金額後簽章失效");
  assert.notEqual(newTradeNo(42, 1), newTradeNo(42, 2));
});

let n = 0;
function makeBiz(): Business {
  n++;
  const owner = run("INSERT INTO users (email, password_hash, name, email_verified) VALUES (?, 'x', 'O', 1)", `e${n}@example.com`).id;
  const id = run("INSERT INTO businesses (owner_id, name, slug) VALUES (?, ?, ?)", owner, `店${n}`, `ec-${n}`).id;
  return get<Business>("SELECT * FROM businesses WHERE id = ?", id)!;
}
const reload = (id: number) => get<Business>("SELECT * FROM businesses WHERE id = ?", id)!;
const first = (biz: Business, tradeNo: string, over: Record<string, string> = {}) => ({
  MerchantID: "3002607", MerchantTradeNo: tradeNo, RtnCode: "1", TradeAmt: "499", SimulatePaid: "0", CustomField1: String(biz.id), CustomField2: "pro", ...over,
});

test("首次授權：成功才啟用；重送不重複；金額或商店不符、模擬付款一律不啟用", () => {
  const biz = makeBiz();
  assert.equal(handleFirstPayment(first(biz, "A1", { RtnCode: "10100058" }), "3002607").ok, true);
  assert.equal(reload(biz.id).plan, "free", "授權失敗不啟用");
  assert.equal(handleFirstPayment(first(biz, "A1", { TradeAmt: "1" }), "3002607").ok, false);
  assert.equal(handleFirstPayment(first(biz, "A1", { MerchantID: "9999999" }), "3002607").ok, false);
  handleFirstPayment(first(biz, "A1", { SimulatePaid: "1" }), "3002607");
  assert.equal(reload(biz.id).plan, "free", "模擬付款不啟用");
  // 高價方案配低價金額
  assert.equal(handleFirstPayment(first(biz, "A1", { CustomField2: "business" }), "3002607").ok, false);

  const ok = handleFirstPayment(first(biz, "A1"), "3002607");
  assert.deepEqual(ok, { ok: true, note: "activated", notify: { businessId: biz.id, event: "paid", amount: 499 } });
  const after = reload(biz.id);
  assert.equal(after.plan, "pro");
  assert.equal(after.billing_provider, "ecpay");
  assert.equal(after.ecpay_trade_no, "A1");
  assert.ok(after.plan_renews_at! > Date.now() / 1000 + 27 * 86400);
  assert.equal((handleFirstPayment(first(biz, "A1"), "3002607") as { note: string }).note, "duplicate notification");
  assert.equal(get<{ n: number }>("SELECT COUNT(*) AS n FROM payments WHERE business_id = ?", biz.id)!.n, 1);
});

test("換方案：新訂閱啟用後回報要終止的舊訂閱", () => {
  const biz = makeBiz();
  handleFirstPayment(first(biz, "B1"), "3002607");
  const r = handleFirstPayment(first(biz, "B2", { CustomField2: "business", TradeAmt: "1299" }), "3002607");
  assert.deepEqual(r, { ok: true, note: "activated", notify: { businessId: biz.id, event: "paid", amount: 1299 } });
  assert.deepEqual(pendingEcpayCancels().map((c) => c.trade_no), ["B1"], "舊訂閱排入終止佇列");
  assert.equal(reload(biz.id).plan, "business");
  // 舊訂閱之後的扣款通知不影響新方案
  assert.equal((handlePeriodPayment({ MerchantID: "3002607", MerchantTradeNo: "B1", RtnCode: "1", Amount: "499", TotalSuccessTimes: "2" }, "3002607") as { note: string }).note, "no active subscription for this trade");
  assert.equal(get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'orphan-charge'")!.n, 1, "沒有方案卻被扣款要留紀錄");
});

test("每期扣款：成功續期、失敗進入寬限期後降級、重送不重複記帳", () => {
  const biz = makeBiz();
  handleFirstPayment(first(biz, "C1"), "3002607");
  const period = (over: Record<string, string>) => handlePeriodPayment({ MerchantID: "3002607", MerchantTradeNo: "C1", Amount: "499", TotalSuccessTimes: "1", ...over }, "3002607") as { note: string; ok: boolean };
  // 把首次授權的通知重放到每期端點、或金額不符，都不能續期
  assert.equal(handlePeriodPayment(first(biz, "C1"), "3002607").ok, false);
  assert.equal(period({ RtnCode: "1", Amount: "1", TotalSuccessTimes: "2" }).ok, false);

  run("UPDATE businesses SET plan_renews_at = ? WHERE id = ?", Math.floor(Date.now() / 1000) - 3600, biz.id);
  assert.equal(period({ RtnCode: "1", TotalSuccessTimes: "2" }).note, "renewed");
  assert.ok(reload(biz.id).plan_renews_at! > Date.now() / 1000 + 27 * 86400);
  assert.equal(period({ RtnCode: "1", TotalSuccessTimes: "2" }).note, "duplicate notification");

  const dueAt = reload(biz.id).plan_renews_at!;
  assert.match(period({ RtnCode: "0", ProcessDate: "2026/12/25 10:00:00" }).note, /grace/);
  assert.equal(reload(biz.id).plan_renews_at, dueAt, "扣款失敗不延長到期日");
  assert.equal(expireOverdue(dueAt + 86400).length, 0, "寬限期內仍可使用");
  assert.equal(reload(biz.id).plan, "pro");
  assert.ok(expireOverdue(dueAt + (GRACE_DAYS + 1) * 86400).length >= 1);
  assert.equal(reload(biz.id).plan, "free");
  assert.equal(get<{ n: number }>("SELECT COUNT(*) AS n FROM payments WHERE business_id = ? AND status = 'failed'", biz.id)!.n, 1);
});

test("年繳：金額為 10 個月、到期日往後一年、每年續期", () => {
  const biz = makeBiz();
  const { fields } = buildCheckout({ plan: "pro", cycle: "year", businessId: biz.id, tradeNo: "Y1" }, cfg);
  assert.deepEqual([fields.TotalAmount, fields.PeriodAmount, fields.PeriodType, fields.Frequency, fields.ExecTimes, fields.CustomField3], ["4990", "4990", "Y", "1", "9", "year"]);
  // 用月繳金額冒充年繳
  assert.equal(handleFirstPayment(first(biz, "Y1", { CustomField3: "year", TradeAmt: "499" }), "3002607").ok, false);
  assert.ok(handleFirstPayment(first(biz, "Y1", { CustomField3: "year", TradeAmt: "4990" }), "3002607").ok);
  const after = reload(biz.id);
  assert.equal(after.billing_cycle, "year");
  assert.ok(after.plan_renews_at! > Date.now() / 1000 + 360 * 86400);
  assert.equal(handlePeriodPayment({ MerchantID: "3002607", MerchantTradeNo: "Y1", RtnCode: "1", Amount: "499", TotalSuccessTimes: "2" }, "3002607").ok, false, "續期金額要等於年費");
  assert.equal((handlePeriodPayment({ MerchantID: "3002607", MerchantTradeNo: "Y1", RtnCode: "1", Amount: "4990", TotalSuccessTimes: "2" }, "3002607") as { note: string }).note, "renewed");
});
