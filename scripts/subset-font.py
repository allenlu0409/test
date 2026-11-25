#!/usr/bin/env python3
"""把 Noto Serif TC 裁成只含介面用到的字，輸出單一 woff2（自架，不依賴外部字體服務）。

用法：pip install fonttools brotli
      python3 scripts/subset-font.py /path/to/NotoSerifTC[wght].ttf
來源字體（SIL OFL 授權）：https://github.com/google/fonts/tree/main/ofl/notoseriftc
新增或修改標題文字後重跑一次；缺字時瀏覽器會退回系統明體，不會壞版。
"""
import glob, re, subprocess, sys

src = sys.argv[1]
CJK = r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]"
chars = set("約好了YUEHAOyuehaoNT$0123456789,.:/%+-–（）()！？、，。・｜「」／ ")

def take(text):
    chars.update(re.findall(CJK, text))

# 只收「會用明體顯示」的字，檔案才小：首頁全文、商標、各頁 h1、標了 font-display／stamp／seal 的元素、方案名稱
take(open("src/app/page.tsx", encoding="utf-8").read())
take(open("src/components/brand.tsx", encoding="utf-8").read())
for f in glob.glob("src/**/*.tsx", recursive=True):
    text = open(f, encoding="utf-8").read()
    for m in re.finditer(r"<h1[^>]*>(.*?)</h1>", text, re.S):
        take(m.group(1))
    for m in re.finditer(r'className="[^"]*(?:font-display|stamp|seal)[^"]*"[^>]*>(.*?)</', text, re.S):
        take(m.group(1))
for m in re.finditer(r'name: "([^"]+)"', open("src/lib/plans.ts", encoding="utf-8").read()):
    take(m.group(1))

# 先把可變字體固定在 900（標題用的字重），再裁字
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = instantiateVariableFont(TTFont(src), {"wght": 900})
font.save("/tmp/noto-serif-tc-900.ttf")
subprocess.run(
    ["pyftsubset", "/tmp/noto-serif-tc-900.ttf", f"--text={''.join(sorted(chars))}", "--flavor=woff2",
     "--output-file=src/fonts/noto-serif-tc-900-subset.woff2", "--layout-features=*", "--no-hinting"],
    check=True,
)
print(f"{len(chars)} glyphs requested")
