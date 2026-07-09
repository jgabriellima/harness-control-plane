#!/usr/bin/env python3
"""Resolve CUA Sandbox noVNC URL for Runtime Console preview (VNC stream — not screenshots)."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any
from urllib.parse import quote


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload), flush=True)


def check_docker_daemon() -> dict[str, Any]:
    import shutil
    import subprocess

    if shutil.which("docker") is None:
        return {
            "id": "docker_daemon",
            "ok": False,
            "message": "Docker is not installed on this machine",
            "remediation": "Install Docker Desktop from https://www.docker.com/products/docker-desktop/ — Sandbox mode requires a local Docker engine.",
            "failure_kind": "docker_not_installed",
        }

    try:
        ps = subprocess.run(
            ["docker", "ps", "-q"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
        combined = f"{ps.stdout}\n{ps.stderr}".strip()
        if "cannot connect" in combined.lower() or "is the docker daemon running" in combined.lower():
            raise subprocess.CalledProcessError(1, "docker ps", combined)

        version = subprocess.run(
            ["docker", "version", "--format", "{{.Server.Version}}"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
        server_version = version.stdout.strip()
        return {
            "id": "docker_daemon",
            "ok": True,
            "message": f"Docker {server_version} — daemon running"
            if server_version
            else "Docker daemon running",
        }
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as error:
        detail = str(error)
        if hasattr(error, "stderr") and isinstance(error.stderr, str):
            detail = f"{detail} — {error.stderr.strip()}"
        daemon_down = "cannot connect" in detail.lower() or "is the docker daemon running" in detail.lower()
        return {
            "id": "docker_daemon",
            "ok": False,
            "message": "Docker is installed but the daemon is not running"
            if daemon_down
            else "Docker daemon is not reachable",
            "remediation": "Start Docker Desktop and wait until it reports Engine running, then retry Sandbox mode."
            if daemon_down
            else "Verify Docker Desktop is installed, running, and your user can access the Docker socket.",
            "failure_kind": "docker_daemon_down",
            "detail": detail,
        }


def check_cua_sandbox_python() -> dict[str, Any]:
    try:
        from cua_sandbox import Sandbox  # noqa: F401

        return {
            "id": "cua_sandbox_python",
            "ok": True,
            "message": "cua_sandbox Python package available",
        }
    except Exception as error:
        return {
            "id": "cua_sandbox_python",
            "ok": False,
            "message": "cua_sandbox Python package is not installed",
            "remediation": "Install the CUA sandbox SDK: pip install cua",
            "detail": str(error),
        }


def check_cua_api_key() -> dict[str, Any]:
    import os

    if os.environ.get("CUA_API_KEY", "").strip():
        return {"id": "cua_api_key", "ok": True, "message": "CUA_API_KEY is set"}
    return {
        "id": "cua_api_key",
        "ok": False,
        "message": "CUA_API_KEY is not set",
        "remediation": "Export CUA_API_KEY from the cua.ai dashboard or use local Docker sandbox.",
    }


def run_preflight(*, local: bool) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    if local:
        checks.extend([check_docker_daemon(), check_cua_sandbox_python()])
    else:
        checks.extend([check_cua_api_key(), check_cua_sandbox_python()])

    failed = [check for check in checks if not check.get("ok")]
    if failed:
        primary = failed[0]
        remediation = primary.get("remediation")
        summary = primary.get("message", "Sandbox pre-flight failed")
        if remediation:
            summary = f"{summary}. {remediation}"
        return {"status": "error", "checks": checks, "error": summary}

    return {"status": "ready", "checks": checks, "message": "Sandbox pre-flight passed"}


def build_local_novnc_url(host: str, vnc_port: int, password: str | None = None) -> str:
    query = "autoconnect=1&resize=scale&scale=1&show_dot=true&view_only=0"
    if password:
        query = f"{query}&password={quote(password)}"
    return f"http://{host}:{vnc_port}/vnc.html?{query}"


def sandbox_names_equivalent(name_a: str, name_b: str) -> bool:
    """Compare jambu-cua-X and jambu-cua-v-X as equivalent (SDK may assign a version prefix)."""

    def _strip_prefix(n: str) -> str:
        n = n.strip().lower()
        for prefix in ("jambu-cua-v-", "jambu-cua-"):
            if n.startswith(prefix):
                return n[len(prefix):]
        return n

    return _strip_prefix(name_a) == _strip_prefix(name_b)


async def resolve_vnc_url(name: str, *, local: bool) -> dict[str, Any]:
    from cua_sandbox import Sandbox

    try:
        sb = await Sandbox.connect(name, local=local)
        try:
            for share in (False, True):
                try:
                    url = await sb.get_display_url(share=share)
                    if url.startswith("http"):
                        return {
                            "status": "ready",
                            "vnc_url": url,
                            "source": "sdk_display_url",
                            "sandbox_name": name,
                        }
                except NotImplementedError:
                    continue
        finally:
            await sb.disconnect()
    except Exception as error:
        emit({"phase": "vnc_connecting", "message": f"SDK connect: {error!s}"})

    from cua_sandbox import sandbox_state

    state = sandbox_state.load(name)
    if not state:
        return {"status": "error", "error": f"Sandbox '{name}' state not found"}

    if state.get("status") not in (None, "running", "ready"):
        return {
            "status": "starting",
            "sandbox_name": name,
            "message": f"Sandbox status: {state.get('status')}",
        }

    vnc_port = state.get("vnc_port")
    host = state.get("host") or "127.0.0.1"
    if isinstance(vnc_port, int) and vnc_port > 0:
        return {
            "status": "ready",
            "vnc_url": build_local_novnc_url(str(host), vnc_port),
            "source": "local_novnc_port",
            "sandbox_name": name,
            "api_port": state.get("api_port"),
            "vnc_port": vnc_port,
        }

    return {
        "status": "error",
        "error": f"Sandbox '{name}' has no VNC web port — use a desktop image (ubuntu:24.04 xfce), not headless-only",
    }


def resolve_sandbox_image(image: str):
    """Map CLI image strings to cua_sandbox Image objects (Sandbox.create rejects raw str)."""
    from cua_sandbox import Image

    normalized = (image or "").strip().lower()
    if not normalized or normalized in {
        "default",
        "linux",
        "ubuntu:24.04",
        "linux/ubuntu:24.04",
    }:
        return Image.linux()

    if normalized.startswith("registry:"):
        return Image.from_registry(image.split(":", 1)[1])

    return Image.from_registry(image)


async def launch_sandbox(name: str, image: str, *, local: bool) -> dict[str, Any]:
    from cua_sandbox import Sandbox

    existing = await Sandbox.list(local=local) if local else await Sandbox.list(local=False)
    for item in existing:
        item_name = getattr(item, "name", None) or (item.get("name") if isinstance(item, dict) else None)
        if item_name and sandbox_names_equivalent(item_name, name):
            # Return the actual API-assigned name, not the proposed one
            return {"status": "exists", "sandbox_name": item_name}

    sandbox_image = resolve_sandbox_image(image)
    if local:
        sb = await Sandbox.create(sandbox_image, local=True, name=name)
    else:
        sb = await Sandbox.create(sandbox_image, name=name)
    # Use sb.name as the canonical sandbox name — the API may assign a different name
    sandbox_name = sb.name
    await sb.disconnect()
    return {"status": "launched", "sandbox_name": sandbox_name}


async def bootstrap(name: str, image: str, *, local: bool, max_wait_s: float) -> dict[str, Any]:
    proposed_name = name  # the name we requested; actual may differ after Sandbox.create

    emit({
        "phase": "preflight",
        "sandbox_name": proposed_name,
        "proposed_name": proposed_name,
        "message": "Running sandbox pre-flight checks",
    })
    preflight = run_preflight(local=local)
    if preflight.get("status") != "ready":
        return preflight

    emit({
        "phase": "provisioning",
        "sandbox_name": proposed_name,
        "proposed_name": proposed_name,
        "message": "Checking CUA sandbox runtime",
    })
    try:
        launch_result = await launch_sandbox(name, image, local=local)
    except Exception as error:
        return {
            "status": "error",
            "phase": "provisioning",
            "error": f"Failed to launch sandbox: {error}",
        }

    # After Sandbox.create the API may have assigned a different name (e.g. added version prefix)
    actual_name = launch_result.get("sandbox_name") or proposed_name

    emit({
        "phase": "starting",
        "sandbox_name": actual_name,
        "proposed_name": proposed_name,
        "message": "Booting isolated desktop environment",
        **launch_result,
    })

    deadline = asyncio.get_event_loop().time() + max_wait_s
    last_message = "Waiting for VNC endpoint"
    while asyncio.get_event_loop().time() < deadline:
        emit({
            "phase": "vnc_connecting",
            "sandbox_name": actual_name,
            "proposed_name": proposed_name,
            "message": last_message,
        })
        # Use actual_name — the VNC state is registered under the API-assigned name
        resolved = await resolve_vnc_url(actual_name, local=local)
        if resolved.get("status") == "ready" and resolved.get("vnc_url"):
            return {**resolved, "sandbox_name": actual_name, "proposed_name": proposed_name}
        if resolved.get("status") == "error":
            return resolved
        last_message = resolved.get("message") or last_message
        await asyncio.sleep(2.0)

    return {
        "status": "error",
        "error": f"Timed out after {max_wait_s:.0f}s waiting for sandbox VNC URL",
    }


async def main_async() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    resolve_cmd = sub.add_parser("resolve")
    resolve_cmd.add_argument("name")
    resolve_cmd.add_argument("--local", action="store_true")

    bootstrap_cmd = sub.add_parser("bootstrap")
    bootstrap_cmd.add_argument("name")
    bootstrap_cmd.add_argument("--image", default="default")
    bootstrap_cmd.add_argument("--local", action="store_true")
    bootstrap_cmd.add_argument("--max-wait", type=float, default=180.0)

    preflight_cmd = sub.add_parser("preflight")
    preflight_cmd.add_argument("--local", action="store_true")

    args = parser.parse_args()

    if args.command == "resolve":
        result = await resolve_vnc_url(args.name, local=args.local)
    elif args.command == "preflight":
        result = run_preflight(local=args.local)
    else:
        result = await bootstrap(args.name, args.image, local=args.local, max_wait_s=args.max_wait)

    emit(result)
    return 0 if result.get("status") == "ready" else 1


def main() -> None:
    raise SystemExit(asyncio.run(main_async()))


if __name__ == "__main__":
    main()
