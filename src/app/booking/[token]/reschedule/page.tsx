import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { get, BOOKING_JOIN, type BookingRow, type Business } from "@/lib/db";
import { bookableDays, isUpcoming, rescheduleByCustomer } from "@/lib/booking";
import { hitByIp } from "@/lib/client-ip";
import { brandVars } from "@/lib/color";
import { notifyRescheduled } from "@/lib/notify";
import { planOf } from "@/lib/plans";
import { fmtDateLong, fmtTime } from "@/lib/time";
import { ReschedulePicker } from "./picker";

export const metadata = { title: "改時間", robots: { index: false } };
export const dynamic = "force-dynamic";

async function move(token: string, date: string, start: number): Promise<{ error: string }> {
  "use server";
  if (!(await hitByIp("reschedule", 10, 3600_000))) return { error: "操作太頻繁，請稍後再試或直接聯繫店家" };
  const result = rescheduleByCustomer(String(token), String(date), Number(start));
  if (!result.ok) return { error: result.error };
  const id = result.booking.id;
  after(() => notifyRescheduled(id, "customer").catch((e) => console.error("notify failed", e)));
  redirect(`/booking/${token}?moved=1`);
}

export default async function ReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = get<BookingRow>(`${BOOKING_JOIN} WHERE b.token = ?`, token);
  if (!b) notFound();
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", b.business_id)!;
  if (b.status !== "confirmed" || !isUpcoming(b, biz.timezone)) redirect(`/booking/${token}`);

  return (
    <main style={brandVars(biz.brand_color, planOf(biz.plan).removeBranding) as React.CSSProperties} className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      <p className="text-sm text-muted">{biz.name}</p>
      <h1 className="mt-1 text-2xl">改時間</h1>
      <p className="mt-2 text-sm text-muted">
        {b.service_name}・目前是 <span className="tnum font-medium text-ink">{fmtDateLong(b.date)} {fmtTime(b.start_min)}</span>。選一個新的時段，原本的時間會自動讓出來。
      </p>
      <section className="panel mt-6 p-5">
        <ReschedulePicker token={token} slug={biz.slug} serviceId={b.service_id} days={bookableDays(biz)} move={move} />
      </section>
      <Link href={`/booking/${token}`} className="mt-5 inline-block text-sm text-muted underline underline-offset-4 hover:text-ink">
        不改了，回預約明細
      </Link>
    </main>
  );
}
