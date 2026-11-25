import Link from "next/link";
import { ActionForm } from "@/components/form";
import { StatusBadge } from "@/components/brand";
import { requireBusiness } from "@/lib/auth";
import { all, BOOKING_JOIN, type BookingRow } from "@/lib/db";
import { activeServices, activeStaff } from "@/lib/booking";
import { fmtDateShort, fmtDuration, fmtMoney, fmtTime, nowInTz } from "@/lib/time";
import { planOf } from "@/lib/plans";
import { createManualBooking, rescheduleBooking, setBookingStatus } from "../actions";

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
            <input id="mb-phone" name="phone" type="tel" required placeholder="0912345678" className="input" />
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
                  {b.customer_name} <span className="tnum text-sm font-normal text-muted">{b.customer_phone}</span>
                </p>
                <p className="text-sm text-muted">
                  {b.service_name}・{b.staff_name}・<span className="tnum">{fmtMoney(b.price)}</span>
                  {b.source === "manual" && "・手動建立"}
                </p>
                {b.note && <p className="mt-1 rounded-lg bg-paper px-2.5 py-1 text-sm">備註：{b.note}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={b.status} />
                {b.status === "confirmed" && (
                  <>
                    {b.date <= today && <StatusButton id={b.id} status="completed" label="完成" cls="btn btn-primary btn-sm" />}
                    {b.date <= today && <StatusButton id={b.id} status="no_show" label="未到" />}
                    <StatusButton id={b.id} status="cancelled" label="取消" cls="btn btn-danger btn-sm" confirm="確定取消？" />
                  </>
                )}
                {(b.status === "completed" || b.status === "no_show" || b.status === "cancelled") && tab !== "cancelled" && (
                  <StatusButton id={b.id} status="confirmed" label="復原" />
                )}
              </div>
              {b.status === "confirmed" && (
                <details className="w-full">
                  <summary className="inline-block text-sm text-muted underline underline-offset-4 hover:text-ink">改期</summary>
                  <ActionForm action={rescheduleBooking} submit="確認改期" submitClass="btn btn-ghost btn-sm self-end" className="mt-2 flex flex-wrap items-end gap-3">
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
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
