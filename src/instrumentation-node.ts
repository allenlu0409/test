// 只在 Node.js 執行環境載入：啟動前的設定檢查與背景排程。
import { runScheduledJobs } from "./lib/jobs";
import { unsafeConfig } from "./lib/safety";

export function start() {
  const problems = unsafeConfig();
  if (problems.length) {
    console.error(`\n設定不安全，拒絕啟動：\n${problems.map((p) => `  - ${p}`).join("\n")}\n請移除這些預覽用的設定後再啟動。\n`);
    process.exit(1);
  }
  // 多台主機部署時請改由外部排程呼叫 /api/cron/reminders，並設 DISABLE_INTERNAL_CRON=1
  if (process.env.DISABLE_INTERNAL_CRON === "1") return;
  const g = globalThis as unknown as { __yuehaoCron?: NodeJS.Timeout };
  if (g.__yuehaoCron) return;
  const tick = () => runScheduledJobs().catch((e) => console.error("scheduled jobs failed", e));
  g.__yuehaoCron = setInterval(tick, 10 * 60_000);
  g.__yuehaoCron.unref?.();
  setTimeout(tick, 15_000).unref?.();
}
