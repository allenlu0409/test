import Link from "next/link";
import { ActionForm } from "@/components/form";
import { requireBusiness } from "@/lib/auth";
import { all, type Service, type Staff } from "@/lib/db";
import { offWeekdays, serviceExclusions } from "@/lib/booking";
import { WEEKDAYS } from "@/lib/time";
import { planOf } from "@/lib/plans";
import { archiveStaff, saveStaff, toggleStaff } from "../actions";

export default async function StaffPage() {
  const { biz } = await requireBusiness();
  const staff = all<Staff>("SELECT * FROM staff WHERE business_id = ? AND archived = 0 ORDER BY id", biz.id);
  const services = all<Service>("SELECT * FROM services WHERE business_id = ? AND archived = 0 ORDER BY id", biz.id);
  const excluded = serviceExclusions(biz.id);
  const plan = planOf(biz.plan);
  const full = staff.length >= plan.maxStaff;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">服務人員</h1>
        <p className="mt-1 text-sm text-muted">
          每位人員有各自的行程，同一時段可以同時接不同客人。目前 {staff.length}
          {Number.isFinite(plan.maxStaff) ? ` / ${plan.maxStaff}` : ""} 位（{plan.name}）。
        </p>
      </div>

      <ul className="space-y-2.5">
        {staff.map((s) => (
          <li key={s.id} className="panel p-5">
            <ActionForm action={saveStaff} submit="儲存" submitClass="btn btn-ghost btn-sm self-end" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={s.id} />
              <div className="min-w-32 flex-1">
                <label className="label" htmlFor={`st${s.id}-name`}>
                  名稱 {!s.active && <span className="badge ml-1 bg-ink/8 text-muted">休假中</span>}
                </label>
                <input id={`st${s.id}-name`} name="name" required maxLength={30} defaultValue={s.name} className="input" />
              </div>
              <div className="min-w-32 flex-1">
                <label className="label" htmlFor={`st${s.id}-title`}>
                  職稱（選填）
                </label>
                <input id={`st${s.id}-title`} name="title" maxLength={40} defaultValue={s.title} className="input" />
              </div>
              <input type="hidden" name="settings" value="1" />
              <fieldset className="w-full">
                <legend className="label">提供的服務</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  {services.map((v) => (
                    <label key={v.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="svc" value={v.id} defaultChecked={!excluded.get(s.id)?.has(v.id)} className="size-4 accent-brand" />
                      {v.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="w-full">
                <legend className="label">每週固定休假</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                    <label key={wd} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="off" value={wd} defaultChecked={offWeekdays(s).includes(wd)} className="size-4 accent-brand" />
                      週{WEEKDAYS[wd]}
                    </label>
                  ))}
                </div>
                <p className="hint">店休日不用勾。勾選的日子客人約不到這位人員，你仍可以手動幫他排預約。</p>
              </fieldset>
            </ActionForm>
            <div className="mt-3 flex gap-2">
              <ActionForm action={toggleStaff} submit={s.active ? "設為休假（暫停接單）" : "恢復接單"} submitClass="btn btn-ghost btn-sm">
                <input type="hidden" name="id" value={s.id} />
              </ActionForm>
              {staff.length > 1 && (
                <ActionForm action={archiveStaff} submit="移除" submitClass="btn btn-danger btn-sm" confirmText="確定移除？" inline>
                  <input type="hidden" name="id" value={s.id} />
                </ActionForm>
              )}
            </div>
          </li>
        ))}
      </ul>

      {full ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sun-soft p-5">
          <div>
            <h2 className="font-bold">想再加一位夥伴？</h2>
            <p className="mt-1 text-sm text-[#6b4700]">
              {plan.name}最多 {plan.maxStaff} 位服務人員。升級後每位夥伴都有獨立行程，客人可以指定設計師。
            </p>
          </div>
          <Link href="/dashboard/billing" className="btn btn-dark">
            查看升級方案
          </Link>
        </section>
      ) : (
        <section className="panel p-5">
          <h2 className="font-bold">新增人員</h2>
          <ActionForm action={saveStaff} resetOnOk submit="新增" submitClass="btn btn-primary self-end" className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-32 flex-1">
              <label className="label" htmlFor="new-staff-name">
                名稱
              </label>
              <input id="new-staff-name" name="name" required maxLength={30} className="input" />
            </div>
            <div className="min-w-32 flex-1">
              <label className="label" htmlFor="new-staff-title">
                職稱（選填）
              </label>
              <input id="new-staff-title" name="title" maxLength={40} placeholder="例如：資深設計師" className="input" />
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
