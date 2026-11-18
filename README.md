# 約好 Yuehao — 美業與工作室的線上預約 SaaS

給美髮、美甲美睫、教練、工作室的多租戶預約系統。店家三分鐘開好預約頁，客人自己選服務與時段；店家以月訂閱付費。

## 商業模式

| 方案 | 月費 | 限制 | 升級誘因 |
| --- | --- | --- | --- |
| 免費版 | NT$0 | 1 位服務人員、每月 30 筆線上預約、頁尾有「約好」標示 | 額度用到 70% 起後台出現提醒；額滿後客人無法線上預約 |
| 專業版 | NT$499 | 5 位服務人員、預約不限 | 營收分析、CSV 匯出、自訂品牌色、移除標示 |
| 商務版 | NT$1,299 | 人員不限 | 多設計師門市 |

免費版預約頁的頁尾連結同時是獲客管道：每位來預約的客人都會看到「我也要開一個預約頁」。

方案定義集中在 `src/lib/plans.ts`，改價格或限制只要動這一個檔案。

## 功能

**客人端**（`/b/店家代稱`，手機優先）
- 選服務 → 指定或不指定服務人員 → 選日期時段 → 留姓名手機，不必註冊
- 預約完成頁可加入行事曆（.ics）、自行取消

**店家後台**（`/dashboard`）
- 總覽：今日預約、本月營收、新顧客、未到率、近 14 天營收圖、熱門服務
- 預約管理：完成／未到／取消，手動新增電話或現場預約
- 週行事曆、顧客名單（來店次數、累計消費、備註、CSV 匯出）
- 服務項目、服務人員、每週營業時間、臨時公休、預約規則（時段間隔、最短提前、開放天數）
- 方案與帳單（Stripe Checkout 與客戶入口）

**系統**
- 同一服務人員同一時段不會被重複預約（寫入時在交易內重新檢查）
- 密碼 scrypt 雜湊、session 以雜湊存放、登入與預約限流、蜜罐欄位防機器人
- 首頁可免註冊進入示範店家後台

## 本機執行

需要 Node.js 22.13 以上，不需要另外安裝資料庫。

```bash
npm install
npm run dev        # http://localhost:3000
```

首頁按「免註冊，看示範後台」會自動建立示範店家（也可以先跑 `npm run seed`）。

```bash
npm test           # 單元與整合測試
npm run typecheck
npm run build && npm start
```

## 環境變數

複製 `.env.example` 為 `.env.local`。

| 變數 | 說明 |
| --- | --- |
| `APP_URL` | 對外網址，Stripe 回跳用。正式環境必填 |
| `DATABASE_PATH` | SQLite 檔案位置，預設 `./data/yuehao.db` |
| `STRIPE_SECRET_KEY` | Stripe 密鑰 |
| `STRIPE_WEBHOOK_SECRET` | Webhook 簽章密鑰 |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS` | 兩個月費方案的 Price ID |
| `DEMO_BILLING` | 設為 `1` 時，未設定 Stripe 也能切換方案（不收款，僅供展示） |
| `DEMO_ENABLED` | 設為 `off` 可關閉首頁的示範後台入口 |

未設定 Stripe 時，開發環境會自動進入示範模式：升級按鈕直接切換方案，不扣款。

## 開始收款（Stripe）

1. 在 Stripe 建立兩個「每月定期」的產品價格（TWD 499、TWD 1,299），把 Price ID 填入環境變數。
2. 新增 webhook 端點 `https://你的網域/api/stripe/webhook`，訂閱這些事件：
   `checkout.session.completed`、`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted`
3. 在 Stripe 後台啟用 Customer Portal（讓店家自行換方案、取消、下載發票）。

> **台灣的注意事項**：Stripe 目前不開放台灣註冊的公司直接申請。若以台灣公司營運，需改接綠界、藍新或 TapPay 的定期定額。金流邏輯集中在 `src/lib/stripe.ts` 與 `src/app/api/stripe/webhook/route.ts`，後台只呼叫 `changePlan` 一個 action，替換範圍很小。Stripe 整合已依官方 API 規格實作，但尚未用真實金鑰跑過完整付款，上線前請先用測試金鑰驗證一次。

## 部署

資料存在單一 SQLite 檔，所以要部署在**有持久化磁碟**的環境（Fly.io、Railway、Render、Zeabur 或任何 VPS），不適合 Vercel 這類無狀態平台。

```bash
docker build -t yuehao .
docker run -d -p 3000:3000 -v yuehao-data:/data \
  -e APP_URL=https://你的網域 \
  -e STRIPE_SECRET_KEY=... -e STRIPE_WEBHOOK_SECRET=... \
  -e STRIPE_PRICE_PRO=... -e STRIPE_PRICE_BUSINESS=... \
  yuehao
```

健康檢查端點：`/api/health`。備份只要定期複製 `/data/yuehao.db`。

## 架構

- Next.js 16（App Router、Server Actions）＋ React 19 ＋ Tailwind CSS 4 ＋ TypeScript
- 資料庫用 Node 內建的 `node:sqlite`，執行期相依套件只有 next、react、react-dom

```
src/lib/slots.ts      可預約時段計算（純函式，有測試）
src/lib/booking.ts    預約規則：額度、防撞期、建立預約
src/lib/plans.ts      方案定義與各產業的預設服務
src/lib/stripe.ts     訂閱金流
src/lib/db.ts         schema 與查詢工具
src/app/b/[slug]      客人看到的預約頁
src/app/dashboard     店家後台
```

## 通知與提醒

| 時機 | 收件人 | 方案 |
| --- | --- | --- |
| 客人線上預約成功 | 店家、客人（有留 Email 時） | 全部 |
| 客人取消 | 店家 | 全部 |
| 店家取消 | 客人 | 全部 |
| 預約前一天早上 9 點後 | 客人 | 專業版以上 |
| 忘記密碼 | 店家 | 全部 |

設定 `RESEND_API_KEY` 與 `MAIL_FROM` 後才會真的寄出；未設定時信件只寫進資料庫的 `mail_log` 表，方便開發時查看。提醒由伺服器內建排程每 10 分鐘檢查一次；多台主機部署時設 `DISABLE_INTERNAL_CRON=1`，改由外部排程 `POST /api/cron/reminders`（標頭 `Authorization: Bearer $CRON_SECRET`）。

## 驗證方式

- `npm test`：17 個測試，涵蓋時段計算、重複預約、額度、顧客資料保護、提醒不重寄、webhook 簽章
- 瀏覽器端對端測試（Playwright）跑過：註冊開店、手機預約與取消、後台各頁、升級解鎖、撞期阻擋、忘記密碼、通知信
- Lighthouse（手機）：首頁、預約頁、登入、註冊四頁的效能、無障礙、最佳實務、SEO 皆為 96–100 分
- 另有一輪獨立的程式碼審查，找到的 10 個缺陷已全部修正並補上測試

## 上線前還要做的事

- 服務條款與隱私權政策目前是範本（`src/app/(legal)`），需填入公司資料
- Stripe 與 Resend 都只照官方 API 規格實作，尚未用真實金鑰跑過；上線前請各用測試金鑰驗證一次
- 通知目前只有 Email。台灣客人更習慣 LINE，接上 LINE 官方帳號通知會是下一個值得做的付費功能
- 限流存在記憶體中，多台主機時要換成 Redis；規模變大後資料庫可換成 Postgres
- 正式環境請放在 HTTPS 反向代理後面，並設定 `CLIENT_IP_HEADER` 讓限流能辨識真實 IP
