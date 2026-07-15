#!/usr/bin/env python3
"""Generate a valid source icon for `tauri icon` from Jambu brand icon mark."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "icons" / "icon.png"
SIZE = 512


def main() -> None:
    custom_icon = os.environ.get("BUNDLE_CUSTOM_ICON", "").strip().lower() in {"1", "true", "yes"}
    out = ROOT / "src-tauri" / "icons" / "icon.png"
    if custom_icon and out.is_file():
        print(f"[generate-icons] skipped — using client bundle icon at {out}")
        return

    brand_icon = ROOT / "public" / "brand" / "icon-light.png"
    if not brand_icon.is_file():
        raise SystemExit(f"[generate-icons] missing brand icon: {brand_icon}")

    icon = Image.open(brand_icon).convert("RGBA")
    icon = icon.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    icon.save(OUT, format="PNG")
    print(f"[generate-icons] wrote {OUT} from {brand_icon.name}")


if __name__ == "__main__":
    main()
