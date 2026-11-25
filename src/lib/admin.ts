// 平台管理者（營運方）身分：以環境變數 ADMIN_EMAILS（逗號分隔）指定，不存在資料庫裡，
// 因此就算資料庫被竄改也無法自行提權。
import { run } from "./db.ts";

export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export function audit(actor: string, action: string, detail = ""): void {
  run("INSERT INTO audit_log (actor, action, detail) VALUES (?, ?, ?)", actor, action, detail.slice(0, 500));
}
