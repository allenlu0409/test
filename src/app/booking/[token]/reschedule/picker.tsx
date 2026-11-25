"use client";

import { useState, useTransition } from "react";
import { DayStrip, SlotGrid, fmtSlot, useSlots, type Day } from "@/components/slot-picker";

export function ReschedulePicker({
  token,
  slug,
  serviceId,
  days,
  move,
}: {
  token: string;
  slug: string;
  serviceId: number;
  days: Day[];
  move: (token: string, date: string, start: number) => Promise<{ error: string }>;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pending, startTransition] = useTransition();
  const { slots, failed } = useSlots(date ? `/api/slots?slug=${encodeURIComponent(slug)}&service=${serviceId}&date=${date}&token=${encodeURIComponent(token)}` : null, reload);
  const day = days.find((d) => d.date === date);

  return (
    <div className="space-y-5">
      <div>
        <p className="label">新的日期</p>
        <DayStrip
          days={days}
          date={date}
          onPick={(d) => {
            setDate(d);
            setStart(null);
            setError(null);
          }}
        />
      </div>
      {date && (
        <div aria-live="polite">
          <SlotGrid slots={slots} failed={failed} start={start} onPick={setStart} />
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={!date || start == null || pending}
        className="btn w-full bg-(--bc) py-3 text-base text-(--bt) hover:opacity-90"
        onClick={() => {
          if (!date || start == null) return;
          setError(null);
          startTransition(async () => {
            const res = await move(token, date, start);
            if (res?.error) {
              setError(res.error);
              setStart(null);
              setReload((n) => n + 1);
            }
          });
        }}
      >
        {pending ? "處理中…" : day && start != null ? `改到 ${day.month}/${day.day}（${day.wd}）${fmtSlot(start)}` : "請先選日期與時間"}
      </button>
    </div>
  );
}
