#!/usr/bin/env python3
"""從算好的 MP4 產生預覽：縮小的 GIF（方便在聊天室直接看）與分鏡總覽圖。

用法：python3 marketing/video/previews.py      （需要 ffmpeg 與 Pillow）
"""
import os
import subprocess
import tempfile

from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out")
PREVIEW = os.path.join(OUT, "preview")
os.makedirs(PREVIEW, exist_ok=True)

# 檔名、GIF 寬度與幀率、分鏡要抽的秒數、分鏡每格大小與欄數
VIDEOS = [
    ("reel-01", 360, 12, [1.2, 3.0, 4.8, 7.6, 10.4, 12.8, 15.2, 17.6, 21.5, 26], (360, 640), 5),
    ("reel-02", 360, 12, [1.0, 2.4, 4.4, 7.4, 9.4, 12.4, 14.8, 17.0, 19.6, 22.8], (360, 640), 5),
    ("reel-03", 360, 12, [1.0, 2.8, 5.4, 8.4, 11.4, 14.2, 17.0, 19.6, 22.2, 24.4], (360, 640), 5),
    ("walkthrough", 640, 8, [3, 5.2, 8.5, 12.5, 17, 23.5, 28.5, 33.5, 41, 47, 51, 57, 64, 69.5, 74.5, 79.5, 86, 91], (640, 360), 3),
]

for name, width, fps, times, (w, h), cols in VIDEOS:
    src = os.path.join(OUT, f"yuehao-{name}.mp4")
    colors = 128 if fps >= 12 else 96
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vf",
         f"fps={fps},scale={width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors={colors}[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
         os.path.join(PREVIEW, f"{name}-preview.gif")],
        check=True,
    )
    frames = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, t in enumerate(times):
            f = os.path.join(tmp, f"{i}.png")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t), "-i", src, "-frames:v", "1", "-vf", f"scale={w}:{h}", f], check=True)
            frames.append(Image.open(f).copy())
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (w + 12) + 12, rows * (h + 12) + 12), "#141a2b")
    for i, im in enumerate(frames):
        sheet.paste(im, (12 + (i % cols) * (w + 12), 12 + (i // cols) * (h + 12)))
    sheet.save(os.path.join(PREVIEW, f"{name}-storyboard.png"))
    print("preview:", name)
