// 伺服器啟動時掛上背景排程：每 10 分鐘檢查一次是否有要寄的預約提醒。
// 多台主機部署時請改由外部排程呼叫 /api/cron/reminders，並設 DISABLE_INTERNAL_CRON=1。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_INTERNAL_CRON === "1") return;
  const g = globalThis as unknown as { __yuehaoCron?: NodeJS.Timeout };
  if (g.__yuehaoCron) return;
  const { sendDueReminders } = await import("./lib/notify");
  const tick = () => sendDueReminders().catch((e) => console.error("reminder job failed", e));
  g.__yuehaoCron = setInterval(tick, 10 * 60_000);
  g.__yuehaoCron.unref?.();
  setTimeout(tick, 15_000).unref?.();
}
