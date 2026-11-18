import Link from "next/link";
import { ActionForm } from "@/components/form";
import { requestPasswordReset } from "@/app/actions/auth";

export const metadata = { title: "忘記密碼" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">忘記密碼</h1>
      <p className="mt-1 text-sm text-muted">輸入註冊時的 Email，我們會寄一條重設密碼的連結給你。</p>
      <ActionForm action={requestPasswordReset} className="mt-6 space-y-4" submit="寄送重設連結" submitClass="btn btn-primary w-full py-3">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        想起來了？{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          回到登入
        </Link>
      </p>
    </>
  );
}
