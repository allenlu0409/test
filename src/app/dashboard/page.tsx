import Link from "next/link";
import { CopyButton } from "@/components/form";
import { StatusBadge } from "@/components/brand";
import { baseUrl, requireBusiness } from "@/lib/auth";
import { all, get, BOOKING_JOIN, type BookingRow } from "@/lib/db";
import { monthlyOnlineCount } from "@/lib/booking";
import { planOf } from "@/lib/plans";
import { addDays, fmtDateLong, fmtMoney, fmtTime, nowInTz, weekdayOf, WEEKDAYS } from "@/lib/time";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function RevenueChart({ days }: { days: { date: string; revenue: number }[] }) {
  const max = Math.max(...days.map((d) => d.revenue), 1);
  const top = Math.ceil(max / 1000) * 1000;
  return (
    <div>
      <div className="flex gap-3">
        <div className="tnum flex h-40 flex-col justify-between text-right text-[11px] text-muted">
          <span>{fmtMoney(top)}</span>
          <span>{fmtMoney(top / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative grid h-40 flex-1 grid-cols-[repeat(14,1fr)] items-end gap-1 border-b border-line sm:gap-2">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
          {days.map((d) => (
            <div
              key={d.date}
              title={`${d.date}：${fmtMoney(d.revenue)}`}
              className="relative rounded-t bg-brand/85 hover:bg-brand"
              style={{ height: `${(d.revenue / top) * 100}%`, minHeight: d.revenue ? 3 : 0 }}
            >
              <span className="sr-only">
                {d.date} 營收 {fmtMoney(d.revenue)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="ml-[calc(theme(spacing.3)+3.2rem)] mt-1.5 grid grid-cols-[repeat(14,1fr)] gap-1 text-center text-[10px] text-muted sm:gap-2">
        {days.map((d) => (
          <span key={d.date} className="tnum">
            {Number(d.date.slice(8))}
            <span className="hidden sm:inline">（{WEEKDAYS[weekdayOf(d.date)]}）</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { biz } = await requireBusiness();
  const { welcome } = await searchParams;
  const plan = planOf(biz.plan);
  const today = nowInTz(biz.timezone).date;
  const monthStart = `${today.slice(0, 7)}-01`;
  const publicUrl = `${await baseUrl()}/b/${biz.slug}`;

  const todays = all<BookingRow>(`${BOOKING_JOIN} WHERE b.business_id = ? AND b.date = ? AND b.status != 'cancelled' ORDER BY b.start_min`, biz.id, today);
  const upcoming = all<BookingRow>(
    `${BOOKING_JOIN} WHERE b.business_id = ? AND b.date > ? AND b.status = 'confirmed' ORDER BY b.date, b.start_min LIMIT 6`,
    biz.id,
    today,
  );
  const month = get<{ revenue: number | null; count: number }>(
    `SELECT SUM(CASE WHEN status = 'completed' THEN price END) AS revenue, COUNT(CASE WHEN status != 'cancelled' THEN 1 END) AS count
     FROM bookings WHERE business_id = ? AND substr(date, 1, 7) = ?`,
    biz.id,
    today.slice(0, 7),
  )!;
  const newCustomers = get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE business_id = ? AND created_at >= ?", biz.id, monthStart)!.n;
  const show = get<{ done: number; missed: number }>(
    `SELECT COUNT(CASE WHEN status = 'completed' THEN 1 END) AS done, COUNT(CASE WHEN status = 'no_show' THEN 1 END) AS missed
     FROM bookings WHERE business_id = ? AND date >= ? AND date <= ?`,
    biz.id,
    addDays(today, -30),
    today,
  )!;
  const noShowRate = show.done + show.missed ? Math.round((show.missed / (show.done + show.missed)) * 100) : 0;

  const from = addDays(today, -13);
  const revRows = all<{ date: string; revenue: number }>(
    "SELECT date, SUM(price) AS revenue FROM bookings WHERE business_id = ? AND status = 'completed' AND date BETWEEN ? AND ? GROUP BY date",
    biz.id,
    from,
    today,
  );
  const revMap = new Map(revRows.map((r) => [r.date, r.revenue]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(from, i);
    return { date, revenue: revMap.get(date) ?? 0 };
  });
  const topServices = all<{ name: string; n: number; revenue: number }>(
    `SELECT s.name, COUNT(*) AS n, SUM(b.price) AS revenue FROM bookings b JOIN services s ON s.id = b.service_id
     WHERE b.business_id = ? AND b.status = 'completed' AND b.date >= ? GROUP BY s.id ORDER BY revenue DESC LIMIT 4`,
    biz.id,
    addDays(today, -30),
  );

  const used = monthlyOnlineCount(biz.id);
  const limit = plan.monthlyBookings;
  const nearQuota = Number.isFinite(limit) && used >= limit * 0.7;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{fmtDateLong(today)}</p>
          <h1 className="text-2xl font-bold">{biz.name}</h1>
        </div>
        <Link href="/dashboard/bookings?new=1" className="btn btn-primary">
          新增預約
        </Link>
      </div>

      <div className={`panel flex flex-wrap items-center justify-between gap-3 p-4 ${welcome ? "border-brand bg-brand-soft" : ""}`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{welcome ? "預約頁開好了！把這條連結貼到 IG 或 LINE 就能開始收預約" : "你的預約頁"}</p>
          <p className="truncate text-sm text-muted">{publicUrl}</p>
        </div>
        <div className="flex gap-2">
          <CopyButton text={publicUrl} />
          <Link href={`/b/${biz.slug}`} target="_blank" className="btn btn-ghost btn-sm">
            開啟預約頁
          </Link>
        </div>
      </div>

      {nearQuota && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sun-soft p-4">
          <p className="text-sm text-[#6b4700]">
            <strong>
              本月線上預約已用 {used} / {limit} 筆。
            </strong>
            {used >= limit ? "額度已滿，客人目前無法線上預約。" : "額滿後客人將無法線上預約。"}
          </p>
          <Link href="/dashboard/billing" className="btn btn-dark btn-sm">
            升級為不限筆數
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="今日預約" value={`${todays.length} 筆`} />
        <Kpi label="本月已完成營收" value={fmtMoney(month.revenue ?? 0)} sub={`本月預約 ${month.count} 筆`} />
        <Kpi label="本月新顧客" value={`${newCustomers} 位`} />
        <Kpi label="近 30 天未到率" value={`${noShowRate}%`} sub={`${show.missed} 筆未到`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel p-5">
          <h2 className="font-bold">今天的預約</h2>
          {todays.length === 0 ? (
            <p className="mt-4 text-sm text-muted">今天沒有預約。把預約連結分享出去，讓客人自己約。</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {todays.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2.5">
                  <span className="tnum w-12 text-sm font-semibold">{fmtTime(b.start_min)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {b.customer_name}・{b.service_name}
                    </p>
                    <p className="text-xs text-muted">{b.staff_name}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">接下來</h2>
            <Link href="/dashboard/bookings" className="text-sm font-medium text-brand hover:underline">
              全部預約
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-muted">目前沒有之後的預約。</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {upcoming.map((b) => (
                <li key={b.id} className="py-2.5">
                  <p className="tnum text-xs text-muted">
                    {Number(b.date.slice(5, 7))}/{Number(b.date.slice(8))}（{WEEKDAYS[weekdayOf(b.date)]}）{fmtTime(b.start_min)}
                  </p>
                  <p className="truncate text-sm font-medium">
                    {b.customer_name}・{b.service_name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel relative overflow-hidden p-5">
        <h2 className="font-bold">近 14 天已完成營收</h2>
        <div className={`mt-5 grid gap-8 lg:grid-cols-[1.6fr_1fr] ${plan.analytics ? "" : "pointer-events-none select-none blur-[6px]"}`} aria-hidden={!plan.analytics}>
          <RevenueChart days={days} />
          <div>
            <h3 className="text-sm font-semibold text-muted">近 30 天最賺的服務</h3>
            <ul className="mt-2 space-y-2">
              {topServices.map((s) => (
                <li key={s.name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">
                    {s.name} <span className="text-muted">× {s.n}</span>
                  </span>
                  <span className="tnum font-semibold">{fmtMoney(s.revenue)}</span>
                </li>
              ))}
              {topServices.length === 0 && <li className="text-sm text-muted">完成第一筆預約後就會出現在這裡。</li>}
            </ul>
          </div>
        </div>
        {!plan.analytics && (
          <div className="absolute inset-0 top-12 flex flex-col items-center justify-center gap-3 bg-white/60 p-4 text-center">
            <p className="max-w-xs text-sm font-semibold">營收走勢與熱門服務分析是專業版功能</p>
            <Link href="/dashboard/billing" className="btn btn-primary btn-sm">
              升級專業版
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
