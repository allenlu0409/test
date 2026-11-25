# 架構與開發方式

## 一張圖看懂

```
客人手機 ──┐                        ┌── 綠界／Stripe（訂閱扣款）
店家瀏覽器 ─┼─ Cloudflare ─ 反向代理 ─┤
你（營運） ─┘   (DNS/CDN)   (TLS)   │   Next.js 應用程式（單一容器）
                                    │   ├─ 頁面與 Server Actions
                                    │   ├─ proxy.ts：API 限流
                                    │   ├─ 內建排程：提醒、到期降級、清理、備份
                                    │   └─ SQLite 檔案（持久化磁碟 /data）
                                    └── Resend（寄信）
```

整個產品是**一個容器加一個資料庫檔案**。沒有另外的資料庫伺服器、快取或佇列要維護，這是在付費店家數到達數千之前最省錢也最不容易出事的做法。何時該拆，見 [operations.md](operations.md) 的「擴充時機」。

## 技術選擇與理由

| 選擇 | 理由 | 代價 |
| --- | --- | --- |
| Next.js 16（App Router、Server Actions） | 前後端同一份程式碼，表單不需另寫 API | 綁定 Node 執行環境 |
| `node:sqlite`（Node 內建） | 零相依、零維運、備份就是複製檔案 | 只能單機；寫入是序列化的 |
| Tailwind CSS 4 | 設計 token 集中在一個檔案 | — |
| 執行期相依只有 next、react、react-dom、qrcode | 供應鏈風險小、升級容易 | 金流與寄信要自己呼叫 REST API |

## 目錄

```
src/lib/               商業規則（不依賴 Next，可直接單元測試）
  db.ts                schema、migration、查詢工具（all/get/run/tx）
  slots.ts             可預約時段計算（純函式）
  booking.ts           建立預約、防撞期、額度
  plans.ts             方案與限制的唯一定義
  billing.ts           方案啟用／續期／降級的單一入口
  ecpay.ts             綠界：簽章、結帳表單、取消
  ecpay-events.ts      綠界回呼的處理邏輯
  stripe.ts            Stripe：結帳、客戶入口、webhook 簽章
  notify.ts mail.ts    通知內容與寄送
  jobs.ts              定期工作入口（提醒、到期、清理、備份、引導信、異常通知）
  alerts.ts drip.ts    給營運者的異常通知與週報、給新店家的引導信
  totp.ts              兩步驟驗證
  maintenance.ts       清理、備份、用量統計
  auth.ts              登入狀態、後台與營運後台的守門
  ratelimit.ts         限流
src/app/
  page.tsx             行銷首頁
  (auth)/              註冊、登入、忘記密碼、開店
  b/[slug]/            客人看到的預約頁
  booking/[token]/     客人的預約明細（取消、加入行事曆）
  dashboard/           店家後台
  admin/               營運後台（你用的）
  api/                 時段查詢、金流回呼、排程、健康檢查
src/components/        共用元件（ActionForm、SlotPicker、Logo、StatusBadge）
src/proxy.ts           進入點限流
tests/e2e/             瀏覽器端對端測試
deploy/                VPS 部署檔、還原步驟
```

## 可複用的設計

- **`ActionForm`**：所有表單共用。處理送出中狀態、錯誤與成功訊息、二次確認、送出失敗時保留已填內容。新增表單只要寫欄位和一個回傳 `{ error }` 或 `{ ok }` 的 action。
- **`plans.ts`**：價格、人數上限、功能開關都在這裡。首頁定價區、帳單頁、後台的升級提示、功能鎖都讀同一份，改價不會漏改。
- **`billing.ts`**：金流商可替換。要加第三家（例如藍新），只需寫一個簽章／通訊檔和兩個回呼路由，呼叫 `recordPayment()`、`activatePlan()`。
- **`csv.ts`、`formdata.ts`**：匯出與表單解析各一份。
- **設計 token**：顏色、字體、按鈕與輸入框樣式定義在 `src/app/globals.css`，頁面只用類別名稱。

## 資料模型

`users` 1—1 `businesses` 1—N `services`、`staff`、`customers`、`bookings`、`hours`、`closed_dates`、`payments`。

刪除使用者會連帶刪除其店家與所有子資料（外鍵 `ON DELETE CASCADE`）。服務與人員的「刪除」是封存（`archived`），讓歷史預約仍能顯示名稱。

改資料表時，往 `db.ts` 的 `MIGRATIONS` 陣列尾端加一段 SQL；伺服器啟動時會自動依 `PRAGMA user_version` 套用還沒跑過的部分。

## 預約不會重複的原因

1. 時段查詢 `availableSlots()` 只列出該服務人員沒有重疊預約的時間。
2. 送出預約時，在同一個資料庫交易（`BEGIN IMMEDIATE`）內**重新計算一次**空檔再寫入。SQLite 同時間只允許一個寫入交易，所以兩個人同時搶同一格，後到的會被擋下並看到「這個時段剛剛被訂走了」。
3. 把「未到／已取消」改回有效狀態、以及改期，都會先檢查衝突。

## 開發流程

```bash
npm install
npm run dev            # http://localhost:3000，首頁可一鍵進示範店家
npm run check          # 型別 + 40 個單元／整合測試 + 建置
npm run build && npm run e2e   # 89 項瀏覽器端對端檢查
```

- 開發環境沒設金流金鑰時會進入「示範模式」（升級按鈕直接切換方案），沒設寄信金鑰時信件內容印在終端機並寫入 `mail_log` 表。
- GitHub Actions（`.github/workflows/ci.yml`）在每個 PR 與 main 分支跑同一套檢查。
- 程式慣例寫在根目錄的 `CLAUDE.md`，人和 AI 助手都照這份。

## 測試分層

| 層級 | 位置 | 涵蓋 |
| --- | --- | --- |
| 單元 | `src/lib/slots.test.ts` | 時段計算、日期工具 |
| 整合（記憶體資料庫） | `src/lib/booking.test.ts`、`ecpay.test.ts`、`ops.test.ts` | 撞期、額度、顧客資料保護、提醒、訂閱到期、綠界簽章與回呼、刪除帳號的連帶刪除 |
| 端對端（真實瀏覽器） | `tests/e2e/smoke.mjs`、`ecpay.mjs` | 註冊到刪除帳號的完整流程、營運後台、限流、安全標頭、綠界結帳表單與回呼 |

## 實測效能

在一台共用的開發容器上，用正式建置的單一行程、50 個並行連線測得：

| 請求 | 每秒處理量 | 中位數延遲 | 95 百分位 |
| --- | --- | --- | --- |
| 首頁（靜態） | 約 650 | 74 ms | 112 ms |
| 預約頁（伺服器渲染） | 約 200 | 232 ms | 313 ms |
| 時段查詢 API | 約 440 | 109 ms | 134 ms |

Lighthouse（手機）在首頁、預約頁、登入、註冊四頁的效能為 98–100 分，無障礙、最佳實務、SEO 皆為 100 分。

換算成實際流量：一位客人完成一次預約大約產生 1 次頁面載入加 3–5 次時段查詢。每秒 200 次頁面載入相當於每天上千萬次瀏覽，遠超過早期需求；真正的上限是單機的可用性，而不是處理量。
