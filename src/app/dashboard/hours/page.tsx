import { ActionForm } from "@/components/form";
import { requireBusiness } from "@/lib/auth";
import { all } from "@/lib/db";
import { hoursOf } from "@/lib/booking";
import { fmtDateLong, fmtTime, nowInTz, WEEKDAYS } from "@/lib/time";
import { addClosedDate, removeClosedDate, saveHours } from "../actions";

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default async function HoursPage() {
  const { biz } = await requireBusiness();
  const hours = hoursOf(biz.id);
  const today = nowInTz(biz.timezone).date;
  const closed = all<{ date: string; note: string }>("SELECT date, note FROM closed_dates WHERE business_id = ? AND date >= ? ORDER BY date", biz.id, today);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">營業時間</h1>

      <ActionForm action={saveHours} submit="儲存營業時間與規則" className="space-y-6">
        <section className="panel divide-y divide-line">
          {ORDER.map((wd) => {
            const h = hours.get(wd) ?? { open: 600, close: 1200, closed: false };
            return (
              <div key={wd} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <span className="w-12 font-semibold">週{WEEKDAYS[wd]}</span>
                <input name={`open_${wd}`} type="time" required defaultValue={fmtTime(h.open)} aria-label={`週${WEEKDAYS[wd]}開始時間`} className="input w-32" />
                <span className="text-muted">至</span>
                <input name={`close_${wd}`} type="time" required defaultValue={fmtTime(h.close)} aria-label={`週${WEEKDAYS[wd]}結束時間`} className="input w-32" />
                <label className="ml-auto flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`closed_${wd}`} defaultChecked={h.closed} className="size-4 accent-brand" />
                  公休
                </label>
              </div>
            );
          })}
        </section>

        <section className="panel grid gap-4 p-5 sm:grid-cols-3">
          <h2 className="font-bold sm:col-span-3">預約規則</h2>
          <div>
            <label className="label" htmlFor="slot_interval">
              時段間隔
            </label>
            <select id="slot_interval" name="slot_interval" defaultValue={biz.slot_interval} className="input">
              {[15, 20, 30, 60].map((n) => (
                <option key={n} value={n}>
                  每 {n} 分鐘
                </option>
              ))}
            </select>
            <p className="hint">客人看到的開始時間，例如 10:00、10:30。</p>
          </div>
          <div>
            <label className="label" htmlFor="min_lead_minutes">
              最晚需提前
            </label>
            <select id="min_lead_minutes" name="min_lead_minutes" defaultValue={biz.min_lead_minutes} className="input">
              {[
                [0, "不限制"],
                [30, "30 分鐘"],
                [60, "1 小時"],
                [120, "2 小時"],
                [240, "4 小時"],
                [720, "12 小時"],
                [1440, "1 天"],
                [2880, "2 天"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <p className="hint">避免客人約了十分鐘後的時段讓你措手不及。</p>
          </div>
          <div>
            <label className="label" htmlFor="max_advance_days">
              開放未來幾天
            </label>
            <input id="max_advance_days" name="max_advance_days" type="number" min={1} max={365} required defaultValue={biz.max_advance_days} className="input" />
            <p className="hint">客人最遠可以約到幾天後。</p>
          </div>
          <div>
            <label className="label" htmlFor="buffer_minutes">
              每筆預約之間保留
            </label>
            <select id="buffer_minutes" name="buffer_minutes" defaultValue={biz.buffer_minutes} className="input">
              <option value={0}>不保留</option>
              <option value={5}>5 分鐘</option>
              <option value={10}>10 分鐘</option>
              <option value={15}>15 分鐘</option>
              <option value={20}>20 分鐘</option>
              <option value={30}>30 分鐘</option>
            </select>
            <p className="hint">留一點時間整理、消毒或喘口氣。只影響客人線上能約的時段。</p>
          </div>
          <div>
            <label className="label" htmlFor="cancel_cutoff_minutes">
              客人可以自己取消或改期到
            </label>
            <select id="cancel_cutoff_minutes" name="cancel_cutoff_minutes" defaultValue={biz.cancel_cutoff_minutes} className="input">
              <option value={0}>預約開始前都可以</option>
              <option value={60}>開始前 1 小時</option>
              <option value={120}>開始前 2 小時</option>
              <option value={180}>開始前 3 小時</option>
              <option value={360}>開始前 6 小時</option>
              <option value={720}>開始前 12 小時</option>
              <option value={1440}>開始前 1 天</option>
              <option value={2880}>開始前 2 天</option>
            </select>
            <p className="hint">超過期限後，客人會被引導直接聯繫你。</p>
          </div>
          <div>
            <label className="label" htmlFor="no_show_limit">
              未到的客人
            </label>
            <select id="no_show_limit" name="no_show_limit" defaultValue={biz.no_show_limit} className="input">
              <option value={0}>不限制</option>
              <option value={2}>未到 2 次後不能線上預約</option>
              <option value={3}>未到 3 次後不能線上預約</option>
              <option value={5}>未到 5 次後不能線上預約</option>
            </select>
            <p className="hint">以手機號碼計算。被擋下的客人會看到「請直接與店家聯繫」。</p>
          </div>
        </section>
      </ActionForm>

      <section className="panel p-5">
        <h2 className="font-bold">臨時公休日</h2>
        <p className="mt-1 text-sm text-muted">進修、出國、國定假日。這些日期客人無法線上預約。</p>
        {closed.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {closed.map((c) => (
              <li key={c.date} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm">
                  <span className="tnum font-medium">{fmtDateLong(c.date)}</span>
                  {c.note && <span className="ml-2 text-muted">{c.note}</span>}
                </span>
                <ActionForm action={removeClosedDate} submit="移除" submitClass="btn btn-ghost btn-sm">
                  <input type="hidden" name="date" value={c.date} />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addClosedDate} resetOnOk submit="新增公休日" submitClass="btn btn-ghost self-end" className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="closed-date">
              日期
            </label>
            <input id="closed-date" name="date" type="date" required min={today} className="input" />
          </div>
          <div className="min-w-40 flex-1">
            <label className="label" htmlFor="closed-note">
              原因（選填，僅自己看得到）
            </label>
            <input id="closed-note" name="note" maxLength={40} className="input" />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
