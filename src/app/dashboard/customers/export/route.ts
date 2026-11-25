import { requireBusiness } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { all } from "@/lib/db";
import { planOf } from "@/lib/plans";

export async function GET() {
  const { biz } = await requireBusiness();
  if (!planOf(biz.plan).csvExport) return new Response("此功能需要專業版", { status: 403 });

  const rows = all<Record<string, unknown>>(
    `SELECT c.name, c.phone, c.email, c.note,
            COUNT(CASE WHEN b.status = 'completed' THEN 1 END) AS visits,
            COALESCE(SUM(CASE WHEN b.status = 'completed' THEN b.price END), 0) AS spent,
            COALESCE(MAX(CASE WHEN b.status = 'completed' THEN b.date END), '') AS last_visit
     FROM customers c LEFT JOIN bookings b ON b.customer_id = c.id
     WHERE c.business_id = ? AND c.phone NOT LIKE 'deleted-%' GROUP BY c.id ORDER BY c.id`,
    biz.id,
  );
  return csvResponse(
    `customers-${biz.slug}.csv`,
    ["姓名", "手機", "Email", "備註", "來店次數", "累計消費", "上次來店"],
    rows.map((r) => [r.name, r.phone, r.email, r.note, r.visits, r.spent, r.last_visit]),
  );
}
