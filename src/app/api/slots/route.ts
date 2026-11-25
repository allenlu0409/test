import { get, type Business, type Service } from "@/lib/db";
import { availableSlots, quotaReached } from "@/lib/booking";
import { isDateStr } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const date = q.get("date");
  const biz = get<Business>("SELECT * FROM businesses WHERE slug = ?", q.get("slug") ?? "");
  if (!biz || !isDateStr(date)) return Response.json({ error: "bad request" }, { status: 400 });

  // 改期（帶管理碼）時，即使服務之後被下架也要能查
  const service = get<Service>(`SELECT * FROM services WHERE id = ? AND business_id = ? ${q.get("token") ? "" : "AND active = 1 AND archived = 0"}`, Number(q.get("service")), biz.id);
  if (!service) return Response.json({ error: "service not found" }, { status: 404 });

  const staffId = Number(q.get("staff")) || null;
  // 改期時帶上預約的管理碼，該筆預約原本占的時間就不算忙碌
  const token = q.get("token");
  const own = token ? get<{ id: number }>("SELECT id FROM bookings WHERE token = ? AND business_id = ?", token, biz.id) : undefined;
  // 免費額度滿了只擋新預約，已經約好的客人仍然可以改期
  if (biz.suspended || (!own && quotaReached(biz))) return Response.json({ slots: [] });
  const slots = availableSlots(biz, service, date, staffId, own?.id ?? 0).map((s) => s.start);
  return Response.json({ slots }, { headers: { "Cache-Control": "no-store" } });
}
