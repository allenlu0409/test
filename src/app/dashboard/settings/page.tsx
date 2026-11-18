import Link from "next/link";
import { ActionForm, CopyButton } from "@/components/form";
import { baseUrl, requireBusiness } from "@/lib/auth";
import { planOf } from "@/lib/plans";
import { saveSettings } from "../actions";
import { changePassword } from "@/app/actions/auth";
import { DEMO_EMAIL } from "@/lib/seed";

export default async function SettingsPage() {
  const { biz, user } = await requireBusiness();
  const plan = planOf(biz.plan);
  const publicUrl = `${await baseUrl()}/b/${biz.slug}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">店家設定</h1>

      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 className="font-bold">預約頁連結</h2>
          <p className="truncate text-sm text-muted">{publicUrl}</p>
        </div>
        <div className="flex gap-2">
          <CopyButton text={publicUrl} />
          <Link href={`/b/${biz.slug}`} target="_blank" className="btn btn-ghost btn-sm">
            開啟
          </Link>
        </div>
      </section>

      <ActionForm action={saveSettings} submit="儲存設定" className="panel grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">預約頁上顯示的資訊</h2>
        <div>
          <label className="label" htmlFor="name">
            店名
          </label>
          <input id="name" name="name" required maxLength={40} defaultValue={biz.name} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            聯絡電話
          </label>
          <input id="phone" name="phone" maxLength={30} defaultValue={biz.phone} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">
            地址
          </label>
          <input id="address" name="address" maxLength={100} defaultValue={biz.address} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            店家介紹
          </label>
          <textarea id="description" name="description" rows={3} maxLength={300} defaultValue={biz.description} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notice">
            預約須知
          </label>
          <textarea id="notice" name="notice" rows={2} maxLength={300} defaultValue={biz.notice} placeholder="例如：遲到 15 分鐘以上需重新預約；取消請於前一天告知" className="input" />
          <p className="hint">客人送出預約前會看到。</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="brand_color">
            品牌色 {!plan.removeBranding && <span className="badge ml-1 bg-sun-soft text-[#8a5a00]">專業版</span>}
          </label>
          <div className="flex items-center gap-3">
            <input id="brand_color" name="brand_color" type="color" defaultValue={biz.brand_color} disabled={!plan.removeBranding} className="h-10 w-16 rounded-lg border border-line bg-white p-1 disabled:opacity-50" />
            <p className="text-sm text-muted">
              {plan.removeBranding ? "預約頁的按鈕與重點色會使用這個顏色。" : (
                <>
                  升級後可自訂預約頁顏色並移除「約好」標示。{" "}
                  <Link href="/dashboard/billing" className="font-semibold text-brand hover:underline">
                    查看方案
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="sm:col-span-2" />
      </ActionForm>

      <section className="panel p-5">
        <h2 className="font-bold">帳號</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">登入 Email</dt>
          <dd>{user.email}</dd>
          <dt className="text-muted">預約頁代稱</dt>
          <dd>{biz.slug}（建立後無法變更，以免已分享的連結失效）</dd>
        </dl>
        {user.email !== DEMO_EMAIL && (
          <ActionForm action={changePassword} resetOnOk submit="更新密碼" submitClass="btn btn-ghost self-end" className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-5">
            <div className="min-w-40 flex-1">
              <label className="label" htmlFor="pw-current">
                目前的密碼
              </label>
              <input id="pw-current" name="current" type="password" autoComplete="current-password" required className="input" />
            </div>
            <div className="min-w-40 flex-1">
              <label className="label" htmlFor="pw-new">
                新密碼（至少 8 個字元）
              </label>
              <input id="pw-new" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
            </div>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
