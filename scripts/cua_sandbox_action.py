#!/usr/bin/env python3
"""Deterministic CUA Sandbox actions for Runtime Console agents (ADR-049).

Agents must not invent SDK/browser discovery. Use:

  python3 scripts/cua_sandbox_action.py open-url --sandbox <name> --url <url>
  python3 scripts/cua_sandbox_action.py screenshot --sandbox <name> --out <path>
  python3 scripts/cua_sandbox_action.py shell --sandbox <name> --command "<cmd>"
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload), flush=True)


def default_screenshot_path(sandbox: str) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in sandbox)[:48]
    out_dir = Path(os.environ.get("CUA_SANDBOX_SCREENSHOT_DIR", ".")).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"sandbox-{safe}-{stamp}.png"


async def connect_sandbox(name: str, *, local: bool):
    from cua_sandbox import Sandbox

    return await Sandbox.connect(name, local=local)


async def run_shell(sb: Any, command: str, *, timeout_s: float = 60.0) -> dict[str, Any]:
    """Execute via Sandbox.shell.run (cua_sandbox API — not Sandbox.run)."""
    timeout = max(1, int(timeout_s))
    result = await sb.shell.run(command, timeout=timeout)
    stdout = getattr(result, "stdout", None) or (result.get("stdout") if isinstance(result, dict) else "")
    stderr = getattr(result, "stderr", None) or (result.get("stderr") if isinstance(result, dict) else "")
    exit_code = getattr(result, "returncode", None)
    if exit_code is None:
        exit_code = getattr(result, "exit_code", None)
    if exit_code is None and isinstance(result, dict):
        exit_code = result.get("returncode", result.get("exit_code"))
    return {
        "stdout": stdout if isinstance(stdout, str) else str(stdout or ""),
        "stderr": stderr if isinstance(stderr, str) else str(stderr or ""),
        "exit_code": exit_code if isinstance(exit_code, int) else 0,
    }


async def take_screenshot(sb: Any, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    data = await sb.screenshot()
    if isinstance(data, (bytes, bytearray)):
        out_path.write_bytes(bytes(data))
        return out_path
    if isinstance(data, str) and data.startswith("data:image"):
        encoded = data.split(",", 1)[1]
        out_path.write_bytes(base64.b64decode(encoded))
        return out_path
    if isinstance(data, str) and Path(data).is_file():
        Path(data).replace(out_path)
        return out_path
    if isinstance(data, dict) and isinstance(data.get("path"), str):
        Path(data["path"]).replace(out_path)
        return out_path
    raise RuntimeError(f"Unsupported screenshot return type: {type(data)!r}")


OPEN_URL_SCRIPT = r"""#!/usr/bin/env bash
set -euo pipefail
URL="${1:?url required}"
export DISPLAY="${DISPLAY:-:1}"
if command -v firefox >/dev/null 2>&1; then
  nohup firefox --new-window "$URL" >/tmp/jambu-sandbox-browser.log 2>&1 &
  echo "browser=firefox"
  exit 0
fi
if command -v chromium-browser >/dev/null 2>&1; then
  nohup chromium-browser --new-window "$URL" >/tmp/jambu-sandbox-browser.log 2>&1 &
  echo "browser=chromium-browser"
  exit 0
fi
if command -v chromium >/dev/null 2>&1; then
  nohup chromium --new-window "$URL" >/tmp/jambu-sandbox-browser.log 2>&1 &
  echo "browser=chromium"
  exit 0
fi
if command -v google-chrome >/dev/null 2>&1; then
  nohup google-chrome --new-window "$URL" >/tmp/jambu-sandbox-browser.log 2>&1 &
  echo "browser=google-chrome"
  exit 0
