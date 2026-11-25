// 擷取影片素材：啟動正式建置的伺服器（暫存資料庫），用示範店家拍下各個畫面。
// 用法：npm run build && node marketing/video/capture.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot, chromium } from "../../tests/e2e/harness.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
const { B, stop, waitForServer } = boot({ DEMO_BILLING: "1" }, 3297);

/** 拿掉只有示範環境才有的東西（示範提示列、localhost 網址） */
const clean = (page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll("div")) if (el.children.length <= 1 && el.textContent.startsWith("這是示範店家")) el.remove();
    document.querySelectorAll("div.bg-sun-soft").forEach((el) => el.textContent.includes("還沒確認信箱") && el.remove());
    for (const el of document.querySelectorAll("p")) {
      if (/^https?:\/\/localhost/.test(el.textContent)) el.textContent = "你的網域/b/mumu-hair";
      if (el.textContent.startsWith("示範模式")) el.remove();
    }
  });

try {
  await waitForServer();
  const browser = await chromium.launch();

  // ── 店家端（桌機） ──
  const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const shot = async (page, name, opts = {}) => {
    // 等內容真的出來（後台換頁時會先顯示載入中的骨架畫面）
    await page.waitForLoadState("networkidle");
    await page.locator("h1").first().waitFor({ state: "attached" });
    await page.waitForTimeout(350);
    await clean(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
    console.log("  ", name);
  };
  await desk.goto(B);
  await shot(desk, "d-landing");

  // 註冊與開店（新帳號，畫面上是空白的新店）
  const fresh = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await fresh.goto(`${B}/signup`);
  await fresh.fill("#name", "Mia");
  await fresh.fill("#email", "mia@mumuhair.tw");
  await fresh.fill("#password", "password123");
  await shot(fresh, "d-signup");
  await fresh.click('button:has-text("建立帳號")');
  await fresh.waitForURL("**/onboarding");
  await fresh.fill("#name", "木木髮藝 Mumu Hair");
  await fresh.selectOption("#category", "hair");
  await fresh.fill("#slug", "mumu-hair");
  await shot(fresh, "d-onboarding");
  await fresh.click('button:has-text("開好預約頁")');
  await fresh.waitForURL("**/dashboard?welcome=1");
  await fresh.evaluate(() => document.querySelectorAll("div.bg-sun-soft").forEach((el) => el.textContent.includes("還沒確認信箱") && el.remove()));
  await shot(fresh, "d-welcome");
  await fresh.goto(`${B}/dashboard/services`);
  await fresh.evaluate(() => document.querySelectorAll("div.bg-sun-soft").forEach((el) => el.textContent.includes("還沒確認信箱") && el.remove()));
  await shot(fresh, "d-services-new");

  // 有生意的示範店家
  await desk.click("text=先看示範店家的後台");
  await desk.waitForURL("**/dashboard");
  await shot(desk, "d-dashboard", { fullPage: true });
  for (const p of ["services", "staff", "hours", "bookings", "calendar", "customers", "settings", "billing"]) {
    await desk.goto(`${B}/dashboard/${p}`);
    await shot(desk, `d-${p}`, { fullPage: p !== "bookings" });
  }

  // ── 客人端（手機） ──
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(`${B}/b/demo`);
  await shot(phone, "m-1-services");
  await phone.click("text=設計染髮");
  await shot(phone, "m-2-staff");
  const days = phone.locator('button[aria-label*="月"]:not([disabled])');
  await days.nth(3).click();
  await phone.waitForSelector("button.tnum.rounded-lg");
  await phone.locator("text=指定服務人員").scrollIntoViewIfNeeded();
  await phone.evaluate(() => window.scrollBy(0, -24));
  await shot(phone, "m-3-times");
  await phone.locator("button.tnum.rounded-lg").nth(1).click();
  await phone.fill("#bk-name", "林小美");
  await phone.fill("#bk-phone", "0912345678");
  await phone.locator("text=填寫聯絡資料").scrollIntoViewIfNeeded();
  await phone.evaluate(() => window.scrollBy(0, -24));
  await shot(phone, "m-4-contact");
  await phone.click("text=確認預約");
  await phone.waitForURL("**/booking/**");
  await phone.waitForTimeout(700);
  // 印章另外做成動畫，這裡先藏起來
  await phone.evaluate(() => {
    const s = document.querySelector(".stamp");
    if (s) s.style.visibility = "hidden";
  });
  await shot(phone, "m-5-confirmed");

  // 預約進來之後的店家畫面
  await desk.goto(`${B}/dashboard/bookings`);
  await shot(desk, "d-bookings-after");
  await browser.close();
} finally {
  stop();
}
