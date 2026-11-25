# 部署與對外開放

> 本文的價格是 2026 年 11 月查到的參考值，多數來自搜尋結果而非逐一核對官網，下單前請以各家官網為準。

## 架站選擇

這個產品需要「一台一直開著、有持久化磁碟的主機」。Vercel、Cloudflare Pages 這類無狀態平台不適用。

| 方案 | 月費（參考） | 適合 | 注意 |
| --- | --- | --- | --- |
| **Fly.io 東京（建議起步用）** | 512 MB 機器約 US$4，1 GB 磁碟 US$0.15 | 不想管主機；用指令就能部署與回滾 | 已無免費額度；需信用卡 |
| VPS（Vultr 東京等）+ Docker | 1 vCPU／1 GB 約 US$5–6 | 想完全掌控、成本最固定 | 系統更新、防火牆要自己管 |
| Zeabur | 開發者方案 US$5 起，依用量計 | 想要中文介面與台灣團隊支援 | 是否有台灣區域未能確認 |

建議從 **Fly.io 東京**開始：專案已附 `fly.toml`，延遲對台灣使用者夠低，之後要搬到 VPS 只需搬一個資料庫檔案。

## 上線步驟（Fly.io）

事前準備：網域一個、Fly.io 帳號、Resend 帳號、綠界商店代號與金鑰。

```bash
# 1. 建立應用程式與磁碟
fly launch --no-deploy --copy-config        # 把 fly.toml 的 app 名稱改成你的
fly volumes create data --region nrt --size 1

# 2. 設定機密（不會進版控）
fly secrets set \
  APP_URL=https://你的網域 \
  ADMIN_EMAILS=你的Email OPERATOR_NAME="你的公司或姓名" SUPPORT_EMAIL=客服信箱 \
  ECPAY_MERCHANT_ID=... ECPAY_HASH_KEY=... ECPAY_HASH_IV=... \
  RESEND_API_KEY=... MAIL_FROM="約好 <noreply@你的網域>" \
  CRON_SECRET=$(openssl rand -hex 24)

# 3. 部署
fly deploy

# 4. 綁定網域與憑證
fly certs add 你的網域
```

接著：

1. **DNS**：在網域商或 Cloudflare 把網域指向 Fly 給的位址（`fly certs show 你的網域` 會列出要加的紀錄）。
2. **寄信網域驗證**：在 Resend 新增你的網域，把它給的 SPF、DKIM 紀錄加到 DNS。沒做這步，信會進垃圾信匣。
3. **綠界後台**：確認商店已開通信用卡定期定額。回呼網址由程式帶在每筆訂單裡（`/api/ecpay/notify`、`/api/ecpay/period`），不需在後台另外設定。
4. **建立你的管理者帳號**：用 `ADMIN_EMAILS` 裡的 Email 在網站上註冊，點信中的驗證連結，之後開 `/admin` 就是營運後台。
5. **開啟異地備份**：在 GitHub repo 的 Settings → Secrets 設定 `APP_URL`、`CRON_SECRET`（與正式站相同）、`BACKUP_PASSPHRASE`。
6. **驗收**：照本文最後的「上線前檢查表」跑一遍。

之後每次更新：`git pull && fly deploy`。出問題時 `fly releases` 找上一版，`fly deploy --image <上一版映像>` 回滾。

## 上線步驟（VPS + Docker）

```bash
# 主機上（Ubuntu 24.04，已安裝 Docker）
git clone <你的 repo> yuehao && cd yuehao/deploy
cp ../.env.example .env && nano .env        # 填入 APP_URL、ADMIN_EMAILS、金流與寄信金鑰
DOMAIN=你的網域 docker compose up -d --build
```

Caddy 會自動申請並續期 HTTPS 憑證。防火牆只開 22、80、443。更新時 `git pull && DOMAIN=你的網域 docker compose up -d --build`。

## 網域、DNS、CDN

- **網域**：`.com` 約 US$11／年；`.tw` 約 NT$800／年（`.com.tw` 需公司登記）。
- **Cloudflare 免費方案**（建議）：把網域的 DNS 代管過去並開啟代理，可得到 CDN、基本 DDoS 防護與一條免費的限流規則。開啟代理後把環境變數 `CLIENT_IP_HEADER` 設為 `cf-connecting-ip`（Fly 上原本是 `fly-client-ip`），應用程式的限流才看得到真實 IP。
- SSL 模式選「完全（嚴格）」。

