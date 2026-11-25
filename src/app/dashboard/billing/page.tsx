import { ActionForm } from "@/components/form";
import { requireBusiness } from "@/lib/auth";
import { get } from "@/lib/db";
import { monthlyOnlineCount } from "@/lib/booking";
import { PLANS, PLAN_ORDER, planOf } from "@/lib/plans";
import { activeProvider } from "@/lib/billing";
import { changePlan } from "../actions";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { biz } = await requireBusiness();
  const { status } = await searchParams;
  const current = planOf(biz.plan);
  const used = monthlyOnlineCount(biz);
  const staffCount = get<{ n: number }>("SELECT COUNT(*) AS n FROM staff WHERE business_id = ? AND archived = 0", biz.id)!.n;
  const provider = activeProvider();
  const demo = provider === "demo";
  const live = provider === "stripe" || provider === "ecpay";
  // Stripe 有客戶入口可自助管理；綠界則直接在本頁換方案或取消
  const subscribed = provider === "stripe" && !!biz.stripe_subscription_id;
  const ending = !!biz.cancel_at_period_end && biz.plan !== "free";
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
        <p className="rounded-2xl bg-sun-soft p-4 text-sm text-[#6b4700]">
          <strong>示範模式：</strong>尚未設定 Stripe 金鑰，按下按鈕會直接切換方案、不會扣款。設定金鑰後即為正式收款流程。
        </p>
      )}

      <section className="panel grid gap-5 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">目前方案</p>
          <p className="mt-1 text-xl font-bold">{current.name}</p>
          {renews && biz.plan !== "free" && <p className="text-xs text-muted">{ending ? `已取消訂閱，可使用至 ${renews}` : `下次扣款日 ${renews}`}</p>}
        </div>
        <div>
          <p className="text-xs text-muted">本月線上預約</p>
          <p className="tnum mt-1 text-xl font-bold">
            {used}
            <span className="text-sm font-normal text-muted"> / {Number.isFinite(current.monthlyBookings) ? current.monthlyBookings : "不限"}</span>
          </p>
          {Number.isFinite(current.monthlyBookings) && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="presentation">
              <div className={`h-full rounded-full ${used >= current.monthlyBookings ? "bg-danger" : "bg-brand"}`} style={{ width: `${Math.min(100, (used / current.monthlyBookings) * 100)}%` }} />
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

      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const isCurrent = biz.plan === id;
          const isUp = PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(biz.plan);
          return (
            <section key={id} className={`panel flex flex-col p-6 ${isCurrent ? "border-brand ring-1 ring-brand" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{p.name}</h2>
                {isCurrent && <span className="badge bg-brand-soft text-brand-dark">使用中</span>}
              </div>
              <p className="mt-3">
                <span className="tnum text-3xl font-black">NT${p.price.toLocaleString()}</span>
                <span className="text-sm text-muted"> / 月</span>
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-ink/85">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-brand" aria-hidden="true">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  subscribed ? (
                    <ActionForm action={changePlan} submit="管理訂閱／發票／取消" submitClass="btn btn-ghost w-full">
                      <input type="hidden" name="plan" value={id} />
                    </ActionForm>
                  ) : (
                    <p className="py-2.5 text-center text-sm text-muted">你正在使用這個方案</p>
                  )
                ) : (
                  <ActionForm
                    action={changePlan}
                    submit={isUp ? `升級${p.name}` : subscribed ? "變更方案" : id === "free" && live ? "取消訂閱" : `改用${p.name}`}
                    submitClass={`btn w-full ${isUp ? "btn-primary" : "btn-ghost"}`}
                    confirmText={isUp ? undefined : id === "free" ? "確定取消訂閱？" : "確定降級？"}
                  >
                    <input type="hidden" name="plan" value={id} />
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
    </div>
  );
}
