#!/usr/bin/env python3
"""Generate a valid source icon for `tauri icon` (replaces corrupt placeholder PNGs)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "icons" / "icon.png"

# Jambu control plane — dark slate + accent bar (placeholder brand)
BG = (15, 23, 42, 255)
ACCENT = (56, 189, 248, 255)
SIZE = 512


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)
    margin = SIZE // 8
    draw.rounded_rectangle(
        (margin, margin, SIZE - margin, SIZE - margin),
        radius=SIZE // 10,
        outline=ACCENT,
        width=max(8, SIZE // 32),
    )
    bar_w = SIZE // 5
    draw.rectangle(
        (SIZE // 2 - bar_w // 2, SIZE // 3, SIZE // 2 + bar_w // 2, 2 * SIZE // 3),
        fill=ACCENT,
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, format="PNG")
    print(f"[generate-icons] wrote {OUT}")


if __name__ == "__main__":
    main()
