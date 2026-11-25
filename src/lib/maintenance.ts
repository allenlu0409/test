// 例行維護：清理過期資料、每日備份、資料庫用量統計。
import fs from "node:fs";
import path from "node:path";
import { db, get, run } from "./db.ts";

export function dbFile(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "yuehao.db");
}

export function backupDir(): string {
  return process.env.BACKUP_DIR || path.join(path.dirname(dbFile()), "backups");
}

/** 刪除不再需要的資料，控制資料庫大小 */
export function pruneExpired(now = Date.now()): void {
  run("DELETE FROM sessions WHERE expires_at < ?", now);
  run("DELETE FROM password_resets WHERE expires_at < ?", now);
  run("DELETE FROM mail_log WHERE created_at < datetime('now', '-30 days')");
  run("DELETE FROM audit_log WHERE created_at < datetime('now', '-365 days')");
}

/**
 * 以 VACUUM INTO 產生一致的快照（線上執行不需停機），每天一份、保留最近 keep 份。
 * 回傳新建立的檔案路徑；當天已備份過或使用記憶體資料庫時回傳 null。
 */
export function backupDatabase(date: string, keep = Number(process.env.BACKUP_KEEP) || 7): string | null {
  if (dbFile() === ":memory:" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `yuehao-${date}.db`);
  if (fs.existsSync(target)) return null;
  const tmp = `${target}.tmp`;
  fs.rmSync(tmp, { force: true });
  db().exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  fs.renameSync(tmp, target);
  const old = fs.readdirSync(dir).filter((f) => /^yuehao-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  return target;
}

export interface DbStats {
  sizeBytes: number;
  backups: { name: string; sizeBytes: number }[];
  rows: Record<string, number>;
}

export function dbStats(): DbStats {
  const pages = get<{ n: number }>("SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()")?.n ?? 0;
  const rows: Record<string, number> = {};
  for (const t of ["users", "businesses", "customers", "bookings", "mail_log", "sessions"]) {
    rows[t] = get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n;
  }
  let backups: DbStats["backups"] = [];
  try {
    backups = fs.readdirSync(backupDir()).filter((f) => f.endsWith(".db")).sort().reverse().map((name) => ({ name, sizeBytes: fs.statSync(path.join(backupDir(), name)).size }));
  } catch {
    // 尚未產生過備份
  }
  return { sizeBytes: pages, backups, rows };
}
