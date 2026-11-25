// 把最新的資料庫快照當成檔案回傳（沒有今天的就先做一份）。營運後台下載與外部排程共用。
import fs from "node:fs";
import path from "node:path";
import { backupDatabase, backupDir } from "./maintenance.ts";
import { nowInTz } from "./time.ts";

export function latestBackupResponse(): Response {
  backupDatabase(nowInTz("Asia/Taipei").date);
  const dir = backupDir();
  const name = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^yuehao-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().pop() : undefined;
  if (!name) return new Response("no backup available", { status: 404 });
  const file = path.join(dir, name);
  return new Response(fs.readFileSync(file), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(fs.statSync(file).size),
      "Cache-Control": "no-store",
    },
  });
}
