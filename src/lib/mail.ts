// 寄信：設定 RESEND_API_KEY 時透過 Resend 寄出，否則只寫入 mail_log（開發與測試用）。
// 寄信失敗絕不影響主要流程（預約照樣成立）。
import { run } from "./db.ts";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export function mailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendMail(mail: Mail): Promise<boolean> {
  let status = "logged";
  if (mail.to.endsWith("@yuehao.app")) {
    status = "skipped"; // 示範帳號的信箱不存在
  } else if (mailEnabled()) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.MAIL_FROM || "約好 <onboarding@resend.dev>",
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
        signal: AbortSignal.timeout(8000),
      });
      status = res.ok ? "sent" : `failed:${res.status}`;
    } catch (e) {
      status = `failed:${e instanceof Error ? e.name : "error"}`;
    }
  } else if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    console.log(`[mail] → ${mail.to}｜${mail.subject}\n${mail.text}\n`);
  }
  try {
    run("INSERT INTO mail_log (recipient, subject, body, status) VALUES (?, ?, ?, ?)", mail.to, mail.subject, mailEnabled() ? "" : mail.text, status);
    run("DELETE FROM mail_log WHERE created_at < datetime('now', '-30 days')");
  } catch (e) {
    console.error("mail_log failed", e);
  }
  return !status.startsWith("failed");
}
