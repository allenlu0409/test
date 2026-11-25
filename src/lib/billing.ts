// 訂閱狀態的單一入口：不論金流商是誰，方案的啟用、續期、到期降級都走這裡。
import { all, get, run, type Plan } from "./db.ts";

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

export function activatePlan(businessId: number, plan: Plan, renewsAtSec: number | null, provider: Provider | null): void {
  run(
    "UPDATE businesses SET plan = ?, plan_renews_at = ?, billing_provider = ?, cancel_at_period_end = 0 WHERE id = ?",
    plan,
    renewsAtSec,
    provider === "demo" || provider === "none" ? null : provider,
    businessId,
  );
}

export function downgradeToFree(businessId: number): void {
  run(
    "UPDATE businesses SET plan = 'free', plan_renews_at = NULL, billing_provider = NULL, ecpay_trade_no = NULL, stripe_subscription_id = NULL, cancel_at_period_end = 0 WHERE id = ?",
    businessId,
  );
}

/**
 * 綠界沒有「訂閱狀態」可查，改以到期日判斷：每次成功扣款把到期日往後推一期，
 * 超過到期日加寬限期仍未續期（扣款失敗或已取消）就降回免費版。可重複執行。
 */
export function expireOverdue(nowSec = Math.floor(Date.now() / 1000)): number {
  const due = all<{ id: number }>(
    "SELECT id FROM businesses WHERE billing_provider = 'ecpay' AND plan != 'free' AND plan_renews_at IS NOT NULL AND (plan_renews_at + ? < ? OR (cancel_at_period_end = 1 AND plan_renews_at < ?))",
    GRACE_DAYS * 86400,
    nowSec,
    nowSec,
  );
  for (const { id } of due) downgradeToFree(id);
  return due.length;
}

export function addMonth(fromSec: number): number {
  const d = new Date(fromSec * 1000);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + 1);
  if (d.getUTCDate() !== day) d.setUTCDate(0); // 1/31 → 2 月底
  return Math.floor(d.getTime() / 1000);
}

export function monthlyRecurringRevenue(prices: Record<string, number>, demoEmail: string): number {
  const rows = all<{ plan: string; n: number }>(
    "SELECT b.plan, COUNT(*) AS n FROM businesses b JOIN users u ON u.id = b.owner_id WHERE b.plan != 'free' AND b.suspended = 0 AND u.email != ? GROUP BY b.plan",
    demoEmail,
  );
  return rows.reduce((sum, r) => sum + (prices[r.plan] ?? 0) * r.n, 0);
}

export function lastPayment(businessId: number) {
  return get<{ amount: number; created_at: string; status: string }>("SELECT amount, created_at, status FROM payments WHERE business_id = ? ORDER BY id DESC LIMIT 1", businessId);
}
