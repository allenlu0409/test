// 訂閱狀態的單一入口：不論金流商是誰，方案的啟用、續期、到期降級都走這裡。
import { all, get, run, type Plan } from "./db.ts";
import { priceFor, type Cycle } from "./plans.ts";

export type Provider = "ecpay" | "stripe" | "demo" | "none";

/** 依環境變數決定使用哪個金流：綠界優先（台灣公司）、其次 Stripe；都沒設定時開發環境走示範模式 */
export function activeProvider(): Provider {
  if (process.env.ECPAY_MERCHANT_ID && process.env.ECPAY_HASH_KEY && process.env.ECPAY_HASH_IV) return "ecpay";
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  if (process.env.DEMO_BILLING === "1" || process.env.NODE_ENV !== "production") return "demo";
  return "none";
}

/** 扣款失敗後保留付費功能的寬限天數 */
export const GRACE_DAYS = 3;

/** 記錄一筆收款；同一金流商的同一筆交易只會記一次（webhook 重送時回傳 false） */
export function recordPayment(p: { businessId: number; provider: Provider; plan: Plan; amount: number; reference: string; status: "paid" | "failed" }): boolean {
  return (
    run(
      "INSERT OR IGNORE INTO payments (business_id, provider, plan, amount, reference, status) VALUES (?, ?, ?, ?, ?, ?)",
      p.businessId,
      p.provider,
      p.plan,
      p.amount,
      p.reference,
      p.status,
    ).changes > 0
  );
}

export function activatePlan(businessId: number, plan: Plan, renewsAtSec: number | null, provider: Provider | null, cycle: Cycle = "month"): void {
  run(
    "UPDATE businesses SET plan = ?, plan_renews_at = ?, billing_provider = ?, billing_cycle = ?, cancel_at_period_end = 0 WHERE id = ?",
    plan,
    renewsAtSec,
    provider === "demo" || provider === "none" ? null : provider,
    cycle,
    businessId,
  );
}

export function downgradeToFree(businessId: number): void {
  run(
    "UPDATE businesses SET plan = 'free', plan_renews_at = NULL, billing_provider = NULL, billing_cycle = 'month', ecpay_trade_no = NULL, stripe_subscription_id = NULL, cancel_at_period_end = 0 WHERE id = ?",
    businessId,
  );
}

/**
 * 把一筆綠界定期定額排入「待終止」佇列。
 * 終止要呼叫綠界 API，可能逾時或失敗；只要訂閱還活著，店家就會繼續被扣款，
 * 所以一律先落地再由排程重試到成功為止（見 processEcpayCancellations）。
 */
export function queueEcpayCancel(tradeNo: string | null | undefined, reason: string): void {
  if (tradeNo) run("INSERT OR IGNORE INTO ecpay_cancellations (trade_no, reason) VALUES (?, ?)", tradeNo, reason);
}

export function pendingEcpayCancels() {
  return all<{ trade_no: string; reason: string; attempts: number; last_error: string; created_at: string }>("SELECT * FROM ecpay_cancellations ORDER BY created_at");
}

/** 逐筆呼叫 cancel；成功的移出佇列，失敗的記下原因等下次。回傳成功筆數 */
export async function processEcpayCancellations(cancel: (tradeNo: string) => Promise<{ ok: boolean; message: string }>): Promise<number> {
  let done = 0;
  for (const row of pendingEcpayCancels()) {
    const r = await cancel(row.trade_no);
    if (r.ok) {
      run("DELETE FROM ecpay_cancellations WHERE trade_no = ?", row.trade_no);
      done++;
    } else {
      run("UPDATE ecpay_cancellations SET attempts = attempts + 1, last_error = ? WHERE trade_no = ?", r.message.slice(0, 200), row.trade_no);
    }
  }
  return done;
}

/**
 * 綠界沒有「訂閱狀態」可查，改以到期日判斷：每次成功扣款把到期日往後推一期，
 * 超過到期日加寬限期仍未續期（扣款失敗或已取消）就降回免費版，並把還沒終止的定期定額排入終止佇列，
 * 否則綠界之後重試扣款成功時，店家會被扣款卻沒有方案。可重複執行；回傳這次被降級的店家 id。
 */
export function expireOverdue(nowSec = Math.floor(Date.now() / 1000)): number[] {
  const due = all<{ id: number; ecpay_trade_no: string | null; cancel_at_period_end: number }>(
    "SELECT id, ecpay_trade_no, cancel_at_period_end FROM businesses WHERE billing_provider = 'ecpay' AND plan != 'free' AND plan_renews_at IS NOT NULL AND (plan_renews_at + ? < ? OR (cancel_at_period_end = 1 AND plan_renews_at < ?))",
    GRACE_DAYS * 86400,
    nowSec,
    nowSec,
  );
  for (const b of due) {
    if (!b.cancel_at_period_end) queueEcpayCancel(b.ecpay_trade_no, "expired after failed charge");
    downgradeToFree(b.id);
  }
  return due.map((d) => d.id);
}

export function addMonths(fromSec: number, months: number): number {
  const d = new Date(fromSec * 1000);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) d.setUTCDate(0); // 1/31 加一個月 → 2 月底
  return Math.floor(d.getTime() / 1000);
}

/** 下一次扣款時間 */
export function nextRenewal(fromSec: number, cycle: Cycle): number {
  return addMonths(fromSec, cycle === "year" ? 12 : 1);
}

/** 每月經常性收入：年繳的店家以年費除以 12 計 */
export function monthlyRecurringRevenue(demoEmail: string): number {
  const rows = all<{ plan: Plan; billing_cycle: Cycle; n: number }>(
    "SELECT b.plan, b.billing_cycle, COUNT(*) AS n FROM businesses b JOIN users u ON u.id = b.owner_id WHERE b.plan != 'free' AND b.suspended = 0 AND u.email != ? GROUP BY b.plan, b.billing_cycle",
    demoEmail,
  );
  return Math.round(rows.reduce((sum, r) => sum + (priceFor(r.plan, r.billing_cycle) / (r.billing_cycle === "year" ? 12 : 1)) * r.n, 0));
}

export function lastPayment(businessId: number) {
  return get<{ amount: number; created_at: string; status: string }>("SELECT amount, created_at, status FROM payments WHERE business_id = ? ORDER BY id DESC LIMIT 1", businessId);
}
