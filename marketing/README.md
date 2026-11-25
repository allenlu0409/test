# 行銷影片

| 檔案 | 規格 | 用途 |
| --- | --- | --- |
| `out/yuehao-reel-01.mp4` | 直式 1080×1920、26.8 秒、30fps | Instagram Reels、TikTok、YouTube Shorts |
| `out/yuehao-walkthrough.mp4` | 橫式 1920×1080、93 秒、30fps | 完整使用流程：放首頁、傳給店家、YouTube |

兩支都**沒有配樂和旁白**（只有一條靜音音軌）。發 Reels 時請在 IG 裡加音樂，用平台內建的曲庫才不會有版權問題。

## Reels 發文可以搭配的文字

> 還在一邊上染劑一邊回訊息喬時間？
> 開一個預約頁，客人自己選服務、選時間，約好了你才收到通知。
> 一個人的店免費用，不用綁卡。連結在個人檔案。
>
> #美髮 #美甲 #美睫 #預約制 #工作室 #設計師日常 #預約系統

Reels 結尾寫的是「連結在個人檔案」，發之前記得把網站連結放到 IG 個人檔案。

## 影片是怎麼做的

畫面全部是產品的真實截圖，動畫用 HTML／CSS 寫成時間軸，再逐格算成 MP4。改文案、換畫面、調時間都不需要剪輯軟體。

```
video/capture.mjs      啟動產品、拍下各個畫面 → video/assets/
video/base.css         共用的動畫元件（進場、螢光筆、印章、手機框、鏡頭）
video/reel.html        Reels 的分鏡
video/walkthrough.html 使用影片的分鏡
video/render.mjs       逐格算圖 + ffmpeg 編碼
```

重新產出：

```bash
npm run build
npm run video:capture     # 介面有改才需要重拍
npm run video:render      # 算出兩支影片
```

需要：Playwright、ffmpeg（含 libx264）、系統安裝 Noto Sans TC 與 Noto Serif TC 字體。

## 怎麼改

- **改文字**：直接改 `.html` 裡的字。
- **改時間**：每個元素的 `--t` 是出現的秒數，場景的 `--at`／`--len` 是開始時間與長度；影片總長在 `<meta name="video">`。
- **只看某一格**：`node marketing/video/render.mjs marketing/video/reel.html x --still 12.5 frame.png`
- **再做一支 Reels**：複製 `reel.html` 改分鏡即可，元件都在 `base.css`。

截圖裡的預約頁網址顯示為「你的網域/b/mumu-hair」。有了正式網域後，改 `capture.mjs` 裡那一行再重拍。
