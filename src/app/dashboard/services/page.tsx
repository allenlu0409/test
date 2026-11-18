import { ActionForm } from "@/components/form";
import { requireBusiness } from "@/lib/auth";
import { all, type Service } from "@/lib/db";
import { fmtDuration, fmtMoney } from "@/lib/time";
import { archiveService, saveService, toggleService } from "../actions";

function Fields({ s, prefix }: { s?: Service; prefix: string }) {
  return (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${prefix}-name`}>
          服務名稱
        </label>
        <input id={`${prefix}-name`} name="name" required maxLength={40} defaultValue={s?.name} placeholder="例如：洗剪" className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-duration`}>
          時長（分鐘）
        </label>
        <input id={`${prefix}-duration`} name="duration" type="number" required min={5} max={600} step={5} defaultValue={s?.duration_min ?? 60} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-price`}>
          價格（NT$）
        </label>
        <input id={`${prefix}-price`} name="price" type="number" required min={0} step={10} defaultValue={s?.price ?? 0} className="input" />
      </div>
      <div className="sm:col-span-4">
        <label className="label" htmlFor={`${prefix}-desc`}>
          說明（選填）
        </label>
        <input id={`${prefix}-desc`} name="description" maxLength={200} defaultValue={s?.description} placeholder="客人預約時會看到，例如包含哪些內容" className="input" />
      </div>
    </>
  );
}

export default async function ServicesPage() {
  const { biz } = await requireBusiness();
  const services = all<Service>("SELECT * FROM services WHERE business_id = ? AND archived = 0 ORDER BY id", biz.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">服務項目</h1>
        <p className="mt-1 text-sm text-muted">時長決定每筆預約會占用多久，系統據此計算可預約的空檔。</p>
      </div>

      <ul className="space-y-2.5">
        {services.map((s) => (
          <li key={s.id} className="panel">
            <details className="group">
              <summary className="flex list-none flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4">
                <span className="min-w-0 flex-1">
                  <span className={`font-semibold ${s.active ? "" : "text-muted line-through"}`}>{s.name}</span>
                  {!s.active && <span className="badge ml-2 bg-ink/8 text-muted">已下架</span>}
                  {s.description && <span className="block truncate text-sm text-muted">{s.description}</span>}
                </span>
                <span className="tnum text-sm text-muted">{fmtDuration(s.duration_min)}</span>
                <span className="tnum w-24 text-right font-semibold">{fmtMoney(s.price)}</span>
                <span className="text-sm font-medium text-brand group-open:hidden">編輯</span>
              </summary>
              <div className="border-t border-line p-5">
                <ActionForm action={saveService} submit="儲存" className="grid gap-4 sm:grid-cols-4">
                  <Fields s={s} prefix={`s${s.id}`} />
                  <div className="sm:col-span-4" />
                </ActionForm>
                <div className="mt-4 flex gap-2 border-t border-line pt-4">
                  <ActionForm action={toggleService} submit={s.active ? "暫時下架" : "重新上架"} submitClass="btn btn-ghost btn-sm">
                    <input type="hidden" name="id" value={s.id} />
                  </ActionForm>
                  <ActionForm action={archiveService} submit="刪除" submitClass="btn btn-danger btn-sm" confirmText="確定刪除？">
                    <input type="hidden" name="id" value={s.id} />
                  </ActionForm>
                </div>
              </div>
            </details>
          </li>
        ))}
        {services.length === 0 && <li className="panel p-8 text-center text-sm text-muted">還沒有服務項目，先在下方新增一個。</li>}
      </ul>

      <section className="panel p-5">
        <h2 className="font-bold">新增服務</h2>
        <ActionForm action={saveService} resetOnOk submit="新增" className="mt-4 grid gap-4 sm:grid-cols-4">
          <Fields prefix="new" />
          <div className="sm:col-span-4" />
        </ActionForm>
      </section>
    </div>
  );
}
