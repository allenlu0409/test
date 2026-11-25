// 綠界訂閱流程的端對端測試：用綠界公開的測試環境金鑰啟動伺服器，
// 攔截送往綠界的結帳表單並驗證簽章，再模擬綠界的伺服器回呼。不會連到綠界。
import crypto from "node:crypto";
import { boot, chromium, reporter } from "./harness.mjs";

const KEY = "pwFHCqoQZGmho4w6";
const IV = "EkRm7iFT261dpevs";
const MID = "3002607";
const { B, sql, stop, waitForServer } = boot({ ECPAY_MERCHANT_ID: MID, ECPAY_HASH_KEY: KEY, ECPAY_HASH_IV: IV, ECPAY_STAGE: "1", APP_URL: "https://yuehao.example" }, 3298);
const { check, finish } = reporter(stop);

function mac(params) {
  const body = Object.keys(params).filter((k) => k !== "CheckMacValue").sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), "en")).map((k) => `${k}=${params[k]}`).join("&");
  const enc = encodeURIComponent(`HashKey=${KEY}&${body}&HashIV=${IV}`).replace(/%20/g, "+").replace(/~/g, "%7e").replace(/'/g, "%27").toLowerCase();
  return crypto.createHash("sha256").update(enc).digest("hex").toUpperCase();
}
const callback = (path, params, sign = true) =>
  fetch(`${B}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, CheckMacValue: sign ? mac(params) : "0".repeat(64) }).toString() });
const plan = () => sql("SELECT plan, billing_provider, ecpay_trade_no, plan_renews_at, cancel_at_period_end FROM businesses WHERE slug = 'pay-shop'")[0];

async function main() {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  let posted = null;
  await page.route("https://payment-stage.ecpay.com.tw/**", (route) => {
    posted = Object.fromEntries(new URLSearchParams(route.request().postData() ?? ""));
    return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>ECPay stub</h1>" });
  });

  await page.goto(`${B}/signup`);
  await page.fill("#name", "阿凱");
  await page.fill("#email", "kai@example.com");
  await page.fill("#password", "password123");
  await page.click('button:has-text("建立帳號")');
  await page.waitForURL("**/onboarding");
  await page.fill("#name", "凱教練");
  await page.selectOption("#category", "fitness");
  await page.fill("#slug", "pay-shop");
  await page.click('button:has-text("開好預約頁")');
  await page.waitForURL("**/dashboard?welcome=1");

  console.log("\n# 結帳");
  await page.goto(`${B}/dashboard/billing`);
  check("未設示範模式時不顯示示範提示", (await page.locator("text=示範模式").count()) === 0);
  await page.click('button:has-text("升級專業版")');
  await page.waitForURL("https://payment-stage.ecpay.com.tw/**");
  check("表單送往綠界測試環境", !!posted && posted.MerchantID === MID);
  check("定期定額欄位", posted.PeriodType === "M" && posted.Frequency === "1" && posted.TotalAmount === "499" && posted.PeriodAmount === "499" && posted.ChoosePayment === "Credit");
  check("簽章正確", posted.CheckMacValue === mac(posted));
  check("回呼網址使用對外網域", posted.ReturnURL === "https://yuehao.example/api/ecpay/notify" && posted.PeriodReturnURL === "https://yuehao.example/api/ecpay/period");
  check("付款前方案不變", plan().plan === "free");

  console.log("\n# 首次授權回呼");
  const first = { MerchantID: MID, MerchantTradeNo: posted.MerchantTradeNo, RtnCode: "1", RtnMsg: "交易成功", TradeNo: "2611250000001", TradeAmt: "499", PaymentDate: "2026/11/25 12:00:00", PaymentType: "Credit_CreditCard", SimulatePaid: "0", CustomField1: posted.CustomField1, CustomField2: posted.CustomField2 };
  let r = await callback("/api/ecpay/notify", first, false);
  check("簽章錯誤的回呼被拒", r.status === 400 && plan().plan === "free");
  r = await callback("/api/ecpay/notify", { ...first, TradeAmt: "1" });
  check("金額不符的回呼被拒", r.status === 400 && plan().plan === "free");
  r = await callback("/api/ecpay/notify", first);
  check("成功回呼回覆 1|OK", r.status === 200 && (await r.text()) === "1|OK");
  check("方案已啟用", plan().plan === "pro" && plan().billing_provider === "ecpay" && plan().ecpay_trade_no === posted.MerchantTradeNo);
  await callback("/api/ecpay/notify", first);
  check("重送不重複記帳", sql("SELECT COUNT(*) AS n FROM payments")[0].n === 1);
  await page.goto(`${B}/dashboard/billing`);
  check("帳單頁顯示專業版與下次扣款日", (await page.locator("text=下次扣款日").count()) === 1);

  console.log("\n# 每期扣款回呼");
  const before = plan().plan_renews_at;
  const period = { MerchantID: MID, MerchantTradeNo: posted.MerchantTradeNo, RtnCode: "1", RtnMsg: "成功", PeriodType: "M", Frequency: "1", ExecTimes: "99", Amount: "499", Gwsr: "12345678", ProcessDate: "2026/12/25 10:00:00", AuthCode: "777777", FirstAuthAmount: "499", TotalSuccessTimes: "2", SimulatePaid: "0" };
  r = await callback("/api/ecpay/period", period);
  check("續期成功", r.status === 200 && plan().plan_renews_at >= before && sql("SELECT COUNT(*) AS n FROM payments WHERE status='paid'")[0].n === 2);
  r = await callback("/api/ecpay/period", { ...period, RtnCode: "0", RtnMsg: "失敗", TotalSuccessTimes: "2", ProcessDate: "2027/01/25 10:00:00" });
  check("扣款失敗有記錄且不立即降級", r.status === 200 && plan().plan === "pro" && sql("SELECT COUNT(*) AS n FROM payments WHERE status='failed'")[0].n === 1);

  console.log("\n# 取消訂閱");
  await page.click('button:has-text("取消訂閱")');
  await page.click('button:has-text("確定取消訂閱")');
  await page.waitForSelector("p[role=alert]");
  check("綠界無回應時不會誤標為已取消", (await page.locator("p[role=alert]").innerText()).includes("取消訂閱失敗") && plan().cancel_at_period_end === 0);

  await browser.close();
}

main().then(() => finish(), finish);
