// 綠界 ECPay 全方位金流（AIO）信用卡定期定額。
// 流程：瀏覽器帶表單 POST 到綠界付款頁 → 首次授權結果打到 ReturnURL → 之後每期扣款結果打到 PeriodReturnURL。
import crypto from "node:crypto";
import type { Plan } from "./db.ts";
import { PLANS, priceFor, type Cycle } from "./plans.ts";
import { appUrl } from "./stripe.ts";

export interface EcpayConfig {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  host: string;
}

export function ecpayConfig(): EcpayConfig {
  return {
    merchantId: process.env.ECPAY_MERCHANT_ID ?? "",
    hashKey: process.env.ECPAY_HASH_KEY ?? "",
    hashIV: process.env.ECPAY_HASH_IV ?? "",
    host: process.env.ECPAY_STAGE === "1" ? "https://payment-stage.ecpay.com.tw" : "https://payment.ecpay.com.tw",
  };
}

/**
 * CheckMacValue（SHA256）：參數依鍵名不分大小寫排序，前後包上 HashKey／HashIV，
 * 以 .NET 風格 URL 編碼後轉小寫再雜湊。encodeURIComponent 與該編碼的差異只有空白、~ 和 '。
 */
export function checkMacValue(params: Record<string, string>, hashKey: string, hashIV: string): string {
  const body = Object.keys(params)
    .filter((k) => k !== "CheckMacValue")
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), "en"))
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const encoded = encodeURIComponent(`HashKey=${hashKey}&${body}&HashIV=${hashIV}`)
    .replace(/%20/g, "+")
    .replace(/~/g, "%7e")
    .replace(/'/g, "%27")
    .toLowerCase();
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

export function verifyMac(params: Record<string, string>, cfg: EcpayConfig = ecpayConfig()): boolean {
  const given = Buffer.from(String(params.CheckMacValue ?? "").toUpperCase());
  const want = Buffer.from(checkMacValue(params, cfg.hashKey, cfg.hashIV));
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

/** 訂單編號：最多 20 碼英數且永久唯一 */
export function newTradeNo(businessId: number, at = Date.now()): string {
  return `YH${businessId.toString(36)}T${at.toString(36)}`.toUpperCase().slice(0, 20);
}

function tradeDate(at: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}/${g("month")}/${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

/** 產生送往綠界付款頁的表單欄位。月繳每月扣一次（最多 99 期），年繳每年扣一次（最多 9 期） */
export function buildCheckout(opts: { plan: Plan; cycle?: Cycle; businessId: number; tradeNo: string; at?: Date }, cfg: EcpayConfig = ecpayConfig()) {
  const cycle = opts.cycle ?? "month";
  const amount = String(priceFor(opts.plan, cycle));
  const fields: Record<string, string> = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: opts.tradeNo,
    MerchantTradeDate: tradeDate(opts.at ?? new Date()),
    PaymentType: "aio",
    TotalAmount: amount,
    TradeDesc: "約好預約系統訂閱",
    ItemName: `約好${PLANS[opts.plan].name}（${cycle === "year" ? "年繳" : "每月"}）`,
    ReturnURL: `${appUrl()}/api/ecpay/notify`,
    ChoosePayment: "Credit",
    EncryptType: "1",
    PeriodAmount: amount,
    PeriodType: cycle === "year" ? "Y" : "M",
    Frequency: "1",
    ExecTimes: cycle === "year" ? "9" : "99",
    PeriodReturnURL: `${appUrl()}/api/ecpay/period`,
    ClientBackURL: `${appUrl()}/dashboard/billing?status=pending`,
    CustomField1: String(opts.businessId),
    CustomField2: opts.plan,
    CustomField3: cycle,
  };
  fields.CheckMacValue = checkMacValue(fields, cfg.hashKey, cfg.hashIV);
  return { action: `${cfg.host}/Cashier/AioCheckOut/V5`, fields };
}

/** 終止定期定額（之後不再扣款；無法復原，要再訂閱需重新結帳） */
export async function cancelPeriod(tradeNo: string, cfg: EcpayConfig = ecpayConfig()): Promise<{ ok: boolean; message: string }> {
  const fields: Record<string, string> = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: tradeNo,
    Action: "Cancel",
    TimeStamp: String(Math.floor(Date.now() / 1000)),
  };
  fields.CheckMacValue = checkMacValue(fields, cfg.hashKey, cfg.hashIV);
  try {
    const res = await fetch(`${cfg.host}/Cashier/CreditCardPeriodAction`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const text = await res.text();
    const parsed = new URLSearchParams(text);
    return { ok: parsed.get("RtnCode") === "1", message: parsed.get("RtnMsg") ?? text.slice(0, 120) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "連線失敗" };
  }
}

export async function readForm(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(await req.text())) out[k] = v;
  return out;
}

/** 綠界要求的回覆：純文字 1|OK；其他內容會被視為失敗並重送 */
export const ACK = () => new Response("1|OK", { headers: { "Content-Type": "text/plain" } });
export const NAK = (why: string) => new Response(`0|${why}`, { status: 400, headers: { "Content-Type": "text/plain" } });
