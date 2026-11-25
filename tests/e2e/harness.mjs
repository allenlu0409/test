// 端對端測試共用：啟動正式建置的伺服器（獨立的暫存資料庫）、查資料庫、彙整結果。
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

export const { chromium } = createRequire(import.meta.url)("playwright");

/** 以指定環境變數啟動伺服器。金流與寄信金鑰一律清空，避免測試打到真實服務 */
export function boot(env = {}, port = Number(process.env.E2E_PORT) || 3299) {
  const dir = mkdtempSync(path.join(tmpdir(), "yuehao-e2e-"));
  const DB = path.join(dir, "e2e.db");
  const B = `http://localhost:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...process.env, DATABASE_PATH: DB, APP_URL: "", ECPAY_MERCHANT_ID: "", STRIPE_SECRET_KEY: "", RESEND_API_KEY: "", ADMIN_EMAILS: "", DEMO_BILLING: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  return {
    B,
    dir,
    stop() {
      try {
        process.kill(-server.pid);
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    },
    async waitForServer() {
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch(`${B}/api/health`)).ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`server did not start:\n${log}`);
    },
    sql(q, ...p) {
      const d = new DatabaseSync(DB);
      try {
        return d.prepare(q).all(...p);
      } finally {
        d.close();
      }
    },
  };
}

export function reporter(stop) {
  let passed = 0;
  const failures = [];
  return {
    check(name, cond, detail = "") {
      if (cond) passed++;
      else failures.push(`${name} ${detail}`);
      console.log(`${cond ? "  ok " : "FAIL "} ${name}${cond ? "" : ` ${detail}`}`);
    },
    /** 結束測試；傳入例外時視為失敗。直接結束行程，避免瀏覽器沒關導致 CI 卡住 */
    finish(error) {
      if (error) {
        failures.push(`exception: ${error.stack ?? error}`);
      }
      stop();
      console.log(`\n${passed} passed, ${failures.length} failed`);
      if (failures.length) console.log(failures.join("\n"));
      process.exit(failures.length ? 1 : 0);
    },
  };
}
