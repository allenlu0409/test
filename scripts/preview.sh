#!/bin/sh
# 啟動驗收用的預覽環境：建置、放入驗收資料、以正式建置啟動伺服器。
# 用法：sh scripts/preview.sh [port]      （預設 3000；資料庫在 data/preview.db，刪掉它就能重來）
set -e
PORT="${1:-3000}"
[ -d node_modules ] || npm ci
[ -f .next/BUILD_ID ] || npm run build
export DATABASE_PATH="${DATABASE_PATH:-./data/preview.db}"
node --experimental-strip-types --no-warnings scripts/acceptance-seed.ts
# 預覽環境的設定：不收款的示範金流、可檢視信件、管理者不強制兩步驟驗證（正式環境會強制）
export DEMO_BILLING=1 DEV_MAILBOX=1 ADMIN_EMAILS=admin@yuehao.test ADMIN_REQUIRE_2FA=off INSECURE_COOKIES=1
# 只綁在本機：預覽環境的信件檢視頁不需登入，不能對外
exec npx next start -H 127.0.0.1 -p "$PORT"
