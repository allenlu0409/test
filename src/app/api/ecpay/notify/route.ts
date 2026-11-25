import { ACK, NAK, cancelPeriod, ecpayConfig, readForm, verifyMac } from "@/lib/ecpay";
import { handleFirstPayment } from "@/lib/ecpay-events";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = ecpayConfig();
  if (!cfg.merchantId) return new Response("ecpay not configured", { status: 503 });
  const params = await readForm(req);
  if (!verifyMac(params, cfg)) return NAK("CheckMacValue Error");

  const result = handleFirstPayment(params, cfg.merchantId, process.env.ECPAY_STAGE === "1");
  if (!result.ok) {
    console.error("ecpay notify rejected", result.reason, params.MerchantTradeNo);
    return NAK(result.reason);
  }
  if (result.cancelOld) {
    const r = await cancelPeriod(result.cancelOld, cfg);
    if (!r.ok) console.error("ecpay: failed to cancel replaced subscription", result.cancelOld, r.message);
  }
  return ACK();
}
