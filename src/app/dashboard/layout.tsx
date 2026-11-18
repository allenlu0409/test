import Link from "next/link";
import { Logo } from "@/components/brand";
import { requireBusiness } from "@/lib/auth";
import { planOf } from "@/lib/plans";
import { DEMO_EMAIL } from "@/lib/seed";
import { logout } from "@/app/actions/auth";
import { Nav } from "./nav";

export const metadata = { title: "後台", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, biz } = await requireBusiness();
  const plan = planOf(biz.plan);
  const isDemo = user.email === DEMO_EMAIL;

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-20 border-b border-line bg-white lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:px-5 lg:py-5">
          <Logo href="/dashboard" />
          <form action={logout} className="lg:hidden">
            <button type="submit" className="text-sm text-muted hover:text-ink">
              登出
            </button>
          </form>
        </div>
        <Nav />
        <div className="hidden px-5 py-5 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <p className="truncate text-sm font-semibold">{biz.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {plan.name}
            {biz.plan === "free" && (
              <>
                {" ・ "}
                <Link href="/dashboard/billing" className="font-semibold text-brand hover:underline">
                  升級
                </Link>
              </>
            )}
          </p>
          <form action={logout} className="mt-3">
            <button type="submit" className="text-sm text-muted hover:text-ink">
              登出
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        {isDemo && (
          <div className="bg-sun-soft px-4 py-2 text-center text-sm text-[#6b4700]">
            這是示範店家，資料為虛構且所有訪客共用。{" "}
            <Link href="/signup" className="font-semibold underline underline-offset-2">
              免費開自己的預約頁
            </Link>
          </div>
        )}
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
