import Link from "next/link";
import { ActionForm } from "@/components/form";
import { StatusBadge } from "@/components/brand";
import { requireBusiness } from "@/lib/auth";
import { all, BOOKING_JOIN, type Block, type BookingRow } from "@/lib/db";
import { activeServices, activeStaff, contactLocked, displayPhone } from "@/lib/booking";
import { fmtDateShort, fmtDuration, fmtMoney, fmtTime, nowInTz } from "@/lib/time";
import { planOf } from "@/lib/plans";
import { addBlock, createManualBooking, removeBlock, rescheduleBooking, setBookingStatus } from "../actions";

const TABS = [
  ["upcoming", "即將到來"],
  ["past", "過去"],
  ["cancelled", "已取消"],
] as const;

function StatusButton({ id, status, label, cls = "btn btn-ghost btn-sm", confirm }: { id: number; status: string; label: string; cls?: string; confirm?: string }) {
  return (
    <ActionForm action={setBookingStatus} submit={label} submitClass={cls} confirmText={confirm} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
    </ActionForm>
  );
}

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; new?: string }> }) {
  const { biz } = await requireBusiness();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "upcoming";
  const today = nowInTz(biz.timezone).date;

  const where =
    tab === "upcoming"
      ? "b.date >= ? AND b.status = 'confirmed' ORDER BY b.date, b.start_min"
      : tab === "past"
        ? "(b.date < ? OR b.status IN ('completed','no_show')) AND b.status != 'cancelled' ORDER BY b.date DESC, b.start_min DESC"
        : "b.date >= date(?, '-90 days') AND b.status = 'cancelled' ORDER BY b.date DESC, b.start_min DESC";
  const rows = all<BookingRow>(`${BOOKING_JOIN} WHERE b.business_id = ? AND ${where} LIMIT 200`, biz.id, today);
  const services = activeServices(biz.id);
  const staff = activeStaff(biz.id);
  const blocks = all<Block & { staff_name: string | null }>(
    "SELECT k.*, s.name AS staff_name FROM blocks k LEFT JOIN staff s ON s.id = k.staff_id WHERE k.business_id = ? AND k.date >= ? ORDER BY k.date, k.start_min LIMIT 30",
    biz.id,
    today,
  );
  const lockedCount = rows.filter((b) => contactLocked(b, biz)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">預約</h1>
        {planOf(biz.plan).csvExport ? (
          <a href="/dashboard/bookings/export" className="btn btn-ghost btn-sm">
            匯出 CSV
          </a>
        ) : (
          <Link href="/dashboard/billing" className="btn btn-ghost btn-sm">
            匯出 CSV（專業版）
          </Link>
        )}
      </div>

      <details className="panel group" open={sp.new === "1"}>
        <summary className="flex list-none items-center justify-between px-5 py-4 font-semibold">
          手動新增預約
          <span className="text-sm font-normal text-muted group-open:hidden">電話、LINE 或現場來的預約記在這裡</span>
        </summary>
        <ActionForm action={createManualBooking} resetOnOk submit="建立預約" className="grid gap-4 border-t border-line p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="mb-service">
              服務
            </label>
            <select id="mb-service" name="service_id" required className="input">
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{fmtDuration(s.duration_min)}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="mb-staff">
              服務人員
            </label>
            <select id="mb-staff" name="staff_id" className="input">
              <option value="">不指定（自動安排）</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="mb-date">
                日期
              </label>
              <input id="mb-date" name="date" type="date" required defaultValue={today} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="mb-time">
                時間
              </label>
              <input id="mb-time" name="time" type="time" required step={300} className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="mb-name">
              顧客姓名
            </label>
            <input id="mb-name" name="name" required maxLength={40} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="mb-phone">
              手機
            </label>
            <input id="mb-phone" name="phone" type="tel" placeholder="現場客沒留電話可以空白" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="mb-note">
              備註
            </label>
            <input id="mb-note" name="note" maxLength={300} className="input" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3" />
        </ActionForm>
      </details>

      <details className="panel group">
        <summary className="flex list-none items-center justify-between px-5 py-4 font-semibold">
          <span>
            保留時段{blocks.length > 0 && <span className="tnum ml-2 text-sm font-normal text-muted">{blocks.length} 筆</span>}
          </span>
          <span className="text-sm font-normal text-muted group-open:hidden">午休、私事、進貨：這段時間不開放線上預約</span>
        </summary>
        <div className="border-t border-line p-5">
          {blocks.length > 0 && (
            <ul className="mb-4 divide-y divide-line border-y border-line">
              {blocks.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <span className="tnum">
                    <span className="font-medium">{fmtDateShort(k.date)}</span> {fmtTime(k.start_min)}–{fmtTime(k.end_min)}
                    <span className="ml-3 text-muted">
                      {k.staff_name ?? "全店"}
                      {k.note && `・${k.note}`}
                    </span>
                  </span>
                  <ActionForm action={removeBlock} submit="取消保留" submitClass="btn btn-ghost btn-sm">
                    <input type="hidden" name="id" value={k.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addBlock} resetOnOk submit="保留這段時間" submitClass="btn btn-ghost self-end" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="bl-date">
                日期
              </label>
              <input id="bl-date" name="date" type="date" required defaultValue={today} min={today} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="bl-start">
                從
              </label>
              <input id="bl-start" name="start" type="time" required step={300} defaultValue="12:00" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="bl-end">
                到
              </label>
              <input id="bl-end" name="end" type="time" required step={300} defaultValue="13:00" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="bl-staff">
                對象
              </label>
              <select id="bl-staff" name="staff_id" className="input">
                <option value="">全店</option>
                {staff.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-32 flex-1">
              <label className="label" htmlFor="bl-note">
                原因（選填，客人看不到）
              </label>
              <input id="bl-note" name="note" maxLength={40} className="input" />
            </div>
          </ActionForm>
        </div>
      </details>

      {lockedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-ink/15 bg-sun-soft p-4 text-sm text-note">
          <p>
            <strong>有 {lockedCount} 筆預約是免費額度用完後收到的。</strong>客人照常會來，但電話要升級後才看得到。
          </p>
          <Link href="/dashboard/billing" className="btn btn-dark btn-sm">
            升級並顯示電話
          </Link>
        </div>
      )}

      <div className="flex gap-1 border-b border-line">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/dashboard/bookings?tab=${k}`}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${tab === k ? "border-ink font-bold text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted">這裡目前沒有預約。</p>
      ) : (
        <ul className="panel divide-y divide-line">
          {rows.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5">
              <div className="tnum w-28 shrink-0">
                <p className="text-sm font-semibold">{fmtDateShort(b.date)}</p>
                <p className="text-sm text-muted">
                  {fmtTime(b.start_min)}–{fmtTime(b.end_min)}
                </p>
              </div>
              <div className="min-w-40 flex-1">
                <p className="font-medium">
                  {b.customer_name} <span className="tnum text-sm font-normal text-muted">{displayPhone(b.customer_phone, contactLocked(b, biz))}</span>
                </p>
                <p className="text-sm text-muted">
                  {b.service_name}・{b.staff_name}・<span className="tnum">{fmtMoney(b.price)}</span>
                  {b.source === "manual" && "・手動建立"}
                </p>
                {b.note && !contactLocked(b, biz) && <p className="mt-1 bg-paper px-2.5 py-1 text-sm">備註：{b.note}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={b.status} />
                {b.status === "confirmed" && (
                  <>
                    {/* 只有今天的預約用實心按鈕，一整頁才不會都是藍色 */}
                    {b.date <= today && <StatusButton id={b.id} status="completed" label="完成" cls={`btn btn-sm ${b.date === today ? "btn-primary" : "btn-ghost"}`} />}
                    {b.date <= today && <StatusButton id={b.id} status="no_show" label="未到" />}
                    <details className="group/rs [&[open]]:order-last [&[open]]:w-full">
                      <summary className="btn btn-ghost btn-sm list-none">改期</summary>
                      <ActionForm action={rescheduleBooking} submit="確認改期" submitClass="btn btn-ghost btn-sm self-end" className="mt-3 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="id" value={b.id} />
                        <div>
                          <label className="label" htmlFor={`rs-date-${b.id}`}>
                            新日期
                          </label>
                          <input id={`rs-date-${b.id}`} name="date" type="date" required defaultValue={b.date} className="input" />
                        </div>
                        <div>
                          <label className="label" htmlFor={`rs-time-${b.id}`}>
                            新時間
                          </label>
                          <input id={`rs-time-${b.id}`} name="time" type="time" required step={300} defaultValue={fmtTime(b.start_min)} className="input" />
                        </div>
                      </ActionForm>
                    </details>
                    <StatusButton id={b.id} status="cancelled" label="取消" cls="btn btn-danger btn-sm" confirm="確定取消？" />
                  </>
                )}
                {(b.status === "completed" || b.status === "no_show" || b.status === "cancelled") && tab !== "cancelled" && (
                  <StatusButton id={b.id} status="confirmed" label="復原" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
