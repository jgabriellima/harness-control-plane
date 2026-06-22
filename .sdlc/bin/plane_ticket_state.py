#!/usr/bin/env python3
"""Plane ticket state transitions — Plane adapter for work_items sync."""
from __future__ import annotations

import argparse
import html
import json
import os
import sys
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Any

from _sdlc_paths import REPO_ROOT, SDLC_ROOT, integrations_dir, workspace_target_root
from sdlc_dsl_bindings import harness_comment_marker, manifest_status_to_provider_state


def repo_root() -> Path:
    return REPO_ROOT


@lru_cache(maxsize=1)
def load_plane_config() -> dict[str, Any]:
    plane_yaml = integrations_dir() / "plane" / "plane.yaml"
    if not plane_yaml.is_file():
        return {}
    import yaml

    data = yaml.safe_load(plane_yaml.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _plane_states() -> dict[str, str]:
    """State key → UUID from materialized plane.yaml."""
    config = load_plane_config()
    raw = config.get("states") or {}
    if not isinstance(raw, dict):
        return {}
    states: dict[str, str] = {}
    for key, meta in raw.items():
        if isinstance(meta, dict) and meta.get("id"):
            states[str(key)] = str(meta["id"])
    return states


def _plane_connection() -> dict[str, str]:
    config = load_plane_config()
    conn = config.get("connection") or {}
    if not isinstance(conn, dict):
        return {}
    workspace = str(conn.get("workspace_slug") or "").strip()
    project_id = str(conn.get("project_id") or "").strip()
    base = str(conn.get("base_url") or "https://api.plane.so/api/v1").strip().rstrip("/")
    if not workspace or not project_id:
        return {}
    return {
        "workspace": workspace,
        "project_id": project_id,
        "base_url": f"{base}/workspaces/{workspace}/projects/{project_id}",
    }


def STATES() -> dict[str, str]:
    """Lazy accessor — reads from plane.yaml, not hardcoded."""
    return _plane_states()


def load_plane_api_key() -> str:
    config = load_plane_config()
    conn = config.get("connection") or {}
    env_name = "PLANE_API_KEY"
    if isinstance(conn, dict) and conn.get("api_key_env"):
        env_name = str(conn["api_key_env"]).strip() or env_name

    key = os.environ.get(env_name, "").strip()
    if key:
        return key
    for env_file in (REPO_ROOT / ".env", SDLC_ROOT / ".env", workspace_target_root() / ".env"):
        if env_file.is_file():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith(f"{env_name}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def plane_api(method: str, path: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    conn = _plane_connection()
    base_url = conn.get("base_url")
    if not base_url:
        raise RuntimeError("Plane connection not configured — check .sdlc/integrations/plane/plane.yaml")

    key = load_plane_api_key()
    if not key:
        raise RuntimeError("PLANE_API_KEY not set (env or .env)")

    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=body,
        method=method,
        headers={
            "X-API-Key": key,
            "Content-Type": "application/json",
            "User-Agent": "jambu-sdlc/1.0 (plane_ticket_state.py)",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"Plane API {method} {path} failed HTTP {exc.code}: {detail}") from exc


def get_issue_state_uuid(issue_uuid: str) -> str:
    issue = plane_api("GET", f"/issues/{issue_uuid}/")
    state = issue.get("state")
    if isinstance(state, dict):
        return str(state.get("id", ""))
    return str(state or "")


def set_issue_state(issue_uuid: str, state_key: str) -> dict[str, Any]:
    states = _plane_states()
    if state_key not in states:
        raise ValueError(f"Unknown state key: {state_key!r}. Valid: {', '.join(sorted(states))}")
    target = states[state_key]
    current = get_issue_state_uuid(issue_uuid)
    if current == target:
        return {"skipped": True, "state": state_key, "issue_uuid": issue_uuid}
    return plane_api("PATCH", f"/issues/{issue_uuid}/", {"state": target})


def post_pr_ready_comment(
    issue_uuid: str,
    *,
    ticket_id: str,
    pr_url: str,
    qa_verdict: str = "PASS",
) -> dict[str, Any]:
    html = (
        f"<h2>PR Ready for Review</h2>"
        f"<p><strong>Ticket:</strong> {ticket_id}</p>"
        f"<p><strong>PR:</strong> <a href=\"{pr_url}\">{pr_url}</a></p>"
        f"<p><strong>QA verdict:</strong> {qa_verdict}</p>"
        f"<p>Implementation complete — awaiting merge.</p>"
    )
    return plane_api("POST", f"/issues/{issue_uuid}/comments/", {"comment_html": html})


def format_harness_index_comment(
    ticket_id: str,
    fields: dict[str, str],
    *,
    marker: str | None = None,
) -> str:
    """HTML comment block for Plane — AC-6 verification searches for harness_run_id."""
    tag = marker or harness_comment_marker(REPO_ROOT)
    rows = "".join(
        f"<tr><td>{html.escape(key)}</td><td><code>{html.escape(value)}</code></td></tr>"
        for key, value in fields.items()
        if value
    )
    return (
        f"{tag}\n"
        f"<h3>Harness Index</h3>"
        f"<p><strong>Ticket:</strong> {html.escape(ticket_id)}</p>"
        f"<table>{rows}</table>"
    )


def format_hitl_intervention_comment(
    ticket_id: str,
    fields: dict[str, str],
    *,
    marker: str | None = None,
) -> str:
    """HTML comment for HITL pause — extends harness index with intervention context."""
    harness_html = format_harness_index_comment(ticket_id, fields, marker=marker)
    reason = html.escape(fields.get("reason") or "Human intervention required")
    blocked = html.escape(fields.get("blocked_by_node") or "")
    awaiting = html.escape(fields.get("awaiting") or "")
    actions_raw = fields.get("required_actions") or "[]"
    return (
        f"{harness_html}"
        f"<h3>HITL Intervention</h3>"
        f"<p><strong>Blocked node:</strong> <code>{blocked}</code></p>"
        f"<p><strong>Awaiting:</strong> <code>{awaiting}</code></p>"
        f"<p><strong>Reason:</strong> {reason}</p>"
        f"<pre>{html.escape(actions_raw)}</pre>"
        f"<p>Clear resume gates then run "
        f"<code>python3 .sdlc/bin/sdlc_workflow_run.py step --run-id "
        f"{html.escape(fields.get('harness_run_id') or '')} --mode agent</code></p>"
    )


def post_hitl_intervention_comment(
    issue_uuid: str,
    *,
    ticket_id: str,
    fields: dict[str, str],
) -> dict[str, Any]:
    comment_html = format_hitl_intervention_comment(ticket_id, fields)
    return plane_api(
        "POST",
        f"/issues/{issue_uuid}/comments/",
        {"comment_html": comment_html},
    )


def sync_harness_fields_to_plane(
    issue_uuid: str,
    *,
    ticket_id: str,
    fields: dict[str, str],
    dry_run: bool = False,
) -> dict[str, Any]:
    """Post harness index comment to Plane issue (manifest remains source of truth)."""
    comment_html = format_harness_index_comment(ticket_id, fields)
    if dry_run:
        return {"dry_run": True, "comment_html": comment_html, "fields": fields}
    return plane_api(
        "POST",
        f"/issues/{issue_uuid}/comments/",
        {"comment_html": comment_html},
    )


def sync_manifest_ticket_state(
    ticket_id: str,
    issue_uuid: str,
    manifest_status: str,
    *,
    pr_url: str | None = None,
    qa_verdict: str | None = None,
    post_comment: bool = True,
    hitl_context: dict[str, str] | None = None,
) -> str:
    """Map manifest ticket status to Plane state via plane.yaml manifest_sync.status_map."""
    provider_state = manifest_status_to_provider_state(manifest_status)
    set_issue_state(issue_uuid, provider_state)
    if post_comment and provider_state == "in_review":
        if hitl_context:
            post_hitl_intervention_comment(
                issue_uuid,
                ticket_id=ticket_id,
                fields=hitl_context,
            )
        elif pr_url:
            post_pr_ready_comment(
                issue_uuid,
                ticket_id=ticket_id,
                pr_url=pr_url,
                qa_verdict=qa_verdict or "PASS",
            )
    return provider_state


def main() -> int:
    states = _plane_states()
    parser = argparse.ArgumentParser(description="Sync Plane ticket lifecycle state")
    parser.add_argument("--issue-uuid", required=True, help="Plane issue UUID")
    parser.add_argument(
        "--state",
        required=True,
        choices=sorted(states.keys()) if states else None,
        help="Target lifecycle state",
    )
    parser.add_argument("--ticket", default="", help="Ticket id e.g. JAMBU-26 (for comments)")
    parser.add_argument("--pr-url", default="", help="PR URL when moving to in_review")
    parser.add_argument("--qa-verdict", default="PASS")
    parser.add_argument("--no-comment", action="store_true")
    args = parser.parse_args()

    try:
        if args.state == "in_review" and args.pr_url and args.ticket and not args.no_comment:
            set_issue_state(args.issue_uuid, "in_review")
            post_pr_ready_comment(
                args.issue_uuid,
                ticket_id=args.ticket,
                pr_url=args.pr_url,
                qa_verdict=args.qa_verdict,
            )
            print(f"Plane {args.ticket or args.issue_uuid}: in_review (+ comment)")
        else:
            result = set_issue_state(args.issue_uuid, args.state)
            if result.get("skipped"):
                print(f"Plane {args.ticket or args.issue_uuid}: already {args.state}")
            else:
                print(f"Plane {args.ticket or args.issue_uuid}: → {args.state}")
        return 0
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
