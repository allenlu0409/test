import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/form";
import { currentUser } from "@/lib/auth";
import { demoLogin, login } from "@/app/actions/auth";

export const metadata = { title: "登入" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <>
      <h1 className="text-2xl font-bold">登入後台</h1>
      <ActionForm action={login} className="mt-6 space-y-4" submit="登入" submitClass="btn btn-primary w-full py-3">
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
