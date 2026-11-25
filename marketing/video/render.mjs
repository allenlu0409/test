// 把一支 HTML 動畫逐格算成 MP4。
// 用法：node marketing/video/render.mjs marketing/video/reel.html out.mp4 [--from 3 --to 6] [--still 4.2 frame.png]
// 影片規格寫在 HTML 的 <meta name="video" content="寬x高@fps/秒數">。
// 需要：Playwright（chromium）、ffmpeg（libx264）、系統已安裝 Noto Sans TC 與 Noto Serif TC。
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const [html, out, ...rest] = process.argv.slice(2);
const opt = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);

const browser = await chromium.launch();
const probe = await browser.newPage();
await probe.goto(pathToFileURL(path.resolve(html)).href);
const spec = await probe.locator('meta[name="video"]').getAttribute("content");
await probe.close();
const [, W, H, FPS, DUR] = spec.match(/^(\d+)x(\d+)@(\d+)\/([\d.]+)$/).map(Number);

const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
await page.goto(pathToFileURL(path.resolve(html)).href);
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  window.__anims = document.getAnimations();
  for (const a of window.__anims) a.pause();
  window.__seek = (ms) => {
    for (const a of window.__anims) a.currentTime = ms;
  };
});
const frameAt = async (sec, type = "jpeg") => {
  await page.evaluate((ms) => window.__seek(ms), sec * 1000);
  return page.screenshot(type === "png" ? { type: "png" } : { type: "jpeg", quality: 95 });
};

if (opt("--still")) {
  const fs = await import("node:fs");
  fs.writeFileSync(rest[rest.indexOf("--still") + 2], await frameAt(Number(opt("--still")), "png"));
} else {
  const from = Number(opt("--from") ?? 0);
  const to = Number(opt("--to") ?? DUR);
  const ff = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
     // 加一條靜音音軌：有些平台會拒收沒有音軌的影片
     "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-shortest",
     "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
     "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const total = Math.round((to - from) * FPS);
  for (let i = 0; i < total; i++) {
    const buf = await frameAt(from + i / FPS);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 150 === 0) console.log(`  ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log(`wrote ${out} (${W}x${H}, ${(to - from).toFixed(1)}s)`);
}
await browser.close();
