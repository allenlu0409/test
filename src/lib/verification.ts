// 信箱驗證信：註冊時寄一次；之後未驗證的店家收到新預約時，再提醒一次（一天最多一封）。
import crypto from "node:crypto";
import { get, getMeta, run, setMeta } from "./db.ts";
import { sendMail } from "./mail.ts";

const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

function newToken(userId: number): string {
  const token = crypto.randomBytes(32).toString("base64url");
  run("DELETE FROM email_verifications WHERE user_id = ? OR expires_at < ?", userId, Date.now());
  run("INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (?, ?, ?)", sha(token), userId, Date.now() + 86400_000);
  return token;
}

/** 歡迎信＋確認連結（24 小時有效） */
export async function sendVerification(user: { id: number; email: string; name: string }, base: string): Promise<void> {
  await sendMail({
    to: user.email,
    subject: "歡迎使用約好｜請確認你的信箱",
    text: `${user.name} 你好，\n\n歡迎使用約好。請點下面的連結確認這是你的信箱，之後有新預約、客人取消時我們才會寄通知給你：\n${base}/verify/${newToken(user.id)}\n\n連結 24 小時內有效。如果不是你本人註冊，請忽略這封信。`,
  });
}

/**
 * 店家還沒確認信箱就收到預約：不能把預約內容寄到沒驗證過的信箱（可能是別人的），
 * 但可以再寄一次確認信，告訴他有預約在等。同一個帳號一天最多一封。
 */
export async function nudgeUnverifiedOwner(ownerId: number, base: string, today: string): Promise<boolean> {
  const user = get<{ id: number; email: string; name: string; email_verified: number }>("SELECT id, email, name, email_verified FROM users WHERE id = ?", ownerId);
  if (!user || user.email_verified || getMeta(`verify-nudge:${user.id}`) === today) return false;
  setMeta(`verify-nudge:${user.id}`, today);
  await sendMail({
    to: user.email,
    subject: "有客人預約了！確認信箱後才收得到通知",
    text: `${user.name} 你好，\n\n你的預約頁剛剛收到新的預約。因為信箱還沒確認，我們沒辦法把預約內容寄給你。\n\n請先登入後台，再點這條連結確認信箱（24 小時內有效）：\n${base}/verify/${newToken(user.id)}\n\n現在就可以到後台查看這筆預約：${base}/dashboard\n\n如果不是你本人註冊，請忽略這封信。`,
  });
  return true;
}
