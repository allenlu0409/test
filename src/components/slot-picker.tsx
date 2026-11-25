"use client";

// 選日期與時段的共用元件：預約流程與「客人自己改期」都用這一份。
// 顏色取自外層設定的 --bc（品牌色）與 --bt（品牌色上的文字色）。
import { useEffect, useState } from "react";

export interface Day {
  date: string;
  /** 星期幾，0 = 週日 */
  wdn: number;
  wd: string;
  day: number;
  month: number;
  /** 公休或這位人員休假，不可選 */
  off: boolean;
}

export const fmtSlot = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 向時段 API 查空檔。url 為 null 時不查；reloadKey 改變時重查 */
export function useSlots(url: string | null, reloadKey = 0): { slots: number[] | null; failed: boolean } {
  const [slots, setSlots] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setSlots(null);
    setFailed(false);
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j: { slots: number[] }) => setSlots(j.slots))
      .catch((e) => {
        if (e?.name !== "AbortError") setFailed(true);
      });
    return () => ctrl.abort();
  }, [url, reloadKey]);
  return { slots, failed };
}

export function DayStrip({ days, date, onPick }: { days: Day[]; date: string | null; onPick: (date: string) => void }) {
  return (
    <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-2">
      {days.map((d, i) => {
        const on = d.date === date;
        const head = d.day === 1 || i === 0;
        return (
          <button
            key={d.date}
            type="button"
            disabled={d.off}
            aria-pressed={on}
            aria-label={`${d.month} 月 ${d.day} 日 週${d.wd}${d.off ? " 公休" : ""}`}
            onClick={() => onPick(d.date)}
            className={`tnum w-14 shrink-0 rounded-xl border py-2.5 text-center ${
              on ? "border-(--bc) bg-(--bc) text-(--bt)" : d.off ? "border-transparent text-muted/40" : "border-line hover:border-(--bc)"
            }`}
          >
            <span className="block text-xs opacity-80">{head ? `${d.month}月` : `週${d.wd}`}</span>
            <span className="block text-lg font-bold leading-tight">{d.day}</span>
            <span className="block text-[11px] opacity-70">{d.off ? "休" : head ? `週${d.wd}` : " "}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SlotGrid({ slots, failed, start, onPick }: { slots: number[] | null; failed: boolean; start: number | null; onPick: (start: number) => void }) {
  if (failed) return <p className="text-sm text-danger">時段載入失敗，請檢查網路後重新選擇日期。</p>;
  if (slots === null) return <p className="text-sm text-muted">正在查詢空檔…</p>;
  if (slots.length === 0) return <p className="rounded-xl bg-paper p-4 text-sm text-muted">這天已經沒有空檔了，換一天看看。</p>;
  const groups = [
    ["上午", slots.filter((s) => s < 720)],
    ["下午", slots.filter((s) => s >= 720 && s < 1080)],
    ["晚上", slots.filter((s) => s >= 1080)],
  ] as const;
  return (
    <div className="space-y-3">
      {groups.map(
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
                    onClick={() => onPick(s)}
                    className={`tnum min-h-11 rounded-lg border text-sm font-semibold ${start === s ? "border-(--bc) bg-(--bc) text-(--bt)" : "border-line hover:border-(--bc)"}`}
                  >
                    {fmtSlot(s)}
                  </button>
                ))}
              </div>
            </div>
          ),
      )}
    </div>
  );
}
