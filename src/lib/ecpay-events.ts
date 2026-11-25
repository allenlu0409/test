// 綠界回呼的商業邏輯（與 HTTP 層分開，方便測試）。兩個函式都可安全重複呼叫。
import { activatePlan, addMonth, recordPayment } from "./billing.ts";
import { get, run, tx, type Business, type Plan } from "./db.ts";
import { PLANS } from "./plans.ts";

export type EventResult = { ok: true; note: string; cancelOld?: string } | { ok: false; reason: string };

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
  if (Number(p.TradeAmt) !== PLANS[plan].price) return { ok: false, reason: "amount mismatch" };

  return tx(() => {
    const fresh = recordPayment({ businessId: biz.id, provider: "ecpay", plan, amount: Number(p.TradeAmt), reference: p.MerchantTradeNo, status: "paid" });
    if (!fresh) return { ok: true as const, note: "duplicate notification" };
    // 已取消的舊訂閱不需要再終止一次
    const previous = biz.ecpay_trade_no && biz.ecpay_trade_no !== p.MerchantTradeNo && !biz.cancel_at_period_end ? biz.ecpay_trade_no : undefined;
    activatePlan(biz.id, plan, addMonth(nowSec()), "ecpay");
    run("UPDATE businesses SET ecpay_trade_no = ? WHERE id = ?", p.MerchantTradeNo, biz.id);
    // 換方案時舊的定期定額要終止，否則會被扣兩筆
    return { ok: true as const, note: "activated", cancelOld: previous };
  });
}

/** 第二期起的每期扣款結果（PeriodReturnURL） */
export function handlePeriodPayment(p: Record<string, string>, merchantId: string): EventResult {
  if (p.MerchantID !== merchantId) return { ok: false, reason: "merchant mismatch" };
  const biz = get<Business>("SELECT * FROM businesses WHERE ecpay_trade_no = ?", p.MerchantTradeNo ?? "");
  // 找不到對應店家：可能是已換方案的舊訂閱，回 OK 讓綠界停止重送
  if (!biz) return { ok: true, note: "no active subscription for this trade" };

  const success = p.RtnCode === "1";
  const seq = success ? `#${p.TotalSuccessTimes ?? "?"}` : `!${p.ProcessDate ?? ""}`;
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
    run("UPDATE businesses SET plan_renews_at = ? WHERE id = ?", addMonth(nowSec()), biz.id);
    return { ok: true, note: "renewed" };
  }
  // 扣款失敗：不立刻降級，由 expireOverdue 在寬限期後處理
  return { ok: true, note: success ? "paid but subscription is ending" : "charge failed; grace period applies" };
}
