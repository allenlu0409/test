import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyCancelled } from "@/lib/notify";
import { ActionForm, type FormState } from "@/components/form";
import { StatusBadge } from "@/components/brand";
import { get, run, BOOKING_JOIN, type BookingRow, type Business } from "@/lib/db";
import { fmtDateLong, fmtDuration, fmtMoney, fmtTime } from "@/lib/time";
import { canSelfManage, isUpcoming } from "@/lib/booking";
import { baseUrl } from "@/lib/auth";
import { planOf } from "@/lib/plans";
import { CopyButton } from "@/components/form";
import { pad } from "@/lib/time";

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
  if (!canSelfManage(found.booking, found.biz)) return { error: "這筆預約已無法線上取消，請直接聯繫店家" };
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
  const canManage = canSelfManage(b, biz);
  const live = b.status === "confirmed" && upcoming;
  const url = `${await baseUrl()}/booking/${token}`;
  const stamp = (min: number) => `${b.date.replaceAll("-", "")}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
  // Google 日曆的新增活動連結：LINE 和 IG 的內建瀏覽器常常打不開 .ics 檔，這條連結都能用
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${biz.name}｜${b.service_name}`)}&dates=${stamp(b.start_min)}/${stamp(b.end_min)}&ctz=${encodeURIComponent(biz.timezone)}${biz.address ? `&location=${encodeURIComponent(biz.address)}` : ""}`;
  const lineText = `${biz.name}\n${b.service_name}\n${fmtDateLong(b.date)} ${fmtTime(b.start_min)}\n查看、改期或取消：${url}`;
  const cutoffHours = Math.round(biz.cancel_cutoff_minutes / 60);

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      {isNew ? (
        <div>
          <h1 className="stamp stamp-in text-5xl">約好了</h1>
          <p className="mt-6 text-sm text-muted">之後要查看、改期或取消，都從這一頁。把它傳到自己的 LINE 或加進行事曆，就不怕找不到。</p>
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

      {live && (
        <div className="mt-5 space-y-2">
          <a href={`https://line.me/R/share?text=${encodeURIComponent(lineText)}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full py-3">
            傳到我的 LINE
          </a>
          <div className="grid grid-cols-2 gap-2">
            <a href={gcal} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              加入 Google 日曆
            </a>
            <a href={`/booking/${token}/ics`} className="btn btn-ghost">
              其他行事曆
            </a>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1 text-sm text-muted">
            <span className="min-w-0 truncate">{url}</span>
            <CopyButton text={url} />
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-line pt-5">
        {canManage ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href={`/booking/${token}/reschedule`} className="btn btn-ghost">
              改時間
            </Link>
            <ActionForm action={cancel} submit="取消預約" submitClass="flex min-h-11 items-center text-sm text-danger underline underline-offset-4" confirmText="再按一次確定取消" inline>
              <input type="hidden" name="token" value={token} />
            </ActionForm>
          </div>
        ) : live ? (
          <p className="text-sm text-muted">
            距離預約不到 {cutoffHours} 小時，已經不能線上改期或取消。臨時有事請直接聯繫店家{biz.phone && <>：<span className="tnum font-medium text-ink">{biz.phone}</span></>}。
          </p>
        ) : (
          <Link href={`/b/${biz.slug}`} className="btn btn-ghost">
            {b.status === "confirmed" ? "再約一次" : "重新預約"}
          </Link>
        )}
      </div>

      {isNew && !planOf(biz.plan).removeBranding && (
        <p className="mt-8 border-t border-line pt-5 text-sm text-muted">
          你也是預約制的店嗎？
          <Link href={`/?ref=${biz.slug}`} className="font-medium text-brand underline underline-offset-4">
            免費開一個這樣的預約頁
          </Link>
        </p>
      )}
    </main>
  );
}
