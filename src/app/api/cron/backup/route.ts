import crypto from "node:crypto";
import { latestBackupResponse } from "@/lib/backup-response";

export const dynamic = "force-dynamic";

/** 給外部排程拉取備份做異地保存：Authorization: Bearer $CRON_SECRET（見 .github/workflows/backup.yml） */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("cron not configured", { status: 503 });
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return new Response("unauthorized", { status: 401 });
  return latestBackupResponse();
}
