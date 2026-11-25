import crypto from "node:crypto";
import Link from "next/link";
import { ActionForm, type FormState } from "@/components/form";
import { currentUser, destroyOtherSessions } from "@/lib/auth";
import { get, run, tx } from "@/lib/db";

export const metadata = { title: "確認信箱", robots: { index: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";

const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const lookup = (token: string) => get<{ user_id: number }>("SELECT user_id FROM email_verifications WHERE token_hash = ? AND expires_at > ?", sha(token), Date.now());

/**
 * 只有「已登入、而且就是這個帳號」的人按下按鈕才算驗證。
 * 打開連結本身不會生效：郵件安全掃描器會預先抓取信裡的連結，
 * 如果 GET 就生效，等於替搶先用別人信箱註冊的人完成驗證。
 */
async function confirm(_: FormState, data: FormData): Promise<FormState> {
  "use server";
  const user = await currentUser();
  const row = lookup(String(data.get("token") ?? ""));
  if (!row) return { error: "這個連結已經失效，請到後台上方的提示列重新寄一封" };
  if (!user || user.id !== row.user_id) return { error: "請先用這個信箱的帳號登入，再回來按一次" };
  tx(() => {
    run("UPDATE users SET email_verified = 1 WHERE id = ?", row.user_id);
    run("DELETE FROM email_verifications WHERE user_id = ?", row.user_id);
  });
  await destroyOtherSessions(row.user_id);
  return { ok: "信箱確認好了。之後有新預約、客人取消或帳務通知，都會寄到這個信箱。" };
}

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = lookup(token);
  const user = await currentUser();

  if (!row) {
    return (
      <>
        <h1 className="text-2xl">這個連結已經失效</h1>
        <p className="mt-2 text-sm text-muted">連結可能已經用過或超過 24 小時。登入後台後，可以在上方的提示列重新寄一封。</p>
        <Link href="/dashboard" className="btn btn-primary mt-6 w-full py-3">
          前往後台
        </Link>
      </>
    );
  }
  if (!user || user.id !== row.user_id) {
    return (
      <>
        <h1 className="text-2xl">請先登入</h1>
        <p className="mt-2 text-sm text-muted">為了確認是帳號本人，請先用這個信箱的帳號登入，再重新打開信裡的連結。忘記密碼的話，用登入頁的「忘記密碼」重設也會一併完成確認。</p>
        <Link href="/login" className="btn btn-primary mt-6 w-full py-3">
          前往登入
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl">確認你的信箱</h1>
      <p className="mt-2 text-sm text-muted">
        按下按鈕，確認 <span className="font-medium text-ink">{user.email}</span> 是你的信箱。
      </p>
      <ActionForm action={confirm} submit="確認這是我的信箱" submitClass="btn btn-primary mt-6 w-full py-3">
        <input type="hidden" name="token" value={token} />
      </ActionForm>
      <Link href="/dashboard" className="mt-4 inline-block text-sm text-muted underline underline-offset-4 hover:text-ink">
        回後台
      </Link>
    </>
  );
}
