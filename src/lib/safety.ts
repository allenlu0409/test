// 啟動時的設定檢查：預覽／示範用的開關一旦和真實服務的金鑰同時出現，就拒絕啟動。
// 這些開關各自都能讓人繞過登入或付款，不能靠「記得不要設」。
export function unsafeConfig(env: Record<string, string | undefined> = process.env): string[] {
  const live = !!(env.RESEND_API_KEY || env.ECPAY_MERCHANT_ID || env.STRIPE_SECRET_KEY);
  if (!live) return [];
  const problems: string[] = [];
  if (env.DEV_MAILBOX === "1") problems.push("DEV_MAILBOX=1 會讓任何人看到重設密碼連結");
  if (env.DEMO_BILLING === "1") problems.push("DEMO_BILLING=1 會讓店家不付款就能升級");
  if (env.ADMIN_REQUIRE_2FA === "off") problems.push("ADMIN_REQUIRE_2FA=off 會讓營運後台只靠密碼保護");
  if (env.INSECURE_COOKIES) problems.push("INSECURE_COOKIES 會讓登入 Cookie 在未加密連線上傳送");
  if (!env.APP_URL) problems.push("沒有設定 APP_URL：信件裡的連結會依請求的 Host 產生，可被偽造");
  return problems;
}

/** 信件檢視頁是否可用：只有明確開啟、而且沒有接上任何真實服務時 */
export function devMailboxEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEV_MAILBOX === "1" && !(env.RESEND_API_KEY || env.ECPAY_MERCHANT_ID || env.STRIPE_SECRET_KEY);
}
