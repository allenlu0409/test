import { ActionForm } from "@/components/form";
import { requireBusiness } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtMoney } from "@/lib/time";
import { monthlyOnlineCount } from "@/lib/booking";
import Link from "next/link";
import { PLANS, PLAN_ORDER, planOf, priceFor, YEARLY_MONTHS_CHARGED, type Cycle } from "@/lib/plans";
import { activeProvider } from "@/lib/billing";
import { changePlan } from "../actions";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string; cycle?: string }> }) {
  const { biz } = await requireBusiness();
  const sp = await searchParams;
  const status = sp.status;
  const current = planOf(biz.plan);
  const used = monthlyOnlineCount(biz);
  const staffCount = get<{ n: number }>("SELECT COUNT(*) AS n FROM staff WHERE business_id = ? AND archived = 0", biz.id)!.n;
  const payments = all<{ plan: string; amount: number; status: string; created_at: string }>("SELECT plan, amount, status, created_at FROM payments WHERE business_id = ? ORDER BY id DESC LIMIT 24", biz.id);
  const provider = activeProvider();
  const demo = provider === "demo";
  const live = provider === "stripe" || provider === "ecpay";
  // Stripe 有客戶入口可自助管理；綠界則直接在本頁換方案或取消
  const subscribed = provider === "stripe" && !!biz.stripe_subscription_id;
  const ending = !!biz.cancel_at_period_end && biz.plan !== "free";
  // 年繳目前只支援綠界（與示範模式）
  const yearlyOffered = provider === "ecpay" || provider === "demo";
  const cycle: Cycle = yearlyOffered && (sp.cycle ? sp.cycle === "year" : biz.billing_cycle === "year") ? "year" : "month";
  const renews = biz.plan_renews_at ? new Date(biz.plan_renews_at * 1000).toLocaleDateString("zh-TW", { timeZone: biz.timezone }) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">方案與帳單</h1>

      {status === "success" && (
        <p role="status" className="rounded-2xl bg-brand-soft p-4 text-sm font-medium text-brand-dark">
          付款成功，謝謝你的支持！方案會在幾秒內生效，若尚未更新請重新整理頁面。
        </p>
      )}
      {status === "pending" && (
        <p role="status" className="rounded-2xl bg-brand-soft p-4 text-sm font-medium text-brand-dark">
          付款完成後方案會在一分鐘內生效，請稍候再重新整理頁面。若你沒有完成付款，方案不會變更。
        </p>
      )}
      {status === "cancel-scheduled" && (
        <p role="status" className="rounded-2xl bg-paper p-4 text-sm">
          訂閱已取消，之後不會再扣款。{renews ? `付費功能可以使用到 ${renews}，之後自動回到免費版。` : ""}資料都會保留。
        </p>
      )}
      {status === "switched" && (
        <p role="status" className="rounded-2xl bg-brand-soft p-4 text-sm font-medium text-brand-dark">
          方案已切換為{current.name}（示範模式，未實際扣款）。
        </p>
      )}
      {status === "cancelled" && <p className="rounded-2xl bg-paper p-4 text-sm text-muted">已取消結帳，方案沒有變更。</p>}
      {demo && (
        <p className="rounded-2xl bg-sun-soft p-4 text-sm text-note">
          <strong>示範模式：</strong>還沒設定金流，按下按鈕會直接切換方案、不會扣款。設定綠界金鑰後就是正式的收款流程。
        </p>
      )}

      <section className="panel grid gap-5 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">目前方案</p>
          <p className="mt-1 text-xl font-bold">
            {current.name}
            {biz.plan !== "free" && biz.billing_cycle === "year" && <span className="ml-2 text-sm font-normal text-muted">年繳</span>}
          </p>
          {renews && biz.plan !== "free" && <p className="text-xs text-muted">{ending ? `已取消訂閱，可使用至 ${renews}` : `下次扣款日 ${renews}`}</p>}
        </div>
        <div>
          <p className="text-xs text-muted">本月線上預約</p>
          <p className="tnum mt-1 text-xl font-bold">
            {used}
            <span className="text-sm font-normal text-muted"> / {Number.isFinite(current.monthlyBookings) ? current.monthlyBookings : "不限"}</span>
          </p>
          {Number.isFinite(current.monthlyBookings) && (
            <div className="mt-2 h-1.5 overflow-hidden bg-line" role="presentation">
              <div className={`h-full ${used >= current.monthlyBookings ? "bg-danger" : "bg-brand"}`} style={{ width: `${Math.min(100, (used / current.monthlyBookings) * 100)}%` }} />
            </div>
          )}
        </div>
        <div>
          <p className="text-xs text-muted">服務人員</p>
          <p className="tnum mt-1 text-xl font-bold">
            {staffCount}
            <span className="text-sm font-normal text-muted"> / {Number.isFinite(current.maxStaff) ? current.maxStaff : "不限"}</span>
          </p>
        </div>
      </section>

      {yearlyOffered && (
        <div className="flex items-baseline gap-5 border-b border-line text-sm" role="tablist" aria-label="付款週期">
          {(["month", "year"] as const).map((c) => (
            <Link
              key={c}
              href={`/dashboard/billing?cycle=${c}`}
              role="tab"
              aria-selected={cycle === c}
              className={`-mb-px border-b-2 pb-2 ${cycle === c ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink"}`}
            >
              {c === "month" ? "月繳" : `年繳（付 ${YEARLY_MONTHS_CHARGED} 個月，用 12 個月）`}
            </Link>
          ))}
        </div>
      )}

      <div className="panel divide-y divide-line">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const isCurrent = biz.plan === id && (id === "free" || biz.billing_cycle === cycle);
          const isUp = PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(biz.plan);
          const yearly = cycle === "year" && id !== "free";
          return (
            <section key={id} className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-[1fr_12rem] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <h2 className="font-display text-xl">{p.name}</h2>
                  {biz.plan === id && <span className="badge text-brand">使用中</span>}
                  <span className="leader" aria-hidden="true" />
                  <p className="tnum font-display text-xl">
                    NT${priceFor(id, yearly ? "year" : "month").toLocaleString()}
                    <span className="ml-1 text-sm font-normal text-muted">／{yearly ? "年" : "月"}</span>
                  </p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink/80">{p.features.join("・")}</p>
              </div>
              <div>
                {isCurrent ? (
                  subscribed ? (
                    <ActionForm action={changePlan} submit="管理訂閱／發票／取消" submitClass="btn btn-ghost w-full">
                      <input type="hidden" name="plan" value={id} />
                    </ActionForm>
                  ) : ending && id !== "free" ? (
                    <ActionForm action={changePlan} submit="恢復訂閱" submitClass="btn btn-primary w-full">
                      <input type="hidden" name="plan" value={id} />
                      <input type="hidden" name="cycle" value={cycle} />
                    </ActionForm>
                  ) : (
                    <p className="py-2.5 text-center text-sm text-muted">你正在使用這個方案</p>
                  )
                ) : (
                  <ActionForm
                    action={changePlan}
                    submit={id === "free" && ending ? "已取消訂閱" : biz.plan === id ? (cycle === "year" ? "改為年繳" : "改為月繳") : isUp ? `升級${p.name}` : subscribed ? "變更方案" : id === "free" && live ? "取消訂閱" : `改用${p.name}`}
                    submitClass={`btn w-full ${isUp ? "btn-primary" : "btn-ghost"}`}
                    confirmText={isUp || biz.plan === id ? undefined : id === "free" ? (live ? "確定取消訂閱？" : "確定改回免費版？") : "確定降級？"}
                  >
                    <input type="hidden" name="plan" value={id} />
                    <input type="hidden" name="cycle" value={cycle} />
                  </ActionForm>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-sm text-muted">
        {live
          ? `付款由${provider === "ecpay" ? "綠界科技" : " Stripe "}安全處理，我們不會儲存你的卡號。可隨時取消，當期結束後自動回到免費版，資料全部保留。`
          : "可隨時變更方案，降級後資料全部保留；超出方案上限的服務人員不會被刪除，但無法再新增。"}
      </p>
      {payments.length > 0 && (
        <section className="panel p-5">
          <h2 className="font-bold">付款紀錄</h2>
          <table className="tnum mt-3 w-full text-sm">
            <tbody className="divide-y divide-line">
              {payments.map((p, n) => (
                <tr key={n}>
                  <td className="py-2 text-muted">{new Date(`${p.created_at.replace(" ", "T")}Z`).toLocaleDateString("zh-TW", { timeZone: biz.timezone })}</td>
                  <td className="py-2">{planOf(p.plan).name}</td>
                  <td className={`py-2 text-right font-semibold ${p.status === "paid" ? "" : "text-danger"}`}>{p.status === "paid" ? fmtMoney(p.amount) : "扣款失敗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
