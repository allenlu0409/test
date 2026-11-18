import crypto from "node:crypto";
import { sendDueReminders } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** 給外部排程（cron、Uptime 監控）呼叫：Authorization: Bearer $CRON_SECRET */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("cron not configured", { status: 503 });
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return new Response("unauthorized", { status: 401 });
  return Response.json({ sent: await sendDueReminders() });
}
