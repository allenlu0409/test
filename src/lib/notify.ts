// 預約相關通知：新預約、取消、前一天提醒。
import { all, get, run, BOOKING_JOIN, type BookingRow, type Business } from "./db.ts";
import { sendMail } from "./mail.ts";
import { planOf } from "./plans.ts";
import { appUrl } from "./stripe.ts";
import { addDays, fmtDateLong, fmtMoney, fmtTime, nowInTz } from "./time.ts";

interface Ctx {
  b: BookingRow;
  biz: Business;
  ownerEmail: string;
  customerEmail: string;
}

function load(bookingId: number): Ctx | null {
  const b = get<BookingRow>(`${BOOKING_JOIN} WHERE b.id = ?`, bookingId);
  if (!b) return null;
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", b.business_id)!;
  const ownerEmail = get<{ email: string }>("SELECT email FROM users WHERE id = ?", biz.owner_id)!.email;
  const customerEmail = get<{ email: string }>("SELECT email FROM customers WHERE id = ?", b.customer_id)!.email;
  return { b, biz, ownerEmail, customerEmail };
}

function when(b: BookingRow): string {
  return `${fmtDateLong(b.date)} ${fmtTime(b.start_min)}–${fmtTime(b.end_min)}`;
}

function details({ b, biz }: Ctx): string {
  return [
    `店家：${biz.name}`,
    `服務：${b.service_name}`,
    `時間：${when(b)}`,
    `服務人員：${b.staff_name}`,
    `費用：${b.price ? `${fmtMoney(b.price)}（現場付款）` : "免費"}`,
    biz.address && `地址：${biz.address}`,
    biz.phone && `店家電話：${biz.phone}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function manageLink(b: BookingRow): string {
  return `${appUrl()}/booking/${b.token}`;
}

export async function notifyBookingCreated(bookingId: number): Promise<void> {
  const c = load(bookingId);
  if (!c) return;
  const { b, biz } = c;
  const jobs: Promise<unknown>[] = [];
  if (b.source === "online") {
    jobs.push(
      sendMail({
        to: c.ownerEmail,
        subject: `新預約：${b.customer_name}｜${fmtDateLong(b.date)} ${fmtTime(b.start_min)}`,
        text: `${b.customer_name}（${b.customer_phone}）剛剛預約了：\n\n服務：${b.service_name}\n時間：${when(b)}\n服務人員：${b.staff_name}${b.note ? `\n備註：${b.note}` : ""}\n\n到後台查看：${appUrl()}/dashboard/bookings`,
      }),
    );
  }
  if (c.customerEmail) {
    jobs.push(
      sendMail({
        to: c.customerEmail,
        subject: `預約成功｜${biz.name} ${fmtDateLong(b.date)} ${fmtTime(b.start_min)}`,
        text: `${b.customer_name} 你好，你的預約已經確認：\n\n${details(c)}${biz.notice ? `\n\n預約須知：${biz.notice}` : ""}\n\n查看或取消預約：${manageLink(b)}`,
      }),
    );
  }
  await Promise.allSettled(jobs);
}

export async function notifyCancelled(bookingId: number, by: "customer" | "merchant"): Promise<void> {
  const c = load(bookingId);
  if (!c) return;
  const { b, biz } = c;
  if (by === "customer") {
    await sendMail({
      to: c.ownerEmail,
      subject: `預約取消：${b.customer_name}｜${fmtDateLong(b.date)} ${fmtTime(b.start_min)}`,
      text: `${b.customer_name}（${b.customer_phone}）取消了預約，這個時段已重新開放：\n\n服務：${b.service_name}\n時間：${when(b)}\n服務人員：${b.staff_name}`,
    });
  } else if (c.customerEmail) {
    await sendMail({
      to: c.customerEmail,
      subject: `預約已取消｜${biz.name} ${fmtDateLong(b.date)} ${fmtTime(b.start_min)}`,
      text: `${b.customer_name} 你好，店家取消了你的預約：\n\n${details(c)}\n\n重新預約：${appUrl()}/b/${biz.slug}`,
    });
  }
}

export async function notifyRescheduled(bookingId: number): Promise<void> {
  const c = load(bookingId);
  if (!c?.customerEmail) return;
  await sendMail({
    to: c.customerEmail,
    subject: `預約時間已更改｜${c.biz.name} ${fmtDateLong(c.b.date)} ${fmtTime(c.b.start_min)}`,
    text: `${c.b.customer_name} 你好，店家調整了你的預約時間，新的時間如下：\n\n${details(c)}\n\n時間不方便嗎？可以在這裡取消後重新預約：${manageLink(c.b)}`,
  });
}

/**
 * 寄出「明天」的預約提醒（專業版以上、顧客有留 Email、尚未提醒過）。
 * 每間店依自己的時區，在前一天早上 9 點後寄出；可重複呼叫，不會重寄。
 */
export async function sendDueReminders(at: Date = new Date()): Promise<number> {
  let sent = 0;
  for (const biz of all<Business>("SELECT * FROM businesses WHERE plan != 'free'")) {
    if (!planOf(biz.plan).reminders) continue;
    const now = nowInTz(biz.timezone, at);
    if (now.minutes < 9 * 60) continue;
    const due = all<{ id: number }>(
      `SELECT b.id FROM bookings b JOIN customers c ON c.id = b.customer_id
       WHERE b.business_id = ? AND b.date = ? AND b.status = 'confirmed' AND b.reminded = 0 AND c.email != ''`,
      biz.id,
      addDays(now.date, 1),
    );
    for (const { id } of due) {
      // 先標記再寄，避免重複執行時重寄
      if (!run("UPDATE bookings SET reminded = 1 WHERE id = ? AND reminded = 0", id).changes) continue;
      const c = load(id);
      if (!c) continue;
      await sendMail({
        to: c.customerEmail,
        subject: `明天見｜${biz.name} ${fmtTime(c.b.start_min)} 的預約提醒`,
        text: `${c.b.customer_name} 你好，提醒你明天有預約：\n\n${details(c)}\n\n臨時有事嗎？請提早取消，把時段留給其他人：${manageLink(c.b)}`,
      });
      sent++;
    }
  }
  return sent;
}
