import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/form";
import { currentUser } from "@/lib/auth";
import { demoLogin, login } from "@/app/actions/auth";

export const metadata = { title: "登入" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  if (await currentUser()) redirect("/dashboard");
  const deleted = (await searchParams).deleted === "1";
  return (
    <>
      {deleted && <p role="status" className="mb-4 border border-ink/15 bg-paper p-3 text-sm">帳號與所有資料已刪除。謝謝你用過約好。</p>}
      <h1 className="text-2xl font-bold">登入後台</h1>
      <ActionForm action={login} className="mt-6 space-y-4" submit="登入" submitClass="btn btn-primary w-full py-3">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="password">
              密碼
            </label>
            <Link href="/forgot" className="text-sm text-muted hover:text-brand">
              忘記密碼？
            </Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
      </ActionForm>
      <form action={demoLogin} className="mt-3">
        <button type="submit" className="btn btn-ghost w-full py-3">
          免註冊，看示範後台
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        還沒有帳號？{" "}
        <Link href="/signup" className="font-semibold text-brand hover:underline">
          免費註冊
        </Link>
      </p>
    </>
  );
}
