"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-black">出了一點狀況</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">頁面暫時無法顯示，你的資料沒有受到影響。請再試一次；如果持續發生，請把下面的代碼提供給客服。</p>
      {error.digest && <p className="tnum mt-2 text-xs text-muted">錯誤代碼 {error.digest}</p>}
      <button type="button" onClick={reset} className="btn btn-primary mt-6">
        再試一次
      </button>
    </main>
  );
}
