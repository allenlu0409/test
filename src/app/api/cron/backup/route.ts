import crypto from "node:crypto";
import { latestBackupResponse } from "@/lib/backup-response";

export const dynamic = "force-dynamic";

/**
 * 給外部排程拉取備份做異地保存：Authorization: Bearer $BACKUP_SECRET（見 .github/workflows/backup.yml）。
 * 用獨立的密鑰：這個端點會交出整個資料庫，不該和「觸發排程」共用同一把。
 */
export async function GET(req: Request) {
  const secret = process.env.BACKUP_SECRET;
  if (!secret) return new Response("backup not configured", { status: 503 });
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return new Response("unauthorized", { status: 401 });
  return latestBackupResponse();
}
