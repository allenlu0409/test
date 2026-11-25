import { notFound } from "next/navigation";
import { all } from "@/lib/db";
import { appUrl } from "@/lib/stripe";

export const metadata = { title: "信件檢視（預覽環境）", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * 預覽與驗收用：列出系統產生的每一封信。
 * 只有明確設定 DEV_MAILBOX=1 時才存在；正式環境不要設（信裡有重設密碼連結）。
 * 接上 Resend 之後信件內文不再寫入資料庫，這一頁只會看到主旨。
 */
export default function DevMailbox() {
  if (process.env.DEV_MAILBOX !== "1") notFound();
  const mails = all<{ id: number; recipient: string; subject: string; body: string; status: string; created_at: string }>("SELECT * FROM mail_log ORDER BY id DESC LIMIT 100");
  const origin = appUrl();

  // 信裡的網址指向正式網域；在預覽環境改成相對路徑才點得開
  const linkify = (text: string) =>
    text.split(/(https?:\/\/\S+)/g).map((part, i) => {
      if (!/^https?:\/\//.test(part)) return part;
      const path = part.replace(/^https?:\/\/[^/]+/, "") || "/";
      const internal = part.startsWith(origin) || /\/(verify|reset|booking|dashboard|b|admin)\//.test(part) || path.startsWith("/dashboard");
      return (
        <a key={i} href={internal ? path : part} className="text-brand underline underline-offset-2 break-all">
          {part}
        </a>
      );
    });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl">信件檢視</h1>
      <p className="mt-1 text-sm text-muted">預覽環境沒有真的寄信。系統產生的每一封信都列在這裡，最新的在最上面，信裡的連結可以直接點。</p>
      {mails.length === 0 ? (
        <p className="panel mt-6 p-8 text-center text-sm text-muted">還沒有信件。註冊一個帳號或完成一筆預約後再回來看。</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {mails.map((m) => (
            <li key={m.id} className="panel">
              <details open={m.id === mails[0].id}>
                <summary className="flex list-none flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
                  <span className="min-w-0 flex-1 font-medium">{m.subject}</span>
                  <span className="text-sm text-muted">{m.recipient}</span>
                  <span className="tnum text-xs text-muted">{m.created_at.slice(5, 16)} UTC</span>
                </summary>
                <p className="whitespace-pre-wrap border-t border-line px-5 py-4 text-sm leading-relaxed">{linkify(m.body)}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
