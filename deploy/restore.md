# 還原資料庫

備份檔在資料磁碟的 `backups/yuehao-YYYY-MM-DD.db`，每天一份、保留 7 份（`BACKUP_KEEP` 可調）。

1. 停止服務（Fly：`fly scale count 0`；Docker：`docker compose stop app`）。
2. 把要還原的備份覆蓋成正式檔，並刪掉舊的 WAL 檔：
   ```sh
   cp /data/backups/yuehao-2026-11-25.db /data/yuehao.db
   rm -f /data/yuehao.db-wal /data/yuehao.db-shm
   ```
3. 啟動服務（`fly scale count 1` 或 `docker compose start app`），開 `/api/health` 確認回 `{"ok":true}`。

還原後，備份時間點之後的預約會消失。請到金流後台核對這段期間的收款，並通知受影響的店家。
