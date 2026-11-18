import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { all, BOOKING_JOIN, type BookingRow } from "@/lib/db";
import { hoursOf } from "@/lib/booking";
import { addDays, fmtTime, isDateStr, nowInTz, weekdayOf, WEEKDAYS } from "@/lib/time";

const TONE: Record<string, string> = {
  confirmed: "border-brand/30 bg-brand-soft",
  completed: "border-line bg-paper text-ink/70",
  no_show: "border-sun/60 bg-sun-soft",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { biz } = await requireBusiness();
  const sp = await searchParams;
  const today = nowInTz(biz.timezone).date;
  const anchor = isDateStr(sp.week) ? sp.week : today;
  // 週一為一週的開始
  const monday = addDays(anchor, -((weekdayOf(anchor) + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const sunday = dates[6];

  const rows = all<BookingRow>(
    `${BOOKING_JOIN} WHERE b.business_id = ? AND b.date BETWEEN ? AND ? AND b.status != 'cancelled' ORDER BY b.start_min`,
    biz.id,
    monday,
    sunday,
  );
  const closed = new Set(all<{ date: string }>("SELECT date FROM closed_dates WHERE business_id = ? AND date BETWEEN ? AND ?", biz.id, monday, sunday).map((r) => r.date));
  const hours = hoursOf(biz.id);
  const byDate = new Map<string, BookingRow[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">行事曆</h1>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/calendar?week=${addDays(monday, -7)}`} className="btn btn-ghost btn-sm" aria-label="上一週">
            ← 上週
          </Link>
          <Link href="/dashboard/calendar" className="btn btn-ghost btn-sm">
            本週
          </Link>
          <Link href={`/dashboard/calendar?week=${addDays(monday, 7)}`} className="btn btn-ghost btn-sm" aria-label="下一週">
            下週 →
          </Link>
        </div>
      </div>
      <p className="tnum text-sm text-muted">
        {monday.replaceAll("-", "/")} – {sunday.replaceAll("-", "/")}・共 {rows.length} 筆預約
      </p>

      <div className="grid gap-3 md:grid-cols-7 md:gap-2">
        {dates.map((date) => {
          const list = byDate.get(date) ?? [];
          const h = hours.get(weekdayOf(date));
          const off = closed.has(date) || !h || h.closed;
          const isToday = date === today;
          return (
            <section key={date} className={`panel min-w-0 p-2.5 ${isToday ? "border-brand ring-1 ring-brand" : ""} ${off ? "bg-paper" : ""}`}>
              <header className="flex items-baseline justify-between gap-1 px-1 md:block">
                <p className={`text-xs ${isToday ? "font-bold text-brand" : "text-muted"}`}>
                  週{WEEKDAYS[weekdayOf(date)]}
                  {isToday && "・今天"}
                </p>
                <p className="tnum text-lg font-bold leading-tight">
                  {Number(date.slice(5, 7))}/{Number(date.slice(8))}
                </p>
              </header>
              <div className="mt-2 space-y-1.5">
                {off && list.length === 0 && <p className="px-1 py-2 text-xs text-muted">公休</p>}
                {!off && list.length === 0 && <p className="px-1 py-2 text-xs text-muted/70">尚無預約</p>}
                {list.map((b) => (
                  <div key={b.id} className={`rounded-lg border px-2 py-1.5 ${TONE[b.status] ?? TONE.confirmed}`}>
                    <p className="tnum text-xs font-semibold">
                      {fmtTime(b.start_min)}–{fmtTime(b.end_min)}
                    </p>
                    <p className="truncate text-xs font-medium">{b.customer_name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {b.service_name}・{b.staff_name}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
