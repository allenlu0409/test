import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get, type Business } from "@/lib/db";
import { activeServices, activeStaff, hoursOf, quotaReached } from "@/lib/booking";
import { CATEGORIES, planOf } from "@/lib/plans";
import { addDays, fmtDuration, fmtMoney, fmtTime, nowInTz, weekdayOf, WEEKDAYS } from "@/lib/time";
import { BookingFlow } from "./flow";

export const dynamic = "force-dynamic";

function bizBySlug(slug: string) {
  return get<Business>("SELECT * FROM businesses WHERE slug = ?", slug);
}

/** 依品牌色亮度決定按鈕上的文字用深色或白色，確保對比 */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#13211c" : "#ffffff";
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const biz = bizBySlug((await params).slug);
  if (!biz) return { title: "找不到店家" };
  return {
    title: `${biz.name}｜線上預約`,
    description: biz.description || `線上預約 ${biz.name}，24 小時都能選時段。`,
    openGraph: { title: `${biz.name}｜線上預約`, description: biz.description },
  };
}

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const biz = bizBySlug((await params).slug);
  if (!biz) notFound();

  const plan = planOf(biz.plan);
  const services = activeServices(biz.id);
  const staff = activeStaff(biz.id);
  const hours = hoursOf(biz.id);
  const today = nowInTz(biz.timezone).date;
  const horizon = Math.min(biz.max_advance_days, 60);
  const closed = new Set(all<{ date: string }>("SELECT date FROM closed_dates WHERE business_id = ? AND date >= ?", biz.id, today).map((r) => r.date));
  const days = Array.from({ length: horizon + 1 }, (_, i) => {
    const date = addDays(today, i);
    const wd = weekdayOf(date);
    const h = hours.get(wd);
    return { date, wd: WEEKDAYS[wd], day: Number(date.slice(8)), month: Number(date.slice(5, 7)), off: !h || h.closed || closed.has(date) };
  });
  const full = quotaReached(biz);
  const unavailable = !!biz.suspended || full || services.length === 0 || staff.length === 0;
  const color = plan.removeBranding ? biz.brand_color : "#0b6b53";

  return (
    <div style={{ "--bc": color, "--bt": textOn(color) } as React.CSSProperties} className="min-h-dvh">
      <script
        type="application/ld+json"
        // 結構化資料：讓搜尋引擎把預約頁辨識為在地商家。「<」轉義避免店家輸入的文字跳出 script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: biz.name,
            description: biz.description || undefined,
            telephone: biz.phone || undefined,
            address: biz.address || undefined,
            makesOffer: services.map((s) => ({ "@type": "Offer", name: s.name, price: s.price, priceCurrency: "TWD" })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <div className="h-2 bg-(--bc)" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header>
          <p className="text-sm font-medium text-(--bc)">{CATEGORIES[biz.category] ?? "線上預約"}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{biz.name}</h1>
          {biz.description && <p className="mt-3 text-[15px] text-ink/80">{biz.description}</p>}
          <dl className="mt-4 space-y-1 text-sm text-muted">
            {biz.address && (
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-ink">地址</dt>
                <dd>{biz.address}</dd>
              </div>
            )}
            {biz.phone && (
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-ink">電話</dt>
                <dd>
                  <a href={`tel:${biz.phone.replace(/[^\d+]/g, "")}`} className="tnum underline underline-offset-2">
                    {biz.phone}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </header>

        <div className="mt-8">
          {unavailable ? (
            <div className="panel p-6 text-center">
              <h2 className="font-bold">{full ? "本月線上預約已額滿" : "目前暫停線上預約"}</h2>
              <p className="mt-2 text-sm text-muted">
                請直接與店家聯繫預約。
                {biz.phone && (
                  <>
                    {" "}
                    電話：<span className="tnum font-medium text-ink">{biz.phone}</span>
                  </>
                )}
              </p>
            </div>
          ) : (
            <BookingFlow
              slug={biz.slug}
              notice={biz.notice}
              days={days}
              staff={staff.map((s) => ({ id: s.id, name: s.name, title: s.title }))}
              services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, duration: fmtDuration(s.duration_min), price: s.price ? fmtMoney(s.price) : "免費" }))}
            />
          )}
        </div>

        <section className="mt-10">
          <h2 className="text-sm font-bold">營業時間</h2>
          <dl className="tnum mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm text-muted">
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
              const h = hours.get(wd);
              return (
                <div key={wd} className="contents">
                  <dt>週{WEEKDAYS[wd]}</dt>
                  <dd>{!h || h.closed ? "公休" : `${fmtTime(h.open)}–${fmtTime(h.close)}`}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        {!plan.removeBranding && (
          <footer className="mt-10 border-t border-line pt-5 text-center text-sm text-muted">
            由{" "}
            <Link href="/" className="font-semibold text-brand hover:underline">
              約好
            </Link>{" "}
            提供預約服務・
            <Link href="/signup" className="underline underline-offset-2 hover:text-ink">
              我也要開一個預約頁
            </Link>
          </footer>
        )}
      </main>
    </div>
  );
}
