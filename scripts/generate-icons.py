#!/usr/bin/env python3
"""Generate a valid source icon for `tauri icon` from Jambu brand icon mark."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BRAND_ICON = ROOT / "public" / "brand" / "icon-light.png"
OUT = ROOT / "src-tauri" / "icons" / "icon.png"
SIZE = 512


def main() -> None:
    if not BRAND_ICON.is_file():
        raise SystemExit(f"[generate-icons] missing brand icon: {BRAND_ICON}")

    icon = Image.open(BRAND_ICON).convert("RGBA")
    icon = icon.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    icon.save(OUT, format="PNG")
    print(f"[generate-icons] wrote {OUT} from {BRAND_ICON.name}")


if __name__ == "__main__":
    main()
