// 伺服器啟動時：檢查設定是否安全，並掛上背景排程（每 10 分鐘）：
// 預約提醒、訂閱到期降級、清理過期資料、每日備份、引導信、異常通知。
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { start } = await import("./instrumentation-node");
    start();
  }
}
