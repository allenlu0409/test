// 伺服器啟動時掛上背景排程（每 10 分鐘）：預約提醒、訂閱到期降級、清理過期資料、每日備份。
// 多台主機部署時請改由外部排程呼叫 /api/cron/reminders，並設 DISABLE_INTERNAL_CRON=1。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_INTERNAL_CRON === "1") return;
  const g = globalThis as unknown as { __yuehaoCron?: NodeJS.Timeout };
  if (g.__yuehaoCron) return;
  const { runScheduledJobs } = await import("./lib/jobs");
  const tick = () => runScheduledJobs().catch((e) => console.error("scheduled jobs failed", e));
  g.__yuehaoCron = setInterval(tick, 10 * 60_000);
  g.__yuehaoCron.unref?.();
  setTimeout(tick, 15_000).unref?.();
}
