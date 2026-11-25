import { get, type Business, type Service } from "@/lib/db";
import { availableSlots, quotaReached } from "@/lib/booking";
import { isDateStr } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const date = q.get("date");
  const biz = get<Business>("SELECT * FROM businesses WHERE slug = ?", q.get("slug") ?? "");
  if (!biz || !isDateStr(date)) return Response.json({ error: "bad request" }, { status: 400 });

  const service = get<Service>("SELECT * FROM services WHERE id = ? AND business_id = ? AND active = 1 AND archived = 0", Number(q.get("service")), biz.id);
  if (!service) return Response.json({ error: "service not found" }, { status: 404 });
  if (biz.suspended || quotaReached(biz)) return Response.json({ slots: [] });

  const staffId = Number(q.get("staff")) || null;
  const slots = availableSlots(biz, service, date, staffId).map((s) => s.start);
  return Response.json({ slots }, { headers: { "Cache-Control": "no-store" } });
}