## 環境變數總表

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `APP_URL` | 是 | 對外網址（含 https）。金流回呼與信件連結都用它 |
| `ADMIN_EMAILS` | 是 | 可進營運後台的帳號，逗號分隔。該帳號需完成信箱驗證 |
| `OPERATOR_NAME`、`SUPPORT_EMAIL` | 是 | 營運者名稱與客服信箱，顯示在服務條款與隱私權政策 |
| `DATABASE_PATH` | 是 | SQLite 檔案位置，必須在持久化磁碟上 |
| `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV` | 收款必填 | 綠界商店資料。設了就以綠界收款 |
| `ECPAY_STAGE` | 否 | 設 `1` 使用綠界測試環境 |
| `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PRICE_PRO`、`STRIPE_PRICE_BUSINESS` | 否 | 有海外公司時可改用 Stripe（未設綠界時才會生效） |
| `RESEND_API_KEY`、`MAIL_FROM` | 寄信必填 | 沒設時信件只寫進資料庫，不會寄出 |
| `CLIENT_IP_HEADER` | 建議 | 反向代理放真實 IP 的標頭名稱 |
| `API_RATE_PER_MINUTE` | 否 | 每個 IP 每分鐘可呼叫公開 API 的次數，預設 120 |
| `BACKUP_KEEP`、`BACKUP_DIR` | 否 | 每日備份保留份數（預設 7）與位置（預設資料庫旁的 `backups/`） |
| `CRON_SECRET` | 建議 | 異地備份（GitHub Actions）拉取快照用的密鑰 |
| `DISABLE_INTERNAL_CRON` | 否 | 改用外部排程呼叫 `/api/cron/reminders` 時設 `1` |
| `DEMO_ENABLED` | 否 | 設 `off` 關閉首頁的示範後台入口 |
| `DEMO_BILLING` | 否 | 設 `1` 允許不收款切換方案。**正式環境不要設** |

## 金流開通

**綠界（台灣的個人或公司）**

1. 到綠界官網註冊會員並申請信用卡收款。個人會員即可收信用卡（搜尋到的費率為 2.75%，每筆最低 NT$5，每月收款上限約 NT$30 萬）；定期定額是否預設開通請向綠界確認。
2. 先用測試環境驗證：設 `ECPAY_STAGE=1`，商店代號 `3002607`、HashKey `pwFHCqoQZGmho4w6`、HashIV `EkRm7iFT261dpevs`，測試卡號 `4311-9522-2222-2222`、任意未過期的有效期限與安全碼、簡訊驗證碼 `1234`。
3. 走一遍「升級 → 付款 → 帳單頁顯示專業版」，再到營運後台確認出現一筆收款。
4. 換成正式的商店代號與金鑰，移除 `ECPAY_STAGE`。

程式已用綠界官方的三組測試向量驗證簽章演算法，也模擬過回呼流程；但本開發環境連不到綠界，**真實的測試環境付款尚未跑過**，第 2–3 步務必親自做一次。年繳（付 10 個月用 12 個月）使用綠界的每年扣款，同樣請用測試卡走一次。

**發票**：台灣營業人收款需開立統一發票。目前程式只記錄收款，不會自動開發票。初期可在綠界後台手動開立，或請會計處理；量大後再串接綠界電子發票 API。

## 上線前檢查表

- [ ] `https://你的網域/api/health` 回 `{"ok":true}`
- [ ] 用手機完成一次真實預約，店家與客人都收到信（不在垃圾信匣）
- [ ] 忘記密碼信能收到、連結可用
- [ ] 用綠界測試卡完成升級，營運後台出現收款紀錄；再測取消訂閱
- [ ] `/admin` 只有你的帳號進得去（用另一個帳號開應得到 404）
- [ ] 營運後台按「立即備份」成功，並實際照 `deploy/restore.md` 演練一次還原
- [ ] `/terms`、`/privacy` 開頭顯示你的營運者名稱與客服信箱
- [ ] GitHub Actions 的 Offsite backup 手動執行一次成功，並試著解密
- [ ] 正式環境沒有設 `DEMO_BILLING`
- [ ] 設定對 `/api/health` 的外部監控（UptimeRobot 等免費服務即可），故障時通知你的手機
- [ ] 決定客服管道（Email 或 LINE 官方帳號），放進頁尾與條款
