# 約好 Yuehao — 開發須知

多租戶線上預約 SaaS。Next.js 16（App Router、Server Actions）＋ React 19 ＋ Tailwind 4 ＋ `node:sqlite`。完整說明見 `docs/`。

## 指令

- `npm run dev`：開發伺服器
- `npm run check`：型別檢查 + 單元／整合測試 + 建置（提交前必跑）
- `npm run e2e`：瀏覽器端對端測試（需先 `npm run build`；需要 Playwright）

## 架構規則

- **商業規則放 `src/lib/`，而且不能 import `next/*`**（`auth.ts`、`client-ip.ts` 例外）。這樣才能用 `node --test` 直接測。lib 內互相 import 要寫 `.ts` 副檔名。
- **每個查詢都要帶 `business_id`**。後台的 server action 一律先呼叫 `requireBusiness()`，再用它回傳的 `biz.id` 當條件；不可信任表單傳來的店家或擁有者 id。
- **方案限制只定義在 `src/lib/plans.ts`**，功能判斷用 `planOf(biz.plan).xxx`，不要在頁面寫死方案名稱。
- **方案的啟用、續期、降級只走 `src/lib/billing.ts`**；金流商各自的檔案（`ecpay*.ts`、`stripe.ts`）只負責簽章與通訊。
- **寄信只走 `sendMail()`**，失敗不可影響主要流程；在請求中寄信用 `after()`。
- **改資料表**：往 `db.ts` 的 `MIGRATIONS` 陣列尾端加一段 SQL，不要改既有的項目。
- 日期一律是商家時區的 `'YYYY-MM-DD'` 字串加「當日第幾分鐘」；資料庫的 `created_at` 是 UTC，兩者比較要用 `localMidnightUtc()`。

## UI 規則

視覺概念是**紙本預約本**：藍色原子筆字跡（`brand`）、螢光筆（`sun`，`.hl`）、紅色印章（`seal`，`.seal`／`.stamp`）、淡藍格線（`line`）。新畫面先想「這在預約本、價目表或收據上會長什麼樣」。

- 形狀方正：圓角 2–4px、用 1px 線條分隔，不用陰影、漸層、膠囊按鈕、大圓角卡片。並列的數字用一張表格加分隔線，不要一格一張卡片。
- 標題用明體（`h1` 自動套用，其他加 `.font-display`）。字體檔只含介面用到的字：**店名、人名等使用者輸入的文字要加 `font-sans`**；新增標題文字後重跑 `python3 scripts/subset-font.py <NotoSerifTC 字體檔>`。
- 紅色只留給印章、取消與錯誤；螢光筆只標一個重點。不要拿來當裝飾。
- 靠左對齊為主，不要整段置中。不放沒有根據的社會認同文案（「最多人選擇」之類）。
- 表單一律用 `<ActionForm>`（`src/components/form.tsx`）：action 回傳 `{ error }` 或 `{ ok }`，不要 throw。
- 樣式用 `globals.css` 的 token 與元件類別（`btn`、`input`、`label`、`panel`、`badge`），不要寫死色碼。
- 危險操作（取消、刪除）用 `confirmText` 做二次確認。
- 文案用台灣繁體中文，站在店家或客人的角度寫，講具體的事，錯誤訊息要說明怎麼解決。

## 測試

- 新的商業規則要有 `src/lib/*.test.ts`（用 `:memory:` 資料庫）。
- 修 bug 先寫會失敗的測試。
- 會影響使用者流程的改動，在 `tests/e2e/` 補一個檢查。
