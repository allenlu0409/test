// CSV 輸出共用工具。
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  // 防止 Excel 把開頭為 = + - @ 的內容當公式執行（純數字的電話號碼如 +886… 除外）
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?\d+$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** 產生可直接用 Excel 開啟的 CSV 回應（含 BOM，中文不會亂碼） */
export function csvResponse(filename: string, header: string[], rows: unknown[][]): Response {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
