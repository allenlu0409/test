import { requireBusiness } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { all, BOOKING_JOIN, type BookingRow } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { fmtTime } from "@/lib/time";

const STATUS: Record<string, string> = { confirmed: "已確認", completed: "已完成", cancelled: "已取消", no_show: "未到" };

/** 近 12 個月的預約明細，給店家對帳或報稅用 */
export async function GET() {
  const { biz } = await requireBusiness();
  if (!planOf(biz.plan).csvExport) return new Response("此功能需要專業版", { status: 403 });

  const rows = all<BookingRow>(`${BOOKING_JOIN} WHERE b.business_id = ? AND b.date >= date('now', '-365 days') ORDER BY b.date, b.start_min`, biz.id);
  return csvResponse(
    `bookings-${biz.slug}.csv`,
    ["日期", "開始", "結束", "顧客", "手機", "服務", "服務人員", "金額", "狀態", "來源", "備註"],
    rows.map((b) => [b.date, fmtTime(b.start_min), fmtTime(b.end_min), b.customer_name, b.customer_phone, b.service_name, b.staff_name, b.price, STATUS[b.status] ?? b.status, b.source === "online" ? "線上" : "手動", b.note]),
  );
}
