import Link from "next/link";
import { ActionForm } from "@/components/form";
import { requireBusiness } from "@/lib/auth";
import { all } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { fmtMoney } from "@/lib/time";
import { deleteCustomer, saveCustomerNote } from "../actions";

interface Row {
  id: number;
  name: string;
  phone: string;
  email: string;
  note: string;
  visits: number;
  spent: number | null;
  last_visit: string | null;
  missed: number;
  total: number;
  locked: number;
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { biz } = await requireBusiness();
  const q = ((await searchParams).q ?? "").trim().slice(0, 40);
  const like = `%${q.replace(/[%_]/g, "")}%`;
  // 電話可能被輸入成 0955-111-222，比對時只看數字
  const digits = q.replace(/\D/g, "");
  const phoneLike = digits.length >= 3 ? `%${digits}%` : like;
  const rows = all<Row>(
    `SELECT c.id, c.name, c.phone, c.email, c.note,
            COUNT(CASE WHEN b.status = 'completed' THEN 1 END) AS visits,
            SUM(CASE WHEN b.status = 'completed' THEN b.price END) AS spent,
            MAX(CASE WHEN b.status = 'completed' THEN b.date END) AS last_visit,
            COUNT(CASE WHEN b.status = 'no_show' THEN 1 END) AS missed,
            COUNT(b.id) AS total, COALESCE(SUM(b.over_quota), 0) AS locked
     FROM customers c LEFT JOIN bookings b ON b.customer_id = c.id
     WHERE c.business_id = ? AND c.phone NOT LIKE 'deleted-%' AND c.phone NOT LIKE 'walkin-%' AND (c.name LIKE ? OR c.phone LIKE ?)
     GROUP BY c.id ORDER BY last_visit DESC NULLS LAST, c.id DESC LIMIT 300`,
    biz.id,
    like,
    phoneLike,
  );
  // 只在免費額度用完後才出現過的顧客：電話要升級後才顯示
  const finite = Number.isFinite(planOf(biz.plan).monthlyBookings);
  const hidden = (c: Row) => finite && c.total > 0 && c.locked === c.total;
  const canExport = planOf(biz.plan).csvExport;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">顧客</h1>
          <p className="mt-1 text-sm text-muted">客人預約時自動建立，以手機號碼辨識同一位客人。點一下可以寫備註。</p>
        </div>
        {canExport ? (
          <a href="/dashboard/customers/export" className="btn btn-ghost btn-sm">
            匯出 CSV
          </a>
        ) : (
          <Link href="/dashboard/billing" className="btn btn-ghost btn-sm">
            匯出 CSV（專業版）
          </Link>
        )}
      </div>

      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="搜尋姓名或手機" aria-label="搜尋顧客" className="input max-w-xs" />
        <button type="submit" className="btn btn-ghost">
          搜尋
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted">{q ? "找不到符合的顧客。" : "還沒有顧客。第一筆預約進來後就會出現在這裡。"}</p>
      ) : (
        <ul className="panel divide-y divide-line">
          {rows.map((c) => (
            <li key={c.id}>
              <details className="group">
                <summary className="grid list-none grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 px-5 py-3">
                  <span className="min-w-0">
                    <span className="font-medium">{c.name}</span>
                    {c.missed > 0 && <span className="badge ml-2 bg-sun-soft text-note">未到 {c.missed} 次</span>}
                  </span>
                  <span className="tnum text-right text-sm font-semibold">{fmtMoney(c.spent ?? 0)}</span>
                  <span className="tnum min-w-0 truncate text-sm text-muted">
                    {hidden(c) ? "升級後顯示電話" : c.phone}・來店 {c.visits} 次・{c.last_visit ? `上次 ${c.last_visit.slice(5).replace("-", "/")}` : "尚未來店"}
                  </span>
                  <span className="text-right text-sm text-brand group-open:hidden">{c.note ? "看備註" : "寫備註"}</span>
                </summary>
                <ActionForm action={saveCustomerNote} submit="儲存備註" submitClass="btn btn-ghost btn-sm mt-2" className="border-t border-line bg-paper/60 px-5 py-4">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="label" htmlFor={`note-${c.id}`}>
                    顧客備註{c.email && <span className="ml-2 font-normal text-muted">{c.email}</span>}
                  </label>
                  <textarea id={`note-${c.id}`} name="note" rows={2} maxLength={500} defaultValue={c.note} placeholder="例如：頭皮敏感、習慣冷色系、不愛聊天" className="input" />
                </ActionForm>
                <ActionForm action={deleteCustomer} submit="刪除這位顧客的個人資料" submitClass="text-sm text-danger hover:underline" confirmText="確定刪除？此動作無法復原" className="border-t border-line bg-paper/60 px-5 py-3">
                  <input type="hidden" name="id" value={c.id} />
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
