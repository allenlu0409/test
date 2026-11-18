import { requireBusiness } from "@/lib/auth";
import { all } from "@/lib/db";
import { planOf } from "@/lib/plans";

function cell(v: unknown): string {
  let s = String(v ?? "");
  // 防止 Excel 把開頭為 = + - @ 的內容當公式執行
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET() {
  const { biz } = await requireBusiness();
  if (!planOf(biz.plan).csvExport) return new Response("此功能需要專業版", { status: 403 });

  const rows = all<Record<string, unknown>>(
    `SELECT c.name, c.phone, c.email, c.note,
            COUNT(CASE WHEN b.status = 'completed' THEN 1 END) AS visits,
            COALESCE(SUM(CASE WHEN b.status = 'completed' THEN b.price END), 0) AS spent,
            COALESCE(MAX(CASE WHEN b.status = 'completed' THEN b.date END), '') AS last_visit
     FROM customers c LEFT JOIN bookings b ON b.customer_id = c.id
     WHERE c.business_id = ? GROUP BY c.id ORDER BY c.id`,
    biz.id,
  );
  const lines = [
    ["姓名", "手機", "Email", "備註", "來店次數", "累計消費", "上次來店"].map(cell).join(","),
    ...rows.map((r) => [r.name, r.phone, r.email, r.note, r.visits, r.spent, r.last_visit].map(cell).join(",")),
  ];
  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${biz.slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
