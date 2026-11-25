// 預約相關通知：新預約、取消、前一天提醒。
import { all, get, run, BOOKING_JOIN, type BookingRow, type Business } from "./db.ts";
import { sendMail } from "./mail.ts";
import { planOf } from "./plans.ts";
import { monthlyOnlineCount } from "./booking.ts";
import { appUrl } from "./stripe.ts";
import { addDays, fmtDateLong, fmtMoney, fmtTime, nowInTz } from "./time.ts";

interface Ctx {
  b: BookingRow;
  biz: Business;
  /** 店家信箱；尚未驗證時為空字串（不寄信給沒驗證過的信箱，避免有人冒用他人信箱註冊後製造垃圾信） */
  ownerEmail: string;
  customerEmail: string;
}

function load(bookingId: number): Ctx | null {
  const b = get<BookingRow>(`${BOOKING_JOIN} WHERE b.id = ?`, bookingId);
  if (!b) return null;
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", b.business_id)!;
  const ownerEmail = ownerOf(biz.owner_id);
  const customerEmail = get<{ email: string }>("SELECT email FROM customers WHERE id = ?", b.customer_id)!.email;
  return { b, biz, ownerEmail, customerEmail };
}

function ownerOf(ownerId: number): string {
  const u = get<{ email: string; email_verified: number }>("SELECT email, email_verified FROM users WHERE id = ?", ownerId);
  return u?.email_verified ? u.email : "";
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
  if (b.source === "online" && c.ownerEmail) {
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
    if (!c.ownerEmail) return;
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

/** 帳務通知：付款成功、扣款失敗、方案到期降級 */
export async function notifyBilling(businessId: number, event: "paid" | "failed" | "expired", amount = 0): Promise<void> {
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", businessId);
  const to = biz && ownerOf(biz.owner_id);
  if (!biz || !to) return;
  const billing = `${appUrl()}/dashboard/billing`;
  const mail = {
    paid: {
      subject: `付款成功｜約好${planOf(biz.plan).name} ${fmtMoney(amount)}`,
      text: `${biz.name} 你好，\n\n已收到 ${fmtMoney(amount)}，${planOf(biz.plan).name}${biz.billing_cycle === "year" ? "（年繳）" : ""}使用中。\n下次扣款日與付款紀錄：${billing}\n\n謝謝你的支持。`,
    },
    failed: {
      subject: "信用卡扣款失敗｜請更新付款方式",
      text: `${biz.name} 你好，\n\n這一期的訂閱費用扣款沒有成功，常見原因是卡片過期、額度不足或被銀行擋下。\n\n付費功能會保留 3 天。請在期限內到這裡重新訂閱，就不會中斷：${billing}\n\n如果你已經處理好了，請忽略這封信。`,
    },
    expired: {
      subject: "你的方案已回到免費版",
      text: `${biz.name} 你好，\n\n訂閱已結束，店家現在是免費版：每月 30 筆線上預約、1 位服務人員。你的顧客與預約資料都完整保留。\n\n隨時可以重新訂閱：${billing}`,
    },
  }[event];
  await sendMail({ to, ...mail });
}

/**
 * 免費額度通知：用到八成與額滿時各通知店家一次（每月）。
 * 額滿代表客人已經約不進來，這封信要讓店家當下就知道。
 */
export async function notifyQuota(businessId: number): Promise<"near" | "full" | null> {
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", businessId);
  if (!biz) return null;
  const limit = planOf(biz.plan).monthlyBookings;
  if (!Number.isFinite(limit)) return null;
  const used = monthlyOnlineCount(biz);
  const level = used >= limit ? "full" : used >= limit * 0.8 ? "near" : null;
  if (!level) return null;
  const month = nowInTz(biz.timezone).date.slice(0, 7);
  const key = `${month}:${level}`;
  // 已通知過同級或更高級（full）就不再寄
  if (biz.quota_notified === key || biz.quota_notified === `${month}:full`) return null;
  run("UPDATE businesses SET quota_notified = ? WHERE id = ?", key, biz.id);
  const to = ownerOf(biz.owner_id);
  if (to) {
    await sendMail({
      to,
      subject: level === "full" ? "本月線上預約額度已滿，客人現在約不進來" : `本月線上預約已用 ${used} / ${limit} 筆`,
      text:
        level === "full"
          ? `${biz.name} 你好，\n\n免費版本月的 ${limit} 筆線上預約已經用完。到下個月 1 號之前，客人打開你的預約頁會看到「本月線上預約已額滿」。\n\n升級專業版後立即恢復，而且不限筆數：${appUrl()}/dashboard/billing\n\n這段期間你仍然可以在後台手動新增預約。`
          : `${biz.name} 你好，\n\n本月已收到 ${used} 筆線上預約，免費版上限是 ${limit} 筆。額滿後客人會暫時無法線上預約。\n\n生意不錯！升級專業版就不限筆數：${appUrl()}/dashboard/billing`,
    });
  }
  return level;
}
