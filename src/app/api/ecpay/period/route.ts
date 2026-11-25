import { after } from "next/server";
import { notifyBilling } from "@/lib/notify";
import { processEcpayCancellations } from "@/lib/billing";
import { ACK, NAK, cancelPeriod, ecpayConfig, readForm, verifyMac } from "@/lib/ecpay";
import { handlePeriodPayment } from "@/lib/ecpay-events";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = ecpayConfig();
  if (!cfg.merchantId) return new Response("ecpay not configured", { status: 503 });
  const params = await readForm(req);
  if (!verifyMac(params, cfg)) return NAK("CheckMacValue Error");

  const result = handlePeriodPayment(params, cfg.merchantId);
  if (!result.ok) {
    console.error("ecpay period rejected", result.reason, params.MerchantTradeNo);
    return NAK(result.reason);
  }
  // 立刻試一次終止佇列（換方案的舊訂閱、沒有方案卻被扣款的訂閱）；失敗的由排程繼續重試
  after(() => processEcpayCancellations((t) => cancelPeriod(t, cfg)).catch((e) => console.error("ecpay cancel queue failed", e)));
  const n = result.notify;
  if (n) after(() => notifyBilling(n.businessId, n.event, n.amount).catch((e) => console.error("notify failed", e)));
  return ACK();
}
