import crypto from "node:crypto";
import Link from "next/link";
import { get, run, tx } from "@/lib/db";

export const metadata = { title: "確認信箱", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const hash = crypto.createHash("sha256").update((await params).token).digest("hex");
  const row = get<{ user_id: number }>("SELECT user_id FROM email_verifications WHERE token_hash = ? AND expires_at > ?", hash, Date.now());
  if (row) {
    tx(() => {
      run("UPDATE users SET email_verified = 1 WHERE id = ?", row.user_id);
      run("DELETE FROM email_verifications WHERE user_id = ?", row.user_id);
    });
  }
  return (
    <>
      <h1 className="text-2xl">{row ? "信箱確認好了" : "這個連結已經失效"}</h1>
      <p className="mt-2 text-sm text-muted">
        {row ? "之後有新預約、客人取消或帳務通知，都會寄到這個信箱。" : "連結可能已經用過或超過 24 小時。登入後台後，可以在上方的提示列重新寄一封。"}
      </p>
      <Link href="/dashboard" className="btn btn-primary mt-6 w-full py-3">
        前往後台
      </Link>
    </>
  );
}
