// Stripe 訂閱金流：直接呼叫 REST API，不需安裝 SDK。
import crypto from "node:crypto";
import type { Plan } from "./db.ts";

const API = "https://api.stripe.com/v1";

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** 未設定 Stripe 時：開發環境（或 DEMO_BILLING=1）允許不收款直接切換方案，方便展示升級流程 */
export function demoBillingEnabled(): boolean {
  if (stripeEnabled()) return false;
  return process.env.DEMO_BILLING === "1" || process.env.NODE_ENV !== "production";
}

export function priceIdFor(plan: Plan): string | undefined {
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO;
  if (plan === "business") return process.env.STRIPE_PRICE_BUSINESS;
  return undefined;
}

export function planForPrice(priceId: string | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "business";
  return null;
}

async function stripe<T>(path: string, params?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
    cache: "no-store",
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message || `Stripe ${res.status}`);
  return json;
}

export async function createCheckout(opts: {
  plan: Plan;
  businessId: number;
  email: string;
  customerId: string | null;
}): Promise<string> {
  const price = priceIdFor(opts.plan);
  if (!price) throw new Error("尚未設定此方案的 Stripe 價格 ID");
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    client_reference_id: String(opts.businessId),
    "subscription_data[metadata][business_id]": String(opts.businessId),
    success_url: `${appUrl()}/dashboard/billing?status=success`,
    cancel_url: `${appUrl()}/dashboard/billing?status=cancelled`,
    allow_promotion_codes: "true",
    locale: "zh-TW",
  };
  if (opts.customerId) params.customer = opts.customerId;
  else params.customer_email = opts.email;
  const session = await stripe<{ url: string }>("/checkout/sessions", params);
  return session.url;
}

export async function createPortal(customerId: string): Promise<string> {
  const session = await stripe<{ url: string }>("/billing_portal/sessions", {
    customer: customerId,
    return_url: `${appUrl()}/dashboard/billing`,
  });
  return session.url;
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  metadata?: Record<string, string>;
  current_period_end?: number;
  items: { data: { price: { id: string }; current_period_end?: number }[] };
}

export function getSubscription(id: string): Promise<StripeSubscription> {
  return stripe<StripeSubscription>(`/subscriptions/${encodeURIComponent(id)}`);
}

/** 驗證 Stripe-Signature（HMAC-SHA256，容許 5 分鐘時間差） */
export function verifyWebhook(payload: string, header: string | null, secret: string, nowSec = Date.now() / 1000): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(nowSec - Number(t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest();
  return sigs.some((s) => {
    const buf = Buffer.from(s, "hex");
    return buf.length === expected.length && crypto.timingSafeEqual(buf, expected);
  });
}
