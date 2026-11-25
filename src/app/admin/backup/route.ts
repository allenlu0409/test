import { audit } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { latestBackupResponse } from "@/lib/backup-response";

export const dynamic = "force-dynamic";

/** 管理者下載最新備份（含全部店家與顧客資料，下載後請放在加密磁碟） */
export async function GET() {
  const admin = await requireAdmin();
  audit(admin.email, "backup-download");
  return latestBackupResponse();
}
