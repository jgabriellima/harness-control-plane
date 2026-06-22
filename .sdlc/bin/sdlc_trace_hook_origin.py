#!/usr/bin/env python3
"""Record where Cursor hooks last executed — compared by trace-ui for mismatch warnings."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

BIN_DIR = Path(__file__).resolve().parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from _sdlc_paths import REPO_ROOT, SDLC_ROOT  # noqa: E402

ORIGIN_FILE = SDLC_ROOT / "trace" / "hook-origin.json"


def _git(cwd: Path, *args: str) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", *args],
            cwd=str(cwd),
            stderr=subprocess.DEVNULL,
            timeout=3,
            text=True,
        )
        return out.strip() or None
    except (subprocess.SubprocessError, OSError, ValueError):
        return None


def record_hook_origin(*, source: str, cwd: Path | None = None) -> dict:
    hook_cwd = (cwd or Path(os.getcwd())).resolve()
    script_root = REPO_ROOT.resolve()
    git_toplevel = _git(hook_cwd, "rev-parse", "--show-toplevel")
    branch = _git(hook_cwd, "branch", "--show-current")
    commit = _git(hook_cwd, "rev-parse", "--short", "HEAD")

    payload = {
        "source": source,
        "hook_cwd": str(hook_cwd),
        "hook_script_root": str(script_root),
        "trace_target_dir": str(script_root),
        "git_toplevel": str(Path(git_toplevel).resolve()) if git_toplevel else None,
        "git_branch": branch,
        "git_commit_short": commit,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    ORIGIN_FILE.parent.mkdir(parents=True, exist_ok=True)
    ORIGIN_FILE.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Record Cursor hook execution origin for trace-ui")
    parser.add_argument("--source", required=True, help="Hook source label (sessionStart, hook_handler, …)")
    parser.add_argument("--cwd", help="Override hook working directory")
    parser.add_argument("--json", action="store_true", help="Print payload JSON")
    args = parser.parse_args()

    cwd = Path(args.cwd).resolve() if args.cwd else None
    payload = record_hook_origin(source=args.source, cwd=cwd)
    if args.json:
        print(json.dumps(payload))


if __name__ == "__main__":
    main()
