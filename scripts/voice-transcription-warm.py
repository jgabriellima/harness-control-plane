#!/usr/bin/env python3
"""Download and warm the faster-whisper model; updates status.json with progress."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def write_status(status_path: Path, **fields: object) -> None:
    current: dict[str, object] = {}
    if status_path.exists():
        try:
            current = json.loads(status_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            current = {}

    current.update(fields)
    current["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: warm.py <status.json> <model>", file=sys.stderr)
        return 2

    status_path = Path(sys.argv[1])
    model = sys.argv[2].strip() or "base"

    write_status(
        status_path,
        status="provisioning",
        ready=False,
        phase="model",
        progress=52,
        message=f"Downloading speech model ({model})…",
    )

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        snapshot_download = None

    repo_id = f"Systran/faster-whisper-{model}"

    if snapshot_download is not None:
        write_status(status_path, progress=58, message=f"Fetching {repo_id} from Hugging Face…")
        snapshot_download(repo_id=repo_id)
        write_status(status_path, progress=78, message="Loading speech model into memory…")
    else:
        write_status(status_path, progress=65, message="Loading speech model…")

    from faster_whisper import WhisperModel

    WhisperModel(model, device="cpu", compute_type="int8")

    write_status(
        status_path,
        status="ready",
        ready=True,
        phase="ready",
        progress=100,
        message=None,
    )
    print("ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
