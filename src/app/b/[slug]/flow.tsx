"use client";

import { useState, useTransition } from "react";
import { DayStrip, SlotGrid, fmtSlot as fmt, useSlots, type Day } from "@/components/slot-picker";
import { book } from "./actions";

interface Svc {
  id: number;
  name: string;
  description: string;
  duration: string;
  price: string;
}
interface StaffOpt {
  id: number;
  name: string;
  title: string;
  /** 不提供的服務 id */
  skips: number[];
  /** 固定休假的星期 */
  off: number[];
}


function Step({ n, title, done, summary, onEdit, children }: { n: number; title: string; done: boolean; summary?: string; onEdit?: () => void; children?: React.ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-4">
        <span className={`tnum flex size-7 shrink-0 items-center justify-center rounded-[2px] text-sm font-bold ${done ? "bg-(--bc) text-(--bt)" : "bg-ink/8 text-ink"}`}>{done ? "✓" : n}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{title}</h2>
          {done && summary && <p className="truncate text-sm text-muted">{summary}</p>}
        </div>
        {done && onEdit && (
          <button type="button" onClick={onEdit} className="text-sm font-medium text-(--bc) hover:underline">
            修改
          </button>
        )}
      </header>
      {children && <div className="border-t border-line p-5">{children}</div>}
    </section>
  );
}

export function BookingFlow({ slug, services, staff, days, notice }: { slug: string; services: Svc[]; staff: StaffOpt[]; days: Day[]; notice: string }) {
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // 聯絡資料放在 state：回上一步改時間、或時段被搶走重選時，已填的內容不會消失
  const [contact, setContact] = useState({ name: "", phone: "", email: "", note: "" });
  const field = (k: keyof typeof contact) => ({ value: contact[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setContact((c) => ({ ...c, [k]: e.target.value })) });
  const [pending, startTransition] = useTransition();

  const service = services.find((s) => s.id === serviceId);
  // 只列出會做這項服務的人
  const team = staff.filter((s) => !serviceId || !s.skips.includes(serviceId));
  const chosen = team.find((s) => s.id === staffId);
  const day = days.find((d) => d.date === date);

  const { slots, failed } = useSlots(
    serviceId && date ? `/api/slots?slug=${encodeURIComponent(slug)}&service=${serviceId}&date=${date}${staffId ? `&staff=${staffId}` : ""}` : null,
    reload,
  );
  // 指定的人員固定休假的日子，在日期列上標成不可選
  const shownDays = chosen ? days.map((d) => (chosen.off.includes(d.wdn) ? { ...d, off: true } : d)) : days;

  function submit(form: HTMLFormElement) {
    if (!serviceId || !date || start == null) return;
    const f = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await book({
        slug,
        serviceId,
        staffId,
        date,
        start,
        ...contact,
        website: String(f.get("website") ?? ""),
      });
      if (res?.error) {
        setError(res.error);
        // 時段被搶走時回到選時間並重新載入空檔
        if (res.error.includes("時段")) {
          setStart(null);
          setStep(2);
          setReload((n) => n + 1);
        }
      }
    });
  }


  return (
    <div className="space-y-3">
      <Step n={1} title="選擇服務" done={step > 1} summary={service && `${service.name}・${service.duration}・${service.price}`} onEdit={() => setStep(1)}>
        {step === 1 && (
          <ul className="space-y-2">
            {services.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setServiceId(s.id);
                    if (staff.find((x) => x.id === staffId)?.skips.includes(s.id)) setStaffId(null);
                    setStart(null);
                    setStep(2);
                  }}
                  className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors hover:border-(--bc) ${serviceId === s.id ? "border-(--bc) bg-paper" : "border-line"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.name}</span>
                    {s.description && <span className="block text-sm text-muted">{s.description}</span>}
                    <span className="tnum mt-0.5 block text-sm text-muted">{s.duration}</span>
                  </span>
                  <span className="tnum shrink-0 font-bold">{s.price}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step
        n={2}
        title="選擇時間"
        done={step > 2}
        summary={day && start != null ? `${day.month}/${day.day}（${day.wd}）${fmt(start)}${staffId ? `・${staff.find((s) => s.id === staffId)?.name}` : ""}` : undefined}
        onEdit={() => setStep(2)}
      >
        {step === 2 && (
          <div className="space-y-5">
            {team.length > 1 && (
              <div>
                <p className="label">指定服務人員</p>
                <div className="flex flex-wrap gap-2">
                  {[{ id: 0, name: "不指定", title: "" }, ...team].map((s) => {
                    const on = (staffId ?? 0) === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setStaffId(s.id || null);
                          setStart(null);
                        }}
                        className={`rounded-[3px] border px-4 py-1.5 text-sm font-medium ${on ? "border-(--bc) bg-(--bc) text-(--bt)" : "border-line hover:border-(--bc)"}`}
                      >
                        {s.name}
                        {s.title && <span className="ml-1.5 text-xs opacity-75">{s.title}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="label">日期</p>
              <DayStrip
                days={shownDays}
                date={date}
                onPick={(d) => {
                  setDate(d);
                  setStart(null);
                }}
              />
            </div>

            {date && (
              <div aria-live="polite">
                <SlotGrid
                  slots={slots}
                  failed={failed}
                  start={start}
                  onPick={(s) => {
                    setStart(s);
                    setError(null);
                    setStep(3);
                  }}
                />
              </div>
            )}
            {error && step === 2 && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        )}
      </Step>

      <Step n={3} title="填寫聯絡資料" done={false}>
        {step === 3 && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(e.currentTarget);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="bk-name">
                  姓名
                </label>
                <input id="bk-name" name="name" {...field("name")} required maxLength={40} autoComplete="name" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="bk-phone">
                  手機
                </label>
                <input id="bk-phone" name="phone" type="tel" {...field("phone")} required inputMode="tel" autoComplete="tel" placeholder="0912345678" pattern="[0-9+\-\s\(\)]{8,20}" className="input" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="bk-email">
                Email（選填）
              </label>
              <input id="bk-email" name="email" type="email" {...field("email")} autoComplete="email" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="bk-note">
                想先讓店家知道的事（選填）
              </label>
              <textarea id="bk-note" name="note" {...field("note")} rows={2} maxLength={300} className="input" />
            </div>
            <div className="hidden" aria-hidden="true">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {notice && (
              <p className="rounded-xl bg-paper p-3.5 text-sm text-ink/80">
                <strong className="font-semibold">預約須知　</strong>
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <button type="submit" disabled={pending} className="btn w-full bg-(--bc) py-3 text-base text-(--bt) hover:opacity-90">
              {pending ? "預約中…" : "確認預約"}
            </button>
          </form>
        )}
      </Step>
    </div>
  );
}
