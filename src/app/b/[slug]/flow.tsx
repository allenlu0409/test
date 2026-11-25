"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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


const NUM = ["一", "二", "三"];

/** 預約本上的一段：明體編號與標題，做完的步驟收成一行摘要 */
function Step({ n, title, done, active, summary, onEdit, headRef, children }: { n: number; title: string; done: boolean; active: boolean; summary?: string; onEdit?: () => void; headRef: (el: HTMLHeadingElement | null) => void; children?: React.ReactNode }) {
  return (
    <section className={active || done ? "" : "text-muted"}>
      <header className="flex items-center gap-3 px-5 py-3.5">
        <span className={`font-display w-7 shrink-0 text-2xl leading-none ${done || active ? "text-(--bc)" : "text-muted/60"}`} aria-hidden="true">
          {NUM[n - 1]}
        </span>
        <div className="min-w-0 flex-1">
          <h2 ref={headRef} tabIndex={-1} className="font-display text-lg outline-none">
            <span className="sr-only">第 {n} 步：</span>
            {title}
          </h2>
          {done && summary && <p className="truncate text-sm text-muted">{summary}</p>}
        </div>
        {done && onEdit && (
          <button type="button" onClick={onEdit} className="-my-2 -mr-2 flex min-h-11 items-center px-3 text-sm font-medium text-(--bc) underline underline-offset-4">
            修改
          </button>
        )}
      </header>
      {children && <div className="border-t border-line px-5 pb-5 pt-4">{children}</div>}
    </section>
  );
}

export function BookingFlow({ slug, services, staff, days, notice }: { slug: string; services: Svc[]; staff: StaffOpt[]; days: Day[]; notice: string }) {
  const [step, setStep] = useState(1);
  const heads = useRef<(HTMLHeadingElement | null)[]>([]);
  const moved = useRef(false);

  // 每一步都記進瀏覽器的上一頁紀錄：客人按手機的返回鍵是回到上一步，而不是整頁離開、填的資料全失
  useEffect(() => {
    // 保留 history.state 原有的內容（Next.js 的路由狀態存在裡面），否則返回時會被當成換頁而整頁重載
    history.replaceState({ ...history.state, step: 1 }, "");
    const onPop = (e: PopStateEvent) => {
      moved.current = true;
      setStep(typeof e.state?.step === "number" ? e.state.step : 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = (n: number) => {
    moved.current = true;
    if (n > step) history.pushState({ ...history.state, step: n }, "");
    else history.replaceState({ ...history.state, step: n }, "");
    setStep(n);
  };
  // 換步驟後把焦點移到那一步的標題，鍵盤與螢幕閱讀器使用者才知道畫面換了
  useEffect(() => {
    if (moved.current) heads.current[step - 1]?.focus();
  }, [step]);
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
          go(2);
          setReload((n) => n + 1);
        }
      }
    });
  }


  return (
    <div className="divide-y divide-line border border-ink/70 bg-white">
      <Step n={1} title="選擇服務" done={step > 1} active={step === 1} headRef={(el) => void (heads.current[0] = el)} summary={service && `${service.name}・${service.duration}・${service.price}`} onEdit={() => go(1)}>
        {step === 1 && (
          <ul className="-mt-1 divide-y divide-line">
            {services.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setServiceId(s.id);
                    if (staff.find((x) => x.id === staffId)?.skips.includes(s.id)) setStaffId(null);
                    setStart(null);
                    go(2);
                  }}
                  className="group block w-full py-3.5 text-left"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="font-semibold group-hover:text-(--bc)">{s.name}</span>
                    <span className="leader" aria-hidden="true" />
                    <span className="tnum font-bold">{s.price}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    <span className="tnum">{s.duration}</span>
                    {s.description && `・${s.description}`}
                  </span>
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
        active={step === 2}
        headRef={(el) => void (heads.current[1] = el)}
        summary={day && start != null ? `${day.month}/${day.day}（${day.wd}）${fmt(start)}${staffId ? `・${staff.find((s) => s.id === staffId)?.name}` : ""}` : undefined}
        onEdit={() => go(2)}
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
                        className={`min-h-11 rounded-[3px] border px-4 text-sm font-medium ${on ? "border-(--bc) bg-(--bc) text-(--bt)" : "border-line hover:border-(--bc)"}`}
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
                    go(3);
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

      <Step n={3} title="填寫聯絡資料" done={false} active={step === 3} headRef={(el) => void (heads.current[2] = el)}>
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
              <p className="hint">填了會寄預約明細給你，前一天也會提醒；之後要改期或取消，信裡就有連結。</p>
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
