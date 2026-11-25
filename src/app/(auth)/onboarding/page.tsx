import { redirect } from "next/navigation";
import { ActionForm } from "@/components/form";
import { businessOf, currentUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/plans";
import { createBusiness } from "@/app/actions/auth";

export const metadata = { title: "開店設定" };

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (businessOf(user.id)) redirect("/dashboard");

  return (
    <>
      <p className="text-sm text-muted">{user.name}，歡迎。</p>
      <h1 className="mt-1 text-2xl">來開你的預約頁</h1>
      <p className="mt-1 text-sm text-muted">我們會依產業先幫你建好常見服務與營業時間，進後台都能再改。</p>
      <ActionForm action={createBusiness} className="mt-6 space-y-4" submit="開好預約頁" submitClass="btn btn-primary w-full py-3">
        <div>
          <label className="label" htmlFor="name">
            店名
          </label>
          <input id="name" name="name" required maxLength={40} placeholder="例如：木木髮藝" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="category">
            產業
          </label>
          <select id="category" name="category" required className="input" defaultValue="">
            <option value="" disabled>
              請選擇
            </option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="slug">
            預約頁網址
          </label>
          <div className="flex items-center overflow-hidden rounded-xl border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <span className="shrink-0 bg-paper px-3 py-2.5 text-sm text-muted">/b/</span>
            <input
              id="slug"
              name="slug"
              required
              pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]"
              title="3–30 個小寫英文、數字或連字號，不能以連字號開頭或結尾"
              placeholder="mumu-hair"
              autoCapitalize="none"
              className="w-full px-3 py-2.5 text-[15px] focus:outline-none"
            />
          </div>
          <p className="hint">3–30 個小寫英文、數字或連字號，例如店名的英文拼音。這是客人會看到的網址，<strong className="font-semibold text-ink">開好之後不能更改</strong>，請確認沒有打錯。</p>
        </div>
      </ActionForm>
    </>
  );
}
