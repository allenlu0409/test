import Link from "next/link";
import { CopyButton } from "@/components/form";
import { StatusBadge } from "@/components/brand";
import { baseUrl, requireBusiness } from "@/lib/auth";
import { all, get, BOOKING_JOIN, type BookingRow } from "@/lib/db";
import { contactLocked, displayPhone, monthlyOnlineCount } from "@/lib/booking";
import { ActionForm } from "@/components/form";
import { setBookingStatus } from "./actions";
import { CATEGORY_TEMPLATES, planOf } from "@/lib/plans";
import { addDays, localMidnightUtc, fmtDateLong, fmtMoney, fmtTime, nowInTz, weekdayOf, WEEKDAYS } from "@/lib/time";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tnum mt-1 text-2xl font-bold">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
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
              className="relative bg-brand hover:bg-brand-dark"
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
  const newCustomers = get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE business_id = ? AND created_at >= ?", biz.id, localMidnightUtc(monthStart, biz.timezone))!.n;
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

  const totals = get<{ bookings: number; online: number }>(
    "SELECT COUNT(*) AS bookings, COUNT(CASE WHEN source = 'online' THEN 1 END) AS online FROM bookings WHERE business_id = ?",
    biz.id,
  )!;
  const template = (CATEGORY_TEMPLATES[biz.category] ?? []).map((t) => `${t.name}|${t.duration}|${t.price}`).sort().join();
  const mine = all<{ name: string; duration_min: number; price: number }>("SELECT name, duration_min, price FROM services WHERE business_id = ? AND archived = 0", biz.id)
    .map((x) => `${x.name}|${x.duration_min}|${x.price}`)
    .sort()
    .join();
  const servicesEdited = mine !== template;
  // 「自己約一筆測試」算在 totals.bookings 裡：店家用自己的手機走一次，才知道客人會看到什麼
  const steps: [done: boolean, label: string, href: string, cta: string][] = [
    [true, "開好預約頁", `/b/${biz.slug}`, "看看"],
    [servicesEdited, "把預設的服務、價格和時長改成你自己的", "/dashboard/services", "去確認"],
    [!!(biz.description || biz.address || biz.phone), "補上店家介紹、地址與電話，讓客人放心預約", "/dashboard/settings", "去填寫"],
    [totals.bookings > 0, "用自己的手機約一筆試試，看客人會看到什麼", `/b/${biz.slug}`, "去試約"],
    [totals.online > 1, "把連結貼到 IG 或 LINE，收到第一筆客人的預約", "/dashboard/settings", "複製連結"],
  ];
  const tomorrow = addDays(today, 1);
  const tomorrows = all<BookingRow>(`${BOOKING_JOIN} WHERE b.business_id = ? AND b.date = ? AND b.status = 'confirmed' ORDER BY b.start_min`, biz.id, tomorrow);
  // 過了日期卻還沒按「完成」或「未到」的預約：不結案，營收和未到率就不準
  const overdue = get<{ n: number }>("SELECT COUNT(*) AS n FROM bookings WHERE business_id = ? AND date < ? AND status = 'confirmed'", biz.id, today)!.n;
  const reminderText = (b: BookingRow) =>
    `${b.customer_name} 你好，提醒你明天 ${fmtTime(b.start_min)} 在${biz.name}有預約（${b.service_name}）。需要改時間或取消，請點這裡：${publicUrl.replace(`/b/${biz.slug}`, "")}/booking/${b.token}`;
  const showSteps = totals.online === 0;

  const used = monthlyOnlineCount(biz);
  const limit = plan.monthlyBookings;
  const nearQuota = Number.isFinite(limit) && used >= limit * 0.7;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{fmtDateLong(today)}</p>
          <h1 className="font-sans text-2xl font-bold tracking-normal">{biz.name}</h1>
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
          <a href={`https://line.me/R/share?text=${encodeURIComponent(`${biz.name} 線上預約：${publicUrl}`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            傳到 LINE
          </a>
          <Link href={`/b/${biz.slug}`} target="_blank" className="btn btn-ghost btn-sm">
            開啟預約頁
          </Link>
        </div>
      </div>

      {showSteps && (
        <section className="panel p-5">
          <h2 className="font-bold">
            開始收預約 <span className="tnum ml-1 text-sm font-normal text-muted">{steps.filter((x) => x[0]).length} / {steps.length}</span>
          </h2>
          <ol className="mt-3 divide-y divide-line">
            {steps.map(([ok, label, href, cta]) => (
              <li key={label} className="flex items-center gap-3 py-2.5">
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-[2px] text-xs font-bold ${ok ? "bg-ink text-white" : "border border-ink/40 text-muted"}`} aria-hidden="true">
                  {ok ? "✓" : ""}
                </span>
                <span className={`flex-1 text-sm ${ok ? "text-muted line-through" : "font-medium"}`}>{label}</span>
                {!ok && (
                  <Link href={href} className="text-sm font-semibold text-brand hover:underline">
                    {cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {nearQuota && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-ink/15 bg-sun-soft p-4">
          <p className="text-sm text-note">
            <strong>
              本月線上預約已用 {used} / {limit} 筆。
            </strong>
            {used >= limit ? "客人還是可以照常預約，但新預約的顧客電話要升級後才看得到。" : "超過之後客人仍可預約，但新預約的顧客電話要升級後才看得到。"}
          </p>
          <Link href="/dashboard/billing" className="btn btn-dark btn-sm">
            升級為不限筆數
          </Link>
        </div>
      )}

      {overdue > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-ink/15 bg-white p-4 text-sm">
          <p>
            <strong>有 {overdue} 筆過去的預約還沒結案。</strong>按「完成」或「未到」，營收和未到率才會準。
          </p>
          <Link href="/dashboard/bookings?tab=past" className="btn btn-ghost btn-sm">
            去結案
          </Link>
        </div>
      )}

      <dl className="panel grid grid-cols-2 divide-line max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r lg:grid-cols-4 lg:divide-x [&>*]:border-line">
        <Kpi label="今日預約" value={`${todays.length} 筆`} />
        <Kpi label="本月已完成營收" value={fmtMoney(month.revenue ?? 0)} sub={`本月預約 ${month.count} 筆`} />
        <Kpi label="本月新顧客" value={`${newCustomers} 位`} />
        <Kpi label="近 30 天未到率" value={`${noShowRate}%`} sub={`${show.missed} 筆未到`} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel p-5">
          <h2 className="font-bold">今天的預約</h2>
          {todays.length === 0 ? (
            <p className="mt-3 text-sm text-muted">今天沒有預約。</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {todays.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <span className="tnum w-12 text-sm font-semibold">{fmtTime(b.start_min)}</span>
                  <div className="min-w-32 flex-1">
                    <p className="truncate text-sm font-medium">
                      {b.customer_name}・{b.service_name}
                    </p>
                    <p className="text-xs text-muted">
                      {b.staff_name}・<span className="tnum">{displayPhone(b.customer_phone, contactLocked(b, biz))}</span>
                    </p>
                  </div>
                  {b.status === "confirmed" ? (
                    <span className="flex gap-2">
                      {(["completed", "no_show"] as const).map((st) => (
                        <ActionForm key={st} action={setBookingStatus} submit={st === "completed" ? "完成" : "未到"} submitClass={`btn btn-sm ${st === "completed" ? "btn-primary" : "btn-ghost"}`}>
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="status" value={st} />
                        </ActionForm>
                      ))}
                    </span>
                  ) : (
                    <StatusBadge status={b.status} />
                  )}
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

      {tomorrows.length > 0 && (
        <section className="panel p-5">
          <h2 className="font-bold">
            明天的預約 <span className="tnum ml-1 text-sm font-normal text-muted">{tomorrows.length} 筆</span>
          </h2>
          <p className="mt-1 text-sm text-muted">有留 Email 的客人會自動收到提醒信。想用 LINE 再提醒一次，按「複製提醒」貼給客人就好。</p>
          <ul className="mt-3 divide-y divide-line">
            {tomorrows.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <span className="tnum w-12 text-sm font-semibold">{fmtTime(b.start_min)}</span>
                <p className="min-w-32 flex-1 truncate text-sm">
                  <span className="font-medium">{b.customer_name}</span>・{b.service_name}・{b.staff_name}
                </p>
                <CopyButton text={reminderText(b)} label="複製提醒" />
              </li>
            ))}
          </ul>
        </section>
      )}

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
