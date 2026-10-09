"""Arrange the captured workspaces without changing their colors or content."""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


directory = Path(__file__).resolve().parent
report = json.loads((directory / "contrast-report.json").read_text(encoding="utf-8"))
font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 23)
small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 17)
title = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 30)
tile_width, tile_height = 768, 432
margin, gap, label_height = 24, 20, 42
header_height = 100
sheet = Image.new(
    "RGB",
    (margin * 2 + tile_width * 2 + gap, header_height + (tile_height + label_height + gap) * 4),
    "#ececec",
)
draw = ImageDraw.Draw(sheet)
draw.text((margin, 16), "嘟嘟 Desk · 八套主题", font=title, fill="#333333")
draw.text((margin, 60), "同一会话与布局 · 实际工作台截图 · 2026-10-09", font=small, fill="#606060")

for index, palette in enumerate(report["palettes"]):
    x = margin + (index % 2) * (tile_width + gap)
    y = header_height + (index // 2) * (tile_height + label_height + gap)
    draw.text((x, y + 4), palette["name"], font=font, fill="#333333")
    with Image.open(directory / f"{palette['id']}-calm.jpg") as screenshot:
        thumbnail = screenshot.resize((tile_width, tile_height), Image.Resampling.LANCZOS)
        sheet.paste(thumbnail, (x, y + label_height))

target = directory / "palette-overview.jpg"
sheet.save(target, quality=94, subsampling=0)
print(target)
