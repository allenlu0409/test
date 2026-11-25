import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { all, BOOKING_JOIN, type Block, type BookingRow } from "@/lib/db";
import { hoursOf } from "@/lib/booking";
import { addDays, fmtTime, isDateStr, nowInTz, weekdayOf, WEEKDAYS } from "@/lib/time";

/** 一週的預約本：每天一頁，時間寫在紅色邊線左邊，預約用藍筆寫在格線上 */
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
  const blocks = all<Block & { staff_name: string | null }>(
    "SELECT k.*, s.name AS staff_name FROM blocks k LEFT JOIN staff s ON s.id = k.staff_id WHERE k.business_id = ? AND k.date BETWEEN ? AND ? ORDER BY k.start_min",
    biz.id,
    monday,
    sunday,
  );
  const closed = new Set(all<{ date: string }>("SELECT date FROM closed_dates WHERE business_id = ? AND date BETWEEN ? AND ?", biz.id, monday, sunday).map((r) => r.date));
  const hours = hoursOf(biz.id);

  type Entry = { key: string; start: number; end: number; title: string; sub: string; kind: "confirmed" | "completed" | "no_show" | "block" };
  const byDate = new Map<string, Entry[]>();
  const put = (date: string, e: Entry) => byDate.set(date, [...(byDate.get(date) ?? []), e]);
  for (const b of rows) put(b.date, { key: `b${b.id}`, start: b.start_min, end: b.end_min, title: b.customer_name, sub: `${b.service_name}・${b.staff_name}`, kind: b.status as Entry["kind"] });
  for (const k of blocks) put(k.date, { key: `k${k.id}`, start: k.start_min, end: k.end_min, title: "保留", sub: `${k.staff_name ?? "全店"}${k.note ? `・${k.note}` : ""}`, kind: "block" });
  for (const list of byDate.values()) list.sort((a, b) => a.start - b.start);

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

      <div className="border border-ink/70 bg-white md:grid md:grid-cols-7 md:divide-x md:divide-line">
        {dates.map((date) => {
          const list = byDate.get(date) ?? [];
          const h = hours.get(weekdayOf(date));
          const off = closed.has(date) || !h || h.closed;
          const isToday = date === today;
          const past = date < today;
          return (
            <section key={date} className={`min-w-0 border-b border-line last:border-b-0 md:border-b-0 ${past ? "text-ink/55" : ""}`}>
              <header className={`flex items-baseline justify-between gap-2 border-b-2 px-3 py-2 ${isToday ? "border-seal" : "border-ink"}`}>
                <p className="font-display text-lg leading-tight">
                  <span className="tnum">
                    {Number(date.slice(5, 7))}/{Number(date.slice(8))}
                  </span>
                </p>
                <p className={`text-xs ${isToday ? "font-bold text-seal" : "text-muted"}`}>
                  週{WEEKDAYS[weekdayOf(date)]}
                  {isToday && "・今天"}
                </p>
              </header>
              {list.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted/80">{off ? "公休" : "—"}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {list.map((e) => (
                    <li key={e.key} className="flex gap-2 px-3 py-2 md:block">
                      <p className="tnum w-24 shrink-0 text-xs text-muted md:w-auto">
                        {fmtTime(e.start)}–{fmtTime(e.end)}
                      </p>
                      <div className="min-w-0">
                        <p
                          className={`truncate text-sm font-medium ${
                            e.kind === "block" ? "text-muted" : e.kind === "no_show" ? "text-muted line-through decoration-seal" : e.kind === "completed" ? "text-ink/70" : "text-brand"
                          }`}
                        >
                          {e.title}
                          {e.kind === "no_show" && <span className="ml-1 text-xs text-seal no-underline">未到</span>}
                        </p>
                        <p className="truncate text-xs text-muted">{e.sub}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted">藍字是還沒做的預約，灰字是已完成，劃掉的是未到。</p>
    </div>
  );
}
