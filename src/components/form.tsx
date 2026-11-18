"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";

export type FormState = { error?: string; ok?: string } | null;
export type FormAction = (prev: FormState, data: FormData) => Promise<FormState>;

/**
 * 統一的表單殼：呼叫 server action、顯示錯誤／成功訊息。
 * 自行攔截 submit，避免 React 在送出失敗後清空使用者已輸入的內容。
 */
export function ActionForm({
  action,
  children,
  className,
  submit,
  submitClass = "btn btn-primary",
  resetOnOk = false,
  confirmText,
  inline = false,
}: {
  action: FormAction;
  children?: React.ReactNode;
  className?: string;
  submit?: React.ReactNode;
  submitClass?: string;
  resetOnOk?: boolean;
  /** 送出前需要二次確認的操作（例如取消預約），按鈕會先變成「確定？」 */
  confirmText?: string;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmText && !armed) {
          setArmed(true);
          setTimeout(() => setArmed(false), 4000);
          return;
        }
        setArmed(false);
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      {submit != null && (
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "處理中…" : armed ? confirmText : submit}
        </button>
      )}
      {state?.error && (
        <p role="alert" className={`${inline ? "ml-2 inline" : "mt-3"} rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger`}>
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className={`${inline ? "ml-2 inline" : "mt-3"} text-sm font-medium text-brand`}>
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function CopyButton({ text, label = "複製連結" }: { text: string; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          if (ref.current) {
            ref.current.textContent = "已複製";
            setTimeout(() => ref.current && (ref.current.textContent = label), 1800);
          }
        } catch {
          window.prompt("請手動複製", text);
        }
      }}
    >
      {label}
    </button>
  );
}
