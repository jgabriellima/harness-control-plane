#!/usr/bin/env python3
"""Ensure the SDLC cognitive trace server is running (fail-open).

Called from sessionStart (`.cursor/hooks/session-start.sh`) on every new Cursor
session. Probes `/api/health`, restarts a stale or missing listener, and returns
the dashboard URL for injection into session context.

Exit 0 always — session creation must not depend on trace availability.
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from _sdlc_paths import REPO_ROOT, SDLC_ROOT, load_sdlc_yaml

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 9473
HEALTH_TIMEOUT_S = 2.0
STARTUP_WAIT_S = 10.0
POLL_INTERVAL_S = 0.5

TRACE_DIR = SDLC_ROOT / "trace"
PID_FILE = TRACE_DIR / "trace-server.pid"
LOG_FILE = TRACE_DIR / "trace-server.log"
URL_FILE = TRACE_DIR / "dashboard.url"


def _trace_config() -> tuple[str, int]:
    runtime = load_sdlc_yaml().get("runtime") or {}
    trace = runtime.get("trace") if isinstance(runtime, dict) else None
    if not isinstance(trace, dict):
        trace = {}
    host = trace.get("host") if isinstance(trace.get("host"), str) else DEFAULT_HOST
    port_raw = trace.get("port")
    port = int(port_raw) if isinstance(port_raw, int) else DEFAULT_PORT
    env_host = os.environ.get("SDLC_TRACE_HOST")
    env_port = os.environ.get("SDLC_TRACE_PORT")
    if env_host:
        host = env_host
    if env_port:
        try:
            port = int(env_port)
        except ValueError:
            pass
    return host, port


def _dashboard_url(host: str, port: int) -> str:
    return f"http://{host}:{port}"


def _probe_health(host: str, port: int, expected_root: Path | None = None) -> dict[str, Any] | None:
    url = f"{_dashboard_url(host, port)}/api/health"
    started = time.monotonic()
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=HEALTH_TIMEOUT_S) as resp:
            elapsed_ms = (time.monotonic() - started) * 1000
            if resp.status != 200:
                return None
            body = json.loads(resp.read().decode("utf-8"))
            if not body.get("ok"):
                return None
            target_raw = body.get("targetDir")
            target = Path(str(target_raw)).resolve() if target_raw else None
            if expected_root is not None and target is not None:
                if target != expected_root.resolve():
                    return None
            return {
                "url": _dashboard_url(host, port),
                "elapsed_ms": elapsed_ms,
                "target_dir": str(target) if target is not None else str(target_raw or ""),
            }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError):
        return None


def _trace_cli_candidates() -> list[Path]:
    runtime = load_sdlc_yaml().get("runtime") or {}
    trace = runtime.get("trace") if isinstance(runtime.get("trace"), dict) else {}
    configured = trace.get("cli")
    candidates: list[Path] = []
    if isinstance(configured, str) and configured.strip():
        raw = Path(configured.strip())
        candidates.append(raw if raw.is_absolute() else REPO_ROOT / raw)
    candidates.extend(
        [
            REPO_ROOT / "node_modules" / ".bin" / "ai-native-sdlc",
            REPO_ROOT / "node_modules" / "@jambu" / "sdlc-trace-server" / "dist" / "cli.js",
            REPO_ROOT / "packages" / "ai-native-sdlc" / "dist" / "cli.js",
            REPO_ROOT.parent / "ai-native-sdlc" / "packages" / "ai-native-sdlc" / "dist" / "cli.js",
            REPO_ROOT.parent / "ai-native-sdlc-observer" / "packages" / "trace-server" / "dist" / "cli.js",
        ],
    )
    return candidates


def _resolve_trace_cli() -> list[str] | None:
    override = os.environ.get("SDLC_TRACE_CLI")
    if override:
        parts = override.split()
        return parts if parts else None

    for path in _trace_cli_candidates():
        if not path.is_file():
            continue
        if path.suffix == ".js":
            return ["node", str(path)]
        return [str(path)]

    which = subprocess.run(
        ["bash", "-lc", "command -v ai-native-sdlc"],
        capture_output=True,
        text=True,
        timeout=3,
    )
    if which.returncode == 0 and which.stdout.strip():
        return [which.stdout.strip()]
    return None


def _read_pid() -> int | None:
    if not PID_FILE.is_file():
        return None
    try:
        pid = int(PID_FILE.read_text(encoding="utf-8").strip())
    except ValueError:
        return None
    try:
        os.kill(pid, 0)
    except OSError:
        return None
    return pid


def _free_port(port: int) -> None:
    """Terminate any process listening on *port* (best-effort, fail-open)."""
    pids: set[int] = set()
    try:
        out = subprocess.check_output(
            ["lsof", "-ti", f":{port}"],
            text=True,
            timeout=3,
            stderr=subprocess.DEVNULL,
        )
        for line in out.splitlines():
            line = line.strip()
            if line.isdigit():
                pids.add(int(line))
    except (subprocess.SubprocessError, FileNotFoundError, ValueError):
        pass

    if not pids:
        try:
            subprocess.run(
                ["fuser", "-k", f"{port}/tcp"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
                check=False,
            )
            time.sleep(0.25)
            return
        except (subprocess.SubprocessError, FileNotFoundError):
            return

    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            continue
    time.sleep(0.35)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            continue
    time.sleep(0.2)


def _spawn_server(cli: list[str], target: Path, host: str, port: int) -> int | None:
    TRACE_DIR.mkdir(parents=True, exist_ok=True)
    cmd = [*cli, "trace", "--target", str(target), "--host", host, "--port", str(port), "--no-open"]
    log_handle = LOG_FILE.open("a", encoding="utf-8")
    log_handle.write(f"\n--- trace ensure spawn {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} ---\n")
    log_handle.flush()
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(REPO_ROOT),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    except OSError:
        log_handle.close()
        return None
    log_handle.close()
    PID_FILE.write_text(str(proc.pid), encoding="utf-8")
    return proc.pid


def ensure_trace_server() -> dict[str, Any]:
    host, port = _trace_config()
    target = REPO_ROOT

    TRACE_DIR.mkdir(parents=True, exist_ok=True)

    healthy = _probe_health(host, port, target)
    if healthy:
        URL_FILE.write_text(f"{healthy['url']}\n", encoding="utf-8")
        return {
            "status": "running",
            "url": healthy["url"],
            "host": host,
            "port": port,
            "target_dir": str(target),
            "pid": _read_pid(),
        }

    cli = _resolve_trace_cli()
    foreign = _probe_health(host, port, expected_root=None)

    reason = "not_running"
    if _read_pid() is not None:
        reason = "stale_pid"
    elif foreign is not None:
        reason = "wrong_listener"

    if foreign is not None and not cli:
        URL_FILE.write_text(f"{foreign['url']}\n", encoding="utf-8")
        return {
            "status": "running_foreign",
            "url": foreign["url"],
            "host": host,
            "port": port,
            "target_dir": foreign.get("target_dir"),
            "message": (
                f"trace server serves {foreign.get('target_dir')} — "
                "install ai-native-sdlc CLI or set runtime.trace.cli for this repo"
            ),
        }

    if not cli:
        return {
            "status": "unavailable",
            "url": None,
            "message": (
                "trace server unavailable — install @jambu/sdlc-trace-server "
                "or run: npx @jambu/ai-native-sdlc trace"
            ),
            "host": host,
            "port": port,
        }

    _free_port(port)
    if PID_FILE.is_file():
        try:
            PID_FILE.unlink()
        except OSError:
            pass

    pid = _spawn_server(cli, target, host, port)
    if pid is None:
        return {
            "status": "unavailable",
            "url": None,
            "message": "failed to spawn trace server process",
            "host": host,
            "port": port,
        }

    deadline = time.monotonic() + STARTUP_WAIT_S
    while time.monotonic() < deadline:
        healthy = _probe_health(host, port, target)
        if healthy:
            URL_FILE.write_text(f"{healthy['url']}\n", encoding="utf-8")
            return {
                "status": "started",
                "url": healthy["url"],
                "host": host,
                "port": port,
                "target_dir": str(target),
                "pid": pid,
                "reason": reason,
            }
        time.sleep(POLL_INTERVAL_S)

    return {
        "status": "unavailable",
        "url": None,
        "message": f"trace server did not become healthy within {STARTUP_WAIT_S}s (see {LOG_FILE})",
        "host": host,
        "port": port,
        "pid": pid,
        "reason": reason,
    }


def _port_open(host: str, port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex((host, port)) == 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Ensure SDLC cognitive trace server is running")
    parser.add_argument("--json", action="store_true", help="Emit result JSON on stdout")
    args = parser.parse_args()

    result = ensure_trace_server()
    if args.json:
        print(json.dumps(result))
    else:
        if result.get("url"):
            print(result["url"])
        elif result.get("message"):
            print(result.get("message", "unavailable"), file=sys.stderr)


if __name__ == "__main__":
    main()
