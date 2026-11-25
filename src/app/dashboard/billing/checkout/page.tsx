import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { activeProvider } from "@/lib/billing";
import { buildCheckout, newTradeNo } from "@/lib/ecpay";
import { PLANS, priceFor, type Cycle } from "@/lib/plans";
import type { Plan } from "@/lib/db";
import { fmtMoney } from "@/lib/time";
import { AutoSubmit } from "./auto-submit";

export const metadata = { title: "前往付款" };

/** 綠界結帳需要由瀏覽器帶表單 POST 過去，這一頁負責產生已簽章的表單並自動送出 */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; cycle?: string }> }) {
  const { biz } = await requireBusiness();
  const sp = await searchParams;
  const plan = sp.plan as Plan;
  const cycle: Cycle = sp.cycle === "year" ? "year" : "month";
  const same = plan === biz.plan && cycle === biz.billing_cycle && !biz.cancel_at_period_end;
  if (activeProvider() !== "ecpay" || !(plan in PLANS) || plan === "free" || same) redirect("/dashboard/billing");

  const { action, fields } = buildCheckout({ plan, cycle, businessId: biz.id, tradeNo: newTradeNo(biz.id) });
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <h1 className="text-2xl font-bold">前往綠界安全付款</h1>
      <p className="mt-2 text-sm text-muted">
        {PLANS[plan].name}・{cycle === "year" ? "每年" : "每月"} <span className="tnum font-semibold text-ink">{fmtMoney(priceFor(plan, cycle))}</span>，以信用卡{cycle === "year" ? "每年" : "每月"}自動扣款，可隨時取消。
      </p>
      <form id="ecpay-form" method="post" action={action} className="mt-6">
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button type="submit" className="btn btn-primary px-8 py-3 text-base">
          前往付款
        </button>
      </form>
      <AutoSubmit formId="ecpay-form" />
      <p className="mt-4 text-xs text-muted">卡號由綠界科技處理，我們不會經手或儲存你的信用卡資料。</p>
    </div>
  );
}
