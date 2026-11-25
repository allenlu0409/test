// 新店家引導信：開店後還沒收到第一筆線上預約的店家，在第 1、3、7 天各收到一封具體的下一步。
// 收到第一筆預約就不再寄。店家可在「店家設定」關閉。
import { all, run, type Business } from "./db.ts";
import { sendMail } from "./mail.ts";
import { appUrl } from "./stripe.ts";
import { nowInTz } from "./time.ts";

interface Step {
  /** 開店後滿幾天寄出 */
  afterDays: number;
  subject: string;
  body: (b: Business, link: string) => string;
}

export const DRIP: Step[] = [
  {
    afterDays: 1,
    subject: "預約頁開好了，下一步：把連結放到客人看得到的地方",
    body: (b, link) =>
      `${b.name} 你好，\n\n你的預約頁已經可以用了：\n${link}\n\n現在最重要的一件事，是讓客人看得到它。最快的做法：\n\n1. 打開 IG →「編輯個人檔案」→「連結」，貼上這條網址。\n2. 發一則限時動態：「之後預約請點個人檔案連結，可以直接選時間」。\n\n做完這兩步，通常當天就會有第一筆預約進來。`,
  },
  {
    afterDays: 3,
    subject: "還沒有客人從預約頁約進來？試試這三個地方",
    body: (b, link) =>
      `${b.name} 你好，\n\n預約頁開了三天，還沒有收到線上預約。客人不是不想用，多半是還不知道有這條連結。這三個地方最有效：\n\n・LINE：下次客人傳訊息問時間，直接回這條連結「這裡可以看到所有空檔」：\n  ${link}\n・櫃檯或鏡子旁：到後台「店家設定」下載 QR Code 印出來，客人結帳時順手約下一次。\n・Google 商家檔案：把預約連結填進「預約」欄位。\n\n也請確認價目和營業時間是對的：${appUrl()}/dashboard/services`,
  },
  {
    afterDays: 7,
    subject: "需要幫忙設定嗎？",
    body: (b, link) =>
      `${b.name} 你好，\n\n開店一週了，預約頁還沒有收到線上預約。如果是哪裡卡住了，直接回這封信告訴我們，我們幫你看。\n\n常見的原因：\n・連結還沒放到 IG 或 LINE（${link}）\n・服務項目或營業時間還是預設值，客人看了不確定\n・最晚要提前多久預約設得太長\n\n後台裡的「使用說明」有每一項的做法：${appUrl()}/dashboard/help\n\n這是最後一封引導信，之後不會再寄。`,
  },
];

/** 寄出到期的引導信；每間店每次最多一封，只在白天寄。回傳寄出的封數 */
export async function sendDripEmails(at: Date = new Date()): Promise<number> {
  const rows = all<Business & { email: string; age_days: number }>(
    `SELECT b.*, u.email, (julianday('now') - julianday(b.created_at)) AS age_days
     FROM businesses b JOIN users u ON u.id = b.owner_id
     WHERE b.drip_stage < ? AND b.tips_off = 0 AND b.suspended = 0 AND u.email_verified = 1 AND u.email NOT LIKE '%@yuehao.app'
       AND NOT EXISTS (SELECT 1 FROM bookings k WHERE k.business_id = b.id AND k.source = 'online')`,
    DRIP.length,
  );
  let sent = 0;
  for (const b of rows) {
    const hour = nowInTz(b.timezone, at).minutes / 60;
    if (hour < 10 || hour >= 20) continue;
    const step = DRIP[b.drip_stage];
    // 帳號是很久以前開的（例如功能上線前）就不補寄舊信
    if (b.age_days < step.afterDays || b.age_days > 30) continue;
    if (!run("UPDATE businesses SET drip_stage = ? WHERE id = ? AND drip_stage = ?", b.drip_stage + 1, b.id, b.drip_stage).changes) continue;
    await sendMail({
      to: b.email,
      subject: step.subject,
      text: `${step.body(b, `${appUrl()}/b/${b.slug}`)}\n\n— 約好\n不想收到這類引導信，可以在後台「店家設定」關閉。`,
    });
    sent++;
  }
  return sent;
}
