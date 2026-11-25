import Link from "next/link";
import { ActionForm } from "@/components/form";
import { Logo } from "@/components/brand";
import { monthlyRecurringRevenue } from "@/lib/billing";
import { all, get } from "@/lib/db";
import { dbStats } from "@/lib/maintenance";
import { PLANS, PLAN_ORDER, planOf } from "@/lib/plans";
import { DEMO_EMAIL } from "@/lib/seed";
import { fmtMoney } from "@/lib/time";
import { requireAdmin } from "@/lib/auth";
import { backupNow, setPlanManually, setSuspended } from "./actions";

export const metadata = { title: "營運後台", robots: { index: false } };
export const dynamic = "force-dynamic";

interface Row {
  id: number;
  name: string;
  slug: string;
  plan: string;
  suspended: number;
  billing_provider: string | null;
  created_at: string;
  email: string;
  bookings30: number;
  customers: number;
}

const mb = (n: number) => `${(n / 1048576).toFixed(n < 10485760 ? 2 : 1)} MB`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = ((await searchParams).q ?? "").trim().slice(0, 40);
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const rows = all<Row>(
    `SELECT b.id, b.name, b.slug, b.plan, b.suspended, b.billing_provider, b.created_at, u.email,
            (SELECT COUNT(*) FROM bookings k WHERE k.business_id = b.id AND k.created_at >= datetime('now', '-30 days')) AS bookings30,
            (SELECT COUNT(*) FROM customers c WHERE c.business_id = b.id) AS customers
     FROM businesses b JOIN users u ON u.id = b.owner_id
     WHERE u.email != ? AND (b.name LIKE ? OR b.slug LIKE ? OR u.email LIKE ?)
     ORDER BY b.id DESC LIMIT 200`,
    DEMO_EMAIL,
    like,
    like,
    like,
  );
  const totals = get<{ shops: number; paid: number; week: number; active: number }>(
    `SELECT COUNT(*) AS shops,
            COUNT(CASE WHEN b.plan != 'free' THEN 1 END) AS paid,
            COUNT(CASE WHEN b.created_at >= datetime('now', '-7 days') THEN 1 END) AS week,
            COUNT(CASE WHEN EXISTS (SELECT 1 FROM bookings k WHERE k.business_id = b.id AND k.created_at >= datetime('now', '-30 days')) THEN 1 END) AS active
     FROM businesses b JOIN users u ON u.id = b.owner_id WHERE u.email != ?`,
    DEMO_EMAIL,
  )!;
  const mrr = monthlyRecurringRevenue(Object.fromEntries(PLAN_ORDER.map((p) => [p, PLANS[p].price])), DEMO_EMAIL);
  const collected = get<{ n: number | null }>("SELECT SUM(amount) AS n FROM payments WHERE status = 'paid' AND created_at >= datetime('now', '-30 days')")!.n ?? 0;
  const mailFails = get<{ n: number }>("SELECT COUNT(*) AS n FROM mail_log WHERE status LIKE 'failed%' AND created_at >= datetime('now', '-7 days')")!.n;
  const payments = all<{ name: string; plan: string; amount: number; status: string; provider: string; created_at: string }>(
    "SELECT b.name, p.plan, p.amount, p.status, p.provider, p.created_at FROM payments p JOIN businesses b ON b.id = p.business_id ORDER BY p.id DESC LIMIT 10",
  );
  const audits = all<{ actor: string; action: string; detail: string; created_at: string }>("SELECT actor, action, detail, created_at FROM audit_log ORDER BY id DESC LIMIT 12");
  const stats = dbStats();
  const conversion = totals.shops ? Math.round((totals.paid / totals.shops) * 100) : 0;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo href="/admin" />
          <span className="badge bg-ink text-white">營運後台</span>
        </div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
          回我的店家後台
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="每月經常性收入（MRR）" value={fmtMoney(mrr)} sub={`近 30 天實收 ${fmtMoney(collected)}`} />
        <Stat label="店家數" value={`${totals.shops}`} sub={`近 7 天新增 ${totals.week}`} />
        <Stat label="付費店家" value={`${totals.paid}`} sub={`付費轉換率 ${conversion}%`} />
        <Stat label="近 30 天有預約的店家" value={`${totals.active}`} sub={mailFails ? `近 7 天寄信失敗 ${mailFails} 封` : "寄信正常"} />
      </div>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="font-bold">店家</h2>
          <form className="flex gap-2" role="search">
            <input name="q" defaultValue={q} placeholder="搜尋店名、代稱或 Email" aria-label="搜尋店家" className="input w-64" />
            <button type="submit" className="btn btn-ghost btn-sm">
              搜尋
            </button>
          </form>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((r) => (
            <li key={r.id}>
              <details className="group">
                <summary className="flex list-none flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3">
                  <span className="min-w-48 flex-1">
                    <span className="font-medium">{r.name}</span>
                    {r.suspended ? <span className="badge ml-2 bg-danger-soft text-danger">已停權</span> : null}
                    <span className="block text-sm text-muted">
                      /b/{r.slug}・{r.email}
                    </span>
                  </span>
                  <span className={`badge ${r.plan === "free" ? "bg-ink/8 text-muted" : "bg-brand-soft text-brand-dark"}`}>
                    {planOf(r.plan).name}
                    {r.billing_provider ? `・${r.billing_provider}` : ""}
                  </span>
                  <span className="tnum w-28 text-right text-sm text-muted">30 天 {r.bookings30} 筆</span>
                  <span className="tnum w-24 text-right text-sm text-muted">顧客 {r.customers}</span>
                  <span className="tnum w-24 text-right text-sm text-muted">{r.created_at.slice(0, 10)}</span>
                </summary>
                <div className="flex flex-wrap items-end gap-6 border-t border-line bg-paper/60 px-5 py-4">
                  <ActionForm action={setPlanManually} submit="調整方案" submitClass="btn btn-ghost btn-sm" className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <div>
                      <label className="label" htmlFor={`plan-${r.id}`}>
                        手動方案
                      </label>
                      <select id={`plan-${r.id}`} name="plan" defaultValue={r.plan} className="input w-32">
                        {PLAN_ORDER.map((p) => (
                          <option key={p} value={p}>
                            {PLANS[p].name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor={`reason-${r.id}`}>
                        原因（留存稽核）
                      </label>
                      <input id={`reason-${r.id}`} name="reason" required maxLength={200} className="input w-64" />
                    </div>
                  </ActionForm>
                  <ActionForm action={setSuspended} submit={r.suspended ? "解除停權" : "停權（暫停線上預約）"} submitClass="btn btn-danger btn-sm" confirmText="確定？">
                    <input type="hidden" name="id" value={r.id} />
                  </ActionForm>
                  <Link href={`/b/${r.slug}`} target="_blank" className="btn btn-ghost btn-sm">
                    看預約頁
                  </Link>
                </div>
              </details>
            </li>
          ))}
          {rows.length === 0 && <li className="p-8 text-center text-sm text-muted">沒有符合的店家。</li>}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-bold">最近收款</h2>
          {payments.length === 0 ? (
            <p className="mt-3 text-sm text-muted">還沒有收款紀錄。</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {p.name}・{planOf(p.plan).name}・{p.provider}
                  </span>
                  <span className={`tnum font-semibold ${p.status === "paid" ? "" : "text-danger"}`}>
                    {p.status === "paid" ? fmtMoney(p.amount) : "扣款失敗"}
                    <span className="ml-2 font-normal text-muted">{p.created_at.slice(5, 10)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">資料庫與備份</h2>
            <ActionForm action={backupNow} submit="立即備份" submitClass="btn btn-ghost btn-sm" inline />
          </div>
          <dl className="tnum mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">資料庫大小</dt>
            <dd>{mb(stats.sizeBytes)}</dd>
            <dt className="text-muted">預約／顧客／登入中</dt>
            <dd>
              {stats.rows.bookings}／{stats.rows.customers}／{stats.rows.sessions}
            </dd>
            <dt className="text-muted">備份</dt>
            <dd>
              {stats.backups.length ? `${stats.backups.length} 份，最新 ${stats.backups[0].name.slice(7, 17)}（${mb(stats.backups[0].sizeBytes)}）` : "尚未產生（每天自動備份一次）"}
            </dd>
          </dl>
        </section>
      </div>

      <section className="panel p-5">
        <h2 className="font-bold">管理操作紀錄</h2>
        {audits.length === 0 ? (
          <p className="mt-3 text-sm text-muted">還沒有紀錄。</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {audits.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-4 py-2">
                <span className="tnum text-muted">{a.created_at.slice(0, 16)}</span>
                <span className="font-medium">{a.action}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{a.detail}</span>
                <span className="text-muted">{a.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
