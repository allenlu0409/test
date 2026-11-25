// 端對端冒煙測試：啟動正式建置的伺服器（獨立的暫存資料庫），用真實瀏覽器跑完主要流程。
// 用法：npm run build && npm run e2e      （需要 Playwright：npm i -D playwright && npx playwright install chromium）
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { boot, chromium, reporter, totp } from "./harness.mjs";

const SHOTS = process.env.E2E_SHOTS;
const ADMIN = "admin@example.com";
const { B, dir, sql, stop, waitForServer } = boot({ DEMO_BILLING: "1", ADMIN_EMAILS: ADMIN });
const { check, finish } = reporter(stop);

async function main() {
  await waitForServer();
  const browser = await chromium.launch();
  const errors = [];
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));
    p.on("response", (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));
    return p;
  };
  const shot = async (p, name) => SHOTS && p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  const alertText = (p) => p.locator("p[role=alert]").first().innerText();
  const signup = async (p, name, email, shop, slug, category) => {
    await p.goto(`${B}/signup`);
    await p.fill("#name", name);
    await p.fill("#email", email);
    await p.fill("#password", "password123");
    await p.click('button:has-text("建立帳號")');
    await p.waitForURL("**/onboarding");
    await p.fill("#name", shop);
    await p.selectOption("#category", category);
    await p.fill("#slug", slug);
    await p.click('button:has-text("開好預約頁")');
  };

  /** 從寄信紀錄取出驗證連結並打開（測試環境不會真的寄信） */
  const verifyEmail = async (p, email) => {
    await p.waitForTimeout(300);
    const body = sql("SELECT body FROM mail_log WHERE recipient = ? AND subject LIKE '歡迎%' ORDER BY id DESC", email)[0].body;
    await p.goto(body.match(/http\S+\/verify\/[\w-]+/)[0].replace(/^https?:\/\/[^/]+/, B));
    // 打開連結本身不會生效（防止郵件掃描器代為驗證），要本人登入後按下按鈕
    if (sql("SELECT email_verified FROM users WHERE email = ?", email)[0].email_verified !== 0) return false;
    await p.click('button:has-text("確認這是我的信箱")');
    await p.waitForSelector("text=信箱確認好了");
    return sql("SELECT email_verified FROM users WHERE email = ?", email)[0].email_verified === 1;
  };

  console.log("\n# 首頁與示範店家");
  const d = await open();
  await d.goto(B);
  check("首頁標題", (await d.locator("h1").innerText()).includes("客人自己約"));
  await shot(d, "landing");
  await d.click("text=直接看示範店家的後台");
  await d.waitForURL("**/dashboard");
  for (const p of ["bookings", "calendar", "customers", "services", "staff", "hours", "settings", "billing", "help"]) {
    await d.goto(`${B}/dashboard/${p}`);
    check(`示範後台 /${p}`, (await d.locator("h1").count()) === 1);
    await shot(d, `dash-${p}`);
  }
  await d.goto(`${B}/dashboard/settings`);
  await d.click('button:has-text("儲存設定")');
  await d.waitForSelector("p[role=alert]");
  check("示範店家資料不可修改", (await alertText(d)).includes("示範"));
  check("示範帳號看不到刪除帳號", (await d.locator("text=我要刪除帳號").count()) === 0);
  check("非管理者看不到營運後台", (await d.goto(`${B}/admin`)).status() === 404);
  const qr = await d.request.get(`${B}/dashboard/qr`);
  check("QR Code", qr.status() === 200 && (await qr.text()).includes("<svg"));
  for (const f of ["customers", "bookings"]) {
    const r = await d.request.get(`${B}/dashboard/${f}/export`);
    check(`匯出 ${f} CSV`, r.status() === 200 && (await r.text()).split("\n").length > 5);
  }

  console.log("\n# 註冊、開店、方案限制");
  const u = await open();
  await signup(u, "小芸", "yun@example.com", "芸指甲", "demo", "nail");
  await u.waitForSelector("p[role=alert]");
  check("保留字代稱被拒", (await alertText(u)).includes("保留字"));
  await u.fill("#slug", "yun-nail");
  await u.click('button:has-text("開好預約頁")');
  await u.waitForURL("**/dashboard?welcome=1");
  check("新店家看到引導清單", (await u.locator("h2:has-text('開始收預約')").count()) === 1);
  check("未驗證信箱時有提示", (await u.locator("text=還沒確認信箱").count()) === 1);
  check("點信中的連結完成驗證", await verifyEmail(u, "yun@example.com"));
  await u.goto(`${B}/dashboard`);
  check("驗證後提示消失", (await u.locator("text=還沒確認信箱").count()) === 0);
  await shot(u, "new-dashboard");
  await u.goto(`${B}/dashboard/staff`);
  check("免費版人員上限提示", (await u.locator("text=想再加一位夥伴").count()) === 1);
  check("免費版不能匯出", (await u.request.get(`${B}/dashboard/customers/export`)).status() === 403);
  await u.goto(`${B}/dashboard/billing`);
  await u.click('button:has-text("升級專業版")');
  await u.waitForURL("**status=switched");
  await u.click("text=年繳（付 10 個月");
  await u.click('button:has-text("改為年繳")');
  await u.waitForURL("**status=switched");
  check("可改為年繳", sql("SELECT billing_cycle FROM businesses WHERE slug = 'yun-nail'")[0].billing_cycle === "year" && (await u.locator("text=/NT\\$4,990/").count()) >= 1);
  await u.goto(`${B}/dashboard/staff`);
  await u.fill("#new-staff-name", "阿美");
  await u.click('button:has-text("新增")');
  await u.waitForSelector("text=已新增人員");
  check("升級後可新增人員", true);
  // 阿美不做「睫毛嫁接」
  const amei = u.locator("li", { has: u.locator('input[value="阿美"]') });
  await amei.locator("label:has-text('睫毛嫁接') input").uncheck();
  await amei.locator('button:has-text("儲存")').click();
  await amei.locator("text=已儲存").waitFor();
  check("人員的服務範圍已儲存", sql("SELECT COUNT(*) AS n FROM staff_service_exclusions")[0].n === 1);

  console.log("\n# 客人預約（手機）");
  const m = await open({ viewport: { width: 390, height: 844 }, isMobile: true });
  await m.goto(`${B}/b/yun-nail`);
  check("結構化資料", (await m.locator('script[type="application/ld+json"]').innerText()).includes("LocalBusiness"));
  await m.click("text=睫毛嫁接");
  check("不做該服務的人員不會出現在選項", (await m.locator('button[aria-pressed]:has-text("阿美")').count()) === 0);
  await m.click('button:has-text("修改")');
  await m.click("text=手部單色凝膠");
  check("會做的服務才列出該人員", (await m.locator('button[aria-pressed]:has-text("阿美")').count()) === 1);
  const days = m.locator('button[aria-label*="月"]:not([disabled])');
  await days.nth(2).click();
  await m.locator("button.tnum.rounded-lg").nth(2).click();
  await m.fill("#bk-name", "林小美");
  await m.goBack();
  check("按瀏覽器返回鍵是回上一步，不是離開頁面", m.url().includes("/b/yun-nail") && (await m.locator("text=日期").count()) >= 1);
  await m.locator("button.tnum.rounded-lg").nth(2).click();
  check("返回再前進後，已填的姓名還在", (await m.inputValue("#bk-name")) === "林小美");
  await m.fill("#bk-phone", "0955-666-777");
  await m.fill("#bk-email", "mei@example.com");
  await m.click('button:has-text("修改") >> nth=1');
  await m.locator("button.tnum.rounded-lg").nth(3).click();
  check("回上一步後聯絡資料仍在", (await m.inputValue("#bk-name")) === "林小美");
  await shot(m, "booking-form");
  await m.click("text=確認預約");
  await m.waitForURL("**/booking/**");
  const manageUrl = m.url().split("?")[0];
  await shot(m, "booking-confirmed");
  const ics = await m.request.get(`${manageUrl}/ics`);
  check("行事曆檔", ics.status() === 200 && (await ics.text()).includes("DTSTART;TZID=Asia/Taipei"));
  await m.waitForTimeout(600);
  const mails = sql("SELECT recipient FROM mail_log ORDER BY id").map((r) => r.recipient);
  check("新預約通知店家與客人", mails.includes("yun@example.com") && mails.includes("mei@example.com"), JSON.stringify(mails));
  check("確認頁可傳到 LINE 與加入 Google 日曆", (await m.locator('a[href^="https://line.me/R/share"]').count()) === 1 && (await m.locator('a[href^="https://calendar.google.com"]').count()) === 1);
  check("付費店的確認頁不放約好的推廣連結", (await m.locator('a[href^="/?ref="]').count()) === 0);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("手機版無橫向捲動", overflow <= 0, String(overflow));

  console.log("\n# 店家處理預約");
  await u.goto(`${B}/dashboard`);
  check("收到第一筆預約後引導清單消失", (await u.locator("h2:has-text('開始收預約')").count()) === 0);
  await u.goto(`${B}/dashboard/bookings`);
  const booked = sql("SELECT date, start_min FROM bookings ORDER BY id DESC LIMIT 1")[0];
  await u.click("summary:has-text('改期')");
  await u.fill('input[name="time"][id^="rs-time"]', "16:00");
  await u.click('button:has-text("確認改期")');
  await u.waitForSelector("text=已改期");
  check("改期成功", sql("SELECT start_min FROM bookings ORDER BY id DESC LIMIT 1")[0].start_min === 960);
  // 保留時段：那段時間客人約不到
  await u.goto(`${B}/dashboard/bookings`);
  await u.click("summary:has-text('保留時段')");
  await u.fill("#bl-date", booked.date);
  await u.fill("#bl-start", "17:00");
  await u.fill("#bl-end", "19:00");
  await u.click('button:has-text("保留這段時間")');
  await u.waitForSelector("text=已保留");
  const svcId = sql("SELECT s.id FROM services s JOIN businesses b ON b.id = s.business_id WHERE b.slug = 'yun-nail' ORDER BY s.id LIMIT 1")[0].id;
  const blocked = await (await fetch(`${B}/api/slots?slug=yun-nail&service=${svcId}&date=${booked.date}`)).json();
  check("保留時段內沒有可約的時間", !blocked.slots.includes(1020) && !blocked.slots.includes(1080) && blocked.slots.includes(1140), JSON.stringify(blocked.slots));
  // 手動預約撞期
  await u.goto(`${B}/dashboard/bookings?new=1`);
  const fill = async () => {
    await u.selectOption("#mb-staff", { label: "小芸" });
    await u.fill("#mb-date", booked.date);
    await u.fill("#mb-time", "11:00");
    await u.fill("#mb-name", "王小明");
    await u.fill("#mb-phone", "0922333444");
    await u.click('button:has-text("建立預約")');
  };
  await fill();
  await u.waitForSelector("text=已建立預約");
  await fill();
  await u.waitForSelector("p[role=alert]");
  check("同人員同時段撞期被擋", (await alertText(u)).includes("已有其他預約"));
  // 客人自己改期 → 通知店家
  await m.goto(manageUrl);
  await m.click("text=改時間");
  await m.waitForURL("**/reschedule");
  await m.locator('button[aria-label*="月"]:not([disabled])').nth(4).click();
  await m.locator("button.tnum.rounded-lg").nth(1).click();
  await m.click('button:has-text("改到")');
  await m.waitForURL("**moved=1");
  await m.waitForTimeout(500);
  const movedTo = sql("SELECT date FROM bookings WHERE token = ?", manageUrl.split("/").pop())[0].date;
  check("客人可以自己改期", movedTo !== booked.date && (await m.locator("text=改好了").count()) === 1);
  check("客人改期會通知店家", sql("SELECT subject FROM mail_log ORDER BY id DESC LIMIT 1")[0].subject.startsWith("客人改期"));
  // 客人取消 → 通知店家
  await m.goto(manageUrl);
  await m.click('button:has-text("取消預約")');
  await m.click('button:has-text("再按一次確定取消")');
  await m.waitForSelector("text=已取消");
  await m.waitForTimeout(500);
  check("客人取消會通知店家", sql("SELECT subject FROM mail_log ORDER BY id DESC LIMIT 1")[0].subject.startsWith("預約取消"));
  // 刪除顧客個資
  await u.goto(`${B}/dashboard/customers`);
  await u.click("summary:has-text('林小美')");
  const row = u.locator("details", { has: u.locator("summary:has-text('林小美')") });
  await row.locator('button:has-text("刪除這位顧客的個人資料")').click();
  await row.locator('button:has-text("確定刪除")').click();
  await u.waitForFunction(() => !document.body.innerText.includes("林小美"));
  check("顧客個資已抹除", sql("SELECT name, email FROM customers WHERE phone LIKE 'deleted-%'")[0]?.email === "");

  console.log("\n# 帳號安全");
  await u.goto(`${B}/dashboard/settings`);
  await u.fill("#pw-current", "password123");
  await u.fill("#pw-new", "newpassword1");
  await u.click('button:has-text("更新密碼")');
  await u.waitForSelector("text=密碼已更新");
  const f = await open();
  await f.goto(`${B}/forgot`);
  await f.fill("#email", "yun@example.com");
  await f.click('button:has-text("寄送重設連結")');
  await f.waitForSelector("p[role=status]");
  await f.waitForTimeout(400);
  const body = sql("SELECT body FROM mail_log WHERE subject LIKE '重設%' ORDER BY id DESC")[0].body;
  const link = body.match(/http\S+\/reset\/[\w-]+/)[0].replace(/^https?:\/\/[^/]+/, B);
  await f.goto(link);
  await f.fill("#password", "resetpass99");
  await f.click('button:has-text("更新密碼並登入")');
  await f.waitForURL("**/dashboard");
  await f.goto(link);
  await f.fill("#password", "another9999");
  await f.click('button:has-text("更新密碼並登入")');
  await f.waitForSelector("p[role=alert]");
  check("重設連結只能用一次", (await alertText(f)).includes("失效"));
  await u.goto(`${B}/dashboard`);
  check("重設密碼後舊登入失效", new URL(u.url()).pathname === "/login");
  await u.fill("#email", "yun@example.com");
  await u.fill("#password", "wrong-password");
  await u.click('button:has-text("登入")');
  await u.waitForSelector("p[role=alert]");
  check("錯誤密碼被拒", (await alertText(u)).includes("不正確"));

  console.log("\n# 營運後台");
  const a = await open();
  await signup(a, "營運", ADMIN, "營運測試店", "ops-shop", "other");
  await a.waitForURL("**/dashboard?welcome=1");
  check("管理者信箱未驗證前進不了營運後台", (await a.goto(`${B}/admin`)).status() === 404);
  await verifyEmail(a, ADMIN);
  await a.goto(`${B}/admin`);
  check("管理者要先開兩步驟驗證", a.url().includes("need2fa=1") && (await a.locator("text=進入營運後台前").count()) === 1);
  await a.fill("#totp-on-pw", "password123");
  await a.click('button:has-text("開始設定")');
  await a.waitForSelector("#totp-code");
  const secret = sql("SELECT totp_secret FROM users WHERE email = ?", ADMIN)[0].totp_secret;
  await a.fill("#totp-code", "000000");
  await a.click('button:has-text("啟用")');
  await a.waitForSelector("p[role=alert]");
  check("錯誤的驗證碼不能啟用", sql("SELECT totp_enabled FROM users WHERE email = ?", ADMIN)[0].totp_enabled === 0);
  await a.fill("#totp-code", totp(secret));
  await a.click('button:has-text("啟用")');
  await a.waitForSelector("text=備用碼");
  check("啟用後顯示備用碼", sql("SELECT totp_enabled FROM users WHERE email = ?", ADMIN)[0].totp_enabled === 1);
  // 重新登入要驗證碼
  await a.context().clearCookies();
  await a.goto(`${B}/login`);
  await a.fill("#email", ADMIN);
  await a.fill("#password", "password123");
  await a.click('button:has-text("登入")');
  await a.waitForSelector("p[role=alert]");
  check("開啟後只有密碼不能登入", (await alertText(a)).includes("兩步驟驗證"));
  await a.click("summary:has-text('我有開啟兩步驟驗證')");
  // 剛剛啟用時用掉的那組驗證碼不能再用一次
  await a.fill("#code", totp(secret));
  await a.click('button:has-text("登入")');
  await a.waitForFunction(() => document.querySelector("p[role=alert]")?.textContent?.includes("驗證碼不正確"));
  check("用過的驗證碼不能重放", true);
  // 驗證器換到下一組之後就能登入（伺服器容許前後各一格）
  await a.fill("#code", totp(secret, Date.now() + 30_000));
  await a.click('button:has-text("登入")');
  await a.waitForURL("**/dashboard");
  await a.goto(`${B}/admin`);
  check("管理者可進營運後台", (await a.locator("text=每月經常性收入").count()) === 1);
  await shot(a, "admin");
  await a.click("summary:has-text('芸指甲')");
  const shop = a.locator("details", { has: a.locator("summary:has-text('芸指甲')") });
  await shop.locator('button:has-text("停權")').click();
  await shop.locator('button:has-text("確定？")').click();
  await a.waitForSelector("text=已停權");
  await m.goto(`${B}/b/yun-nail`);
  check("停權店家的預約頁暫停", (await m.locator("text=目前暫停線上預約").count()) === 1);
  await a.click('button:has-text("立即備份")');
  await a.waitForSelector("text=/已建立今天的備份|今天已經備份過了/");
  check("備份檔已產生", existsSync(path.join(dir, "backups")) && readdirSync(path.join(dir, "backups")).some((x) => x.endsWith(".db")));
  const dl = await a.request.get(`${B}/admin/backup`);
  check("管理者可下載備份", dl.status() === 200 && (await dl.body()).subarray(0, 15).toString() === "SQLite format 3");
  check("非管理者不能下載備份", (await d.request.get(`${B}/admin/backup`)).status() === 404);
  check("稽核紀錄", sql("SELECT action FROM audit_log").map((r) => r.action).includes("suspend"));

  console.log("\n# 刪除帳號");
  await f.goto(`${B}/dashboard/settings`);
  await f.click("summary:has-text('我要刪除帳號')");
  await f.fill("#del-pw", "resetpass99");
  await f.fill("#del-confirm", "yun-nail");
  await f.click('button:has-text("永久刪除帳號")');
  await f.click('button:has-text("最後確認")');
  await f.waitForURL("**/login?deleted=1");
  check("帳號與店家資料已刪除", sql("SELECT 1 FROM businesses WHERE slug = 'yun-nail'").length === 0 && sql("SELECT 1 FROM bookings b JOIN businesses s ON s.id = b.business_id WHERE s.slug = 'yun-nail'").length === 0);
  check("刪除後預約頁為 404", (await f.goto(`${B}/b/yun-nail`)).status() === 404);

  console.log("\n# 端點防護");
  check("備份拉取端點未設密鑰時關閉", (await d.request.get(`${B}/api/cron/backup`)).status() === 503);
  check("排程端點未設密鑰時關閉", (await d.request.post(`${B}/api/cron/reminders`)).status() === 503);
  check("Stripe webhook 未設密鑰時關閉", (await d.request.post(`${B}/api/stripe/webhook`, { data: "{}" })).status() === 503);
  const h = (await d.request.get(B)).headers();
  check("分享預覽圖與主畫面設定", (await d.request.get(`${B}/opengraph-image.png`)).status() === 200 && (await d.request.get(`${B}/b/demo/opengraph-image.png`)).status() === 200 && (await d.request.get(`${B}/manifest.webmanifest`)).status() === 200);
  check("信件檢視頁在一般環境不存在", (await d.request.get(`${B}/dev/mail`)).status() === 404);
  check("安全標頭", !!h["content-security-policy"] && !!h["strict-transport-security"] && h["x-content-type-options"] === "nosniff");
  let limited = false;
  for (let i = 0; i < 2500 && !limited; i += 50) {
    const rs = await Promise.all(Array.from({ length: 50 }, () => fetch(`${B}/api/slots?slug=demo&service=1&date=2030-01-01`)));
    limited = rs.some((r) => r.status === 429);
  }
  check("API 流量超過上限回 429", limited);
  check("瀏覽器沒有錯誤", errors.length === 0, JSON.stringify(errors.slice(0, 5)));

  await browser.close();
}

main().then(() => finish(), finish);