fi
echo "No supported browser found (firefox/chromium)" >&2
exit 127
"""


async def action_open_url(name: str, url: str, *, local: bool, out: Path | None) -> dict[str, Any]:
    sb = await connect_sandbox(name, local=local)
    try:
        encoded = base64.b64encode(OPEN_URL_SCRIPT.encode("utf-8")).decode("ascii")
        install_and_run = (
            f"echo {shlex.quote(encoded)} | base64 -d > /tmp/jambu-open-url.sh "
            f"&& chmod +x /tmp/jambu-open-url.sh "
            f"&& /tmp/jambu-open-url.sh {shlex.quote(url)}"
        )
        shell = await run_shell(sb, install_and_run, timeout_s=45.0)
        if shell["exit_code"] != 0:
            return {
                "status": "error",
                "sandbox": name,
                "url": url,
                "error": shell["stderr"] or shell["stdout"] or "Failed to open URL in sandbox browser",
                "exit_code": shell["exit_code"],
            }
        browser = "firefox"
        for line in shell["stdout"].splitlines():
            if line.startswith("browser="):
                browser = line.split("=", 1)[1].strip() or browser
        await asyncio.sleep(3.0)
        screenshot_path = out or default_screenshot_path(name)
        saved = await take_screenshot(sb, screenshot_path)
        return {
            "status": "ok",
            "sandbox": name,
            "url": url,
            "browser": browser,
            "screenshot_path": str(saved),
        }
    finally:
        await sb.disconnect()


async def action_screenshot(name: str, *, local: bool, out: Path | None) -> dict[str, Any]:
    sb = await connect_sandbox(name, local=local)
    try:
        screenshot_path = out or default_screenshot_path(name)
        saved = await take_screenshot(sb, screenshot_path)
        return {
            "status": "ok",
            "sandbox": name,
            "screenshot_path": str(saved),
        }
    finally:
        await sb.disconnect()


async def action_shell(
    name: str,
    command: str,
    *,
    local: bool,
    timeout_s: float,
    out: Path | None,
) -> dict[str, Any]:
    sb = await connect_sandbox(name, local=local)
    try:
        shell = await run_shell(sb, command, timeout_s=timeout_s)
        payload: dict[str, Any] = {
            "status": "ok" if shell["exit_code"] == 0 else "error",
            "sandbox": name,
            "command": command,
            "exit_code": shell["exit_code"],
            "stdout": shell["stdout"],
            "stderr": shell["stderr"],
        }
        if out is not None:
            saved = await take_screenshot(sb, out)
            payload["screenshot_path"] = str(saved)
        return payload
    finally:
        await sb.disconnect()


async def main_async() -> int:
    parser = argparse.ArgumentParser(description="CUA Sandbox deterministic actions (ADR-049)")
    sub = parser.add_subparsers(dest="action", required=True)

    open_url = sub.add_parser("open-url")
    open_url.add_argument("--sandbox", required=True)
    open_url.add_argument("--url", required=True)
    open_url.add_argument("--out", type=Path, default=None)
    open_url.add_argument("--remote", action="store_true")

    shot = sub.add_parser("screenshot")
    shot.add_argument("--sandbox", required=True)
    shot.add_argument("--out", type=Path, default=None)
    shot.add_argument("--remote", action="store_true")

    shell = sub.add_parser("shell")
    shell.add_argument("--sandbox", required=True)
    shell.add_argument("--command", required=True)
    shell.add_argument("--timeout", type=float, default=60.0)
    shell.add_argument("--out", type=Path, default=None)
    shell.add_argument("--remote", action="store_true")

    args = parser.parse_args()
    local = not bool(getattr(args, "remote", False))

    try:
        if args.action == "open-url":
            result = await action_open_url(args.sandbox, args.url, local=local, out=args.out)
        elif args.action == "screenshot":
            result = await action_screenshot(args.sandbox, local=local, out=args.out)
        else:
            result = await action_shell(
                args.sandbox,
                args.command,
                local=local,
                timeout_s=args.timeout,
                out=args.out,
            )
    except Exception as error:
        result = {
            "status": "error",
            "sandbox": getattr(args, "sandbox", None),
            "error": str(error),
        }

    emit(result)
    return 0 if result.get("status") == "ok" else 1


def main() -> None:
    raise SystemExit(asyncio.run(main_async()))


if __name__ == "__main__":
    main()
