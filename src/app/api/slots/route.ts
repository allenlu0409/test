import { get, type Business, type Service } from "@/lib/db";
import { availableSlots } from "@/lib/booking";
import { isDateStr } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const date = q.get("date");
  const biz = get<Business>("SELECT * FROM businesses WHERE slug = ?", q.get("slug") ?? "");
  if (!biz || !isDateStr(date)) return Response.json({ error: "bad request" }, { status: 400 });

  // 改期時帶上預約的管理碼：該筆預約原本占的時間不算忙碌；而且即使服務之後被下架，這筆預約仍要能查空檔
  const token = q.get("token");
  const own = token ? get<{ id: number; service_id: number }>("SELECT id, service_id FROM bookings WHERE token = ? AND business_id = ? AND status = 'confirmed'", token, biz.id) : undefined;
  const serviceId = Number(q.get("service"));
  const service =
    own && own.service_id === serviceId
      ? get<Service>("SELECT * FROM services WHERE id = ? AND business_id = ?", serviceId, biz.id)
      : get<Service>("SELECT * FROM services WHERE id = ? AND business_id = ? AND active = 1 AND archived = 0", serviceId, biz.id);
  if (!service) return Response.json({ error: "service not found" }, { status: 404 });
  const staffId = Number(q.get("staff")) || null;
  if (biz.suspended) return Response.json({ slots: [] });
  const slots = availableSlots(biz, service, date, staffId, own?.id ?? 0).map((s) => s.start);
  return Response.json({ slots }, { headers: { "Cache-Control": "no-store" } });
}
