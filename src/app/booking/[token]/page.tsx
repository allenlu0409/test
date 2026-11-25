import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyCancelled } from "@/lib/notify";
import { ActionForm, type FormState } from "@/components/form";
import { StatusBadge } from "@/components/brand";
import { get, run, BOOKING_JOIN, type BookingRow, type Business } from "@/lib/db";
import { fmtDateLong, fmtDuration, fmtMoney, fmtTime } from "@/lib/time";
import { isUpcoming } from "@/lib/booking";

export const metadata = { title: "預約明細", robots: { index: false } };
export const dynamic = "force-dynamic";

function load(token: string) {
  const booking = get<BookingRow>(`${BOOKING_JOIN} WHERE b.token = ?`, token);
  if (!booking) return null;
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", booking.business_id)!;
  return { booking, biz, upcoming: isUpcoming(booking, biz.timezone) };
}

async function cancel(_: FormState, data: FormData): Promise<FormState> {
  "use server";
  const token = String(data.get("token") ?? "");
  const found = load(token);
  if (!found) return { error: "找不到這筆預約" };
  if (found.booking.status !== "confirmed" || !found.upcoming) return { error: "這筆預約已無法線上取消，請直接聯繫店家" };
  const bookingId = found.booking.id;
  if (run("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status = 'confirmed'", bookingId).changes) {
    after(() => notifyCancelled(bookingId, "customer").catch((e) => console.error("notify failed", e)));
  }
  revalidatePath(`/booking/${token}`);
  return { ok: "" };
}

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string; moved?: string }> }) {
  const { token } = await params;
  const found = load(token);
  if (!found) notFound();
  const { booking: b, biz, upcoming } = found;
  const sp = await searchParams;
  const isNew = sp.new === "1" && b.status === "confirmed";
  const moved = sp.moved === "1" && b.status === "confirmed";
  const canCancel = b.status === "confirmed" && upcoming;

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      {isNew ? (
        <div className="text-center">
          <h1 className="stamp stamp-in text-5xl">約好了</h1>
          <p className="mt-6 text-sm text-muted">請把這個頁面加入書籤或截圖保存，之後可以從這裡查看或取消預約。</p>
        </div>
      ) : (
        <h1 className="text-2xl font-black">預約明細</h1>
      )}
      {moved && (
        <p role="status" className="mt-4 border border-ink/15 bg-brand-soft p-3 text-sm font-medium text-brand-dark">
          改好了，新的時間如下。店家已經收到通知。
        </p>
      )}

      <section className="panel mt-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{biz.name}</p>
            <p className="mt-0.5 text-xl font-bold">{b.service_name}</p>
          </div>
          <StatusBadge status={b.status} />
        </div>
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-sm">
          <dt className="text-muted">日期</dt>
          <dd className="tnum font-semibold">{fmtDateLong(b.date)}</dd>
          <dt className="text-muted">時間</dt>
          <dd className="tnum font-semibold">
            {fmtTime(b.start_min)}–{fmtTime(b.end_min)}（{fmtDuration(b.end_min - b.start_min)}）
          </dd>
          <dt className="text-muted">服務人員</dt>
          <dd>{b.staff_name}</dd>
          <dt className="text-muted">費用</dt>
          <dd className="tnum">{b.price ? `${fmtMoney(b.price)}（現場付款）` : "免費"}</dd>
          <dt className="text-muted">預約人</dt>
          <dd>{b.customer_name}</dd>
          {biz.address && (
            <>
              <dt className="text-muted">地址</dt>
              <dd>{biz.address}</dd>
            </>
          )}
          {biz.phone && (
            <>
              <dt className="text-muted">店家電話</dt>
              <dd className="tnum">{biz.phone}</dd>
            </>
          )}
        </dl>
        {biz.notice && b.status === "confirmed" && <p className="mt-5 rounded-xl bg-paper p-3.5 text-sm text-ink/80">{biz.notice}</p>}
      </section>

      <div className="mt-5 flex flex-wrap items-start gap-2">
        {b.status === "confirmed" && upcoming && (
          <a href={`/booking/${token}/ics`} className="btn btn-primary">
            加入行事曆
          </a>
        )}
        <Link href={`/b/${biz.slug}`} className="btn btn-ghost">
          {b.status === "confirmed" ? "再約一次" : "重新預約"}
        </Link>
        {canCancel && (
          <Link href={`/booking/${token}/reschedule`} className="btn btn-ghost">
            改時間
          </Link>
        )}
        {canCancel && (
          <ActionForm action={cancel} submit="取消預約" submitClass="btn btn-danger" confirmText="確定要取消嗎？" className="ml-auto">
            <input type="hidden" name="token" value={token} />
          </ActionForm>
        )}
      </div>
    </main>
  );
}
