import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/form";
import { currentUser } from "@/lib/auth";
import { signup } from "@/app/actions/auth";

export const metadata = { title: "免費註冊" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const ref = ((await searchParams).ref ?? "").slice(0, 30);
  if (await currentUser()) redirect("/dashboard");
  return (
    <>
      <h1 className="text-2xl font-bold">建立帳號</h1>
      <p className="mt-1 text-sm text-muted">免綁卡，下一步就能開好預約頁。</p>
      <ActionForm action={signup} className="mt-6 space-y-4" submit="建立帳號" submitClass="btn btn-primary w-full py-3">
        <input type="hidden" name="ref" value={ref} />
        <div>
          <label className="label" htmlFor="name">
            你的稱呼
          </label>
          <input id="name" name="name" autoComplete="name" required maxLength={40} placeholder="例如：Mia" className="input" />
          <p className="hint">會顯示為預約頁上的第一位服務人員，之後可以改。</p>
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            密碼
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
          <p className="hint">至少 8 個字元。</p>
        </div>
      </ActionForm>
      <p className="mt-4 text-center text-xs text-muted">
        註冊即表示同意{" "}
        <Link href="/terms" className="underline">
          服務條款
        </Link>{" "}
        與{" "}
        <Link href="/privacy" className="underline">
          隱私權政策
        </Link>
      </p>
      <p className="mt-6 text-center text-sm text-muted">
        已經有帳號？{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          登入
        </Link>
      </p>
    </>
  );
}
