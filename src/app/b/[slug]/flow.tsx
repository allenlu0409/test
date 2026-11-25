"use client";

import { useEffect, useState, useTransition } from "react";
import { book } from "./actions";

interface Svc {
  id: number;
  name: string;
  description: string;
  duration: string;
  price: string;
}
interface Day {
  date: string;
  wd: string;
  day: number;
  month: number;
  off: boolean;
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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

export function BookingFlow({ slug, services, staff, days, notice }: { slug: string; services: Svc[]; staff: { id: number; name: string; title: string }[]; days: Day[]; notice: string }) {
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [slots, setSlots] = useState<number[] | null>(null);
  const [slotError, setSlotError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // 聯絡資料放在 state：回上一步改時間、或時段被搶走重選時，已填的內容不會消失
  const [contact, setContact] = useState({ name: "", phone: "", email: "", note: "" });
  const field = (k: keyof typeof contact) => ({ value: contact[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setContact((c) => ({ ...c, [k]: e.target.value })) });
  const [pending, startTransition] = useTransition();

  const service = services.find((s) => s.id === serviceId);
  const day = days.find((d) => d.date === date);

  useEffect(() => {
    if (!serviceId || !date) return;
    const ctrl = new AbortController();
    setSlots(null);
    setSlotError(false);
    fetch(`/api/slots?slug=${encodeURIComponent(slug)}&service=${serviceId}&date=${date}${staffId ? `&staff=${staffId}` : ""}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j: { slots: number[] }) => setSlots(j.slots))
      .catch((e) => {
        if (e?.name !== "AbortError") setSlotError(true);
      });
    return () => ctrl.abort();
  }, [slug, serviceId, staffId, date, reload]);

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

  const morning = slots?.filter((s) => s < 720) ?? [];
  const afternoon = slots?.filter((s) => s >= 720 && s < 1080) ?? [];
  const evening = slots?.filter((s) => s >= 1080) ?? [];

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
            {staff.length > 1 && (
              <div>
                <p className="label">指定服務人員</p>
                <div className="flex flex-wrap gap-2">
                  {[{ id: 0, name: "不指定", title: "" }, ...staff].map((s) => {
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
              <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-2">
                {days.map((d) => {
                  const on = d.date === date;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      disabled={d.off}
                      aria-pressed={on}
                      aria-label={`${d.month} 月 ${d.day} 日 週${d.wd}${d.off ? " 公休" : ""}`}
                      onClick={() => {
                        setDate(d.date);
                        setStart(null);
                      }}
                      className={`tnum w-14 shrink-0 rounded-xl border py-2 text-center ${
                        on ? "border-(--bc) bg-(--bc) text-(--bt)" : d.off ? "border-transparent text-muted/40" : "border-line hover:border-(--bc)"
                      }`}
                    >
                      <span className="block text-[11px] opacity-80">{d.day === 1 || d === days[0] ? `${d.month}月` : `週${d.wd}`}</span>
                      <span className="block text-lg font-bold leading-tight">{d.day}</span>
                      <span className="block text-[10px] opacity-70">{d.off ? "休" : d.day === 1 || d === days[0] ? `週${d.wd}` : " "}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {date && (
              <div aria-live="polite">
                {slotError ? (
                  <p className="text-sm text-danger">時段載入失敗，請檢查網路後重新選擇日期。</p>
                ) : slots === null ? (
                  <p className="text-sm text-muted">正在查詢空檔…</p>
                ) : slots.length === 0 ? (
                  <p className="rounded-xl bg-paper p-4 text-sm text-muted">這天已經沒有空檔了，換一天看看。</p>
                ) : (
                  <div className="space-y-3">
                    {(
                      [
                        ["上午", morning],
                        ["下午", afternoon],
                        ["晚上", evening],
                      ] as const
                    ).map(
                      ([label, list]) =>
                        list.length > 0 && (
                          <div key={label}>
                            <p className="mb-1.5 text-xs text-muted">{label}</p>
                            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                              {list.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  aria-pressed={start === s}
                                  onClick={() => {
                                    setStart(s);
                                    setError(null);
                                    setStep(3);
                                  }}
                                  className={`tnum rounded-lg border py-2 text-sm font-semibold ${start === s ? "border-(--bc) bg-(--bc) text-(--bt)" : "border-line hover:border-(--bc)"}`}
                                >
                                  {fmt(s)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ),
                    )}
                  </div>
                )}
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
