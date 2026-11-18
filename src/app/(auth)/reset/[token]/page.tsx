import { ActionForm } from "@/components/form";
import { resetPassword } from "@/app/actions/auth";

export const metadata = { title: "設定新密碼", robots: { index: false }, referrer: "no-referrer" as const };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="text-2xl font-bold">設定新密碼</h1>
      <p className="mt-1 text-sm text-muted">設定完成後，其他裝置上的登入狀態會全部登出。</p>
      <ActionForm action={resetPassword} className="mt-6 space-y-4" submit="更新密碼並登入" submitClass="btn btn-primary w-full py-3">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">
            新密碼
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
          <p className="hint">至少 8 個字元。</p>
        </div>
      </ActionForm>
    </>
  );
}
