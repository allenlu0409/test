import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    get("SELECT 1 AS ok");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
