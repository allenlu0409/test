// 綠界回呼的商業邏輯（與 HTTP 層分開，方便測試）。兩個函式都可安全重複呼叫。
import { activatePlan, nextRenewal, queueEcpayCancel, recordPayment } from "./billing.ts";
import { audit } from "./admin.ts";
import { get, run, tx, type Business, type Plan } from "./db.ts";
import { PLANS, priceFor, type Cycle } from "./plans.ts";

export type BillingEvent = "paid" | "failed";
export type EventResult =
  | { ok: true; note: string; notify?: { businessId: number; event: BillingEvent; amount: number } }
  | { ok: false; reason: string };

const nowSec = () => Math.floor(Date.now() / 1000);

/** 首次授權結果（ReturnURL） */
export function handleFirstPayment(p: Record<string, string>, merchantId: string, allowSimulated = false): EventResult {
  if (p.MerchantID !== merchantId) return { ok: false, reason: "merchant mismatch" };
  if (p.RtnCode !== "1") return { ok: true, note: "first authorization failed; nothing provisioned" };
  if (p.SimulatePaid === "1" && !allowSimulated) return { ok: true, note: "simulated payment ignored" };

  const plan = p.CustomField2 as Plan;
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", Number(p.CustomField1));
  if (!biz || !(plan in PLANS) || plan === "free") return { ok: false, reason: "unknown business or plan" };
  // 金額必須等於方案價格，避免有人拿低價訂單冒充高價方案
  const cycle: Cycle = p.CustomField3 === "year" ? "year" : "month";
  if (Number(p.TradeAmt) !== priceFor(plan, cycle)) return { ok: false, reason: "amount mismatch" };

  return tx(() => {
    const fresh = recordPayment({ businessId: biz.id, provider: "ecpay", plan, amount: Number(p.TradeAmt), reference: p.MerchantTradeNo, status: "paid" });
    if (!fresh) return { ok: true as const, note: "duplicate notification" };
    // 換方案或換週期：舊的定期定額必須終止，否則會被扣兩筆。先排入佇列（落地），由路由與排程負責執行與重試
    if (biz.ecpay_trade_no && biz.ecpay_trade_no !== p.MerchantTradeNo && !biz.cancel_at_period_end) {
      queueEcpayCancel(biz.ecpay_trade_no, "replaced by new subscription");
    }
    activatePlan(biz.id, plan, nextRenewal(nowSec(), cycle), "ecpay", cycle);
    run("UPDATE businesses SET ecpay_trade_no = ? WHERE id = ?", p.MerchantTradeNo, biz.id);
    return { ok: true as const, note: "activated", notify: { businessId: biz.id, event: "paid" as const, amount: Number(p.TradeAmt) } };
  });
}

/** 第二期起的每期扣款結果（PeriodReturnURL） */
export function handlePeriodPayment(p: Record<string, string>, merchantId: string): EventResult {
  if (p.MerchantID !== merchantId) return { ok: false, reason: "merchant mismatch" };
  // 每期通知一定帶這兩個欄位；缺少代表這不是每期通知（例如有人把首次授權的通知重放到這個端點）
  if (!p.MerchantTradeNo || !p.TotalSuccessTimes || !p.Amount) return { ok: false, reason: "not a period notification" };
  const success = p.RtnCode === "1";
  const biz = get<Business>("SELECT * FROM businesses WHERE ecpay_trade_no = ?", p.MerchantTradeNo);
  if (!biz) {
    // 沒有店家在用這筆訂閱卻還在扣款：立刻排入終止佇列並留下紀錄，避免有人被白扣
    if (success) {
      queueEcpayCancel(p.MerchantTradeNo, "charged without an active plan");
      audit("system", "orphan-charge", `${p.MerchantTradeNo} 扣款 ${p.Amount} 但沒有對應的店家，已排入終止；請到綠界後台退款`);
    }
    return { ok: true, note: "no active subscription for this trade" };
  }
  if (success && Number(p.Amount) !== priceFor(biz.plan, biz.billing_cycle)) return { ok: false, reason: "amount mismatch" };

  const seq = success ? `#${p.TotalSuccessTimes}` : `!${p.ProcessDate ?? ""}`;
  const fresh = recordPayment({
    businessId: biz.id,
    provider: "ecpay",
    plan: biz.plan,
    amount: Number(p.Amount) || 0,
    reference: `${p.MerchantTradeNo}${seq}`,
    status: success ? "paid" : "failed",
  });
  if (!fresh) return { ok: true, note: "duplicate notification" };
  if (success && !biz.cancel_at_period_end) {
    run("UPDATE businesses SET plan_renews_at = ? WHERE id = ?", nextRenewal(nowSec(), biz.billing_cycle), biz.id);
    return { ok: true, note: "renewed", notify: { businessId: biz.id, event: "paid", amount: Number(p.Amount) } };
  }
  if (success) return { ok: true, note: "paid but subscription is ending" };
  // 扣款失敗：不立刻降級，由 expireOverdue 在寬限期後處理
  return { ok: true, note: "charge failed; grace period applies", notify: { businessId: biz.id, event: "failed", amount: Number(p.Amount) } };
}
