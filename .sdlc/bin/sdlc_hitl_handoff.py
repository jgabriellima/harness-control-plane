#!/usr/bin/env python3
"""HITL pause handoff persistence and ticket sync (ADR-020 wire-up)."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from _sdlc_paths import SDLC_ROOT


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")


def _select_hitl_sync_tickets(manifest: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Epic + first vertical-slice ticket — operator decision from HITL wire-up handoff."""
    tickets = manifest.get("tickets") or {}
    if not isinstance(tickets, dict):
        return []

    epic: list[tuple[str, dict[str, Any]]] = []
    slices: list[tuple[str, dict[str, Any]]] = []
    for ticket_id, ticket in tickets.items():
        if not isinstance(ticket, dict):
            continue
        role = ticket.get("role")
        if role == "epic":
            epic.append((ticket_id, ticket))
        elif role not in ("content-post",):
            slices.append((ticket_id, ticket))

    selected: list[tuple[str, dict[str, Any]]] = []
    selected.extend(epic)
    if slices:
        selected.append(slices[0])
    return selected


def _build_hitl_handoff_markdown(run_id: str, manifest: dict[str, Any]) -> str:
    meta = manifest.get("metadata") if isinstance(manifest.get("metadata"), dict) else {}
    continuity = manifest.get("continuity") if isinstance(manifest.get("continuity"), dict) else {}
    blocked_node = continuity.get("blocked_by_node")
    node_state: dict[str, Any] = {}
    if isinstance(blocked_node, str):
        nodes = manifest.get("nodes") or {}
        raw = nodes.get(blocked_node)
        if isinstance(raw, dict):
            node_state = raw
    hitl = node_state.get("hitl") if isinstance(node_state.get("hitl"), dict) else {}

    ts = _utc_timestamp()
    workflow_id = str(meta.get("workflow_id") or "")
    intent = str(manifest.get("intent") or "")

    ticket_lines = []
    for ticket_id, ticket in _select_hitl_sync_tickets(manifest):
        if isinstance(ticket, dict):
            ticket_lines.append(
                f"- {ticket_id} (role={ticket.get('role', '?')}, status={ticket.get('status', '?')})"
            )

    continuity_json = json.dumps(continuity, indent=2)
    required = continuity.get("required_actions") or []
    resume_cmd = (
        f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {run_id} --mode agent"
    )

    return f"""# Handoff — HITL pause — {ts}

## Status
AWAITING_HUMAN — auto-recorded on `awaiting_human` transition.

## Run Context

| Field | Value |
|---|---|
| run_id | `{run_id}` |
| workflow_id | `{workflow_id}` |
| intent | {intent} |
| blocked_by_node | `{blocked_node}` |
| hitl_kind | `{hitl.get('kind', continuity.get('awaiting', ''))}` |

## Intervention Reason

{hitl.get('reason') or 'Human input required — see continuity block.'}

## Required Actions

{json.dumps(required, indent=2)}

## Active Tickets

{chr(10).join(ticket_lines) if ticket_lines else '- (none registered on manifest)'}

## Continuity Payload

```json
{continuity_json}
```

## Resume

After clearing resume gates and completing human approval:

```bash
{resume_cmd}
python3 .sdlc/bin/sdlc_workflow_run.py status --run-id {run_id} --json
```

## Blocked By

Human approval — run status `awaiting_human`, node `{blocked_node}`.
"""


def record_hitl_handoff(run_id: str, manifest: dict[str, Any]) -> Path:
    """Write timestamped handoff + LATEST.md for session continuity."""
    handoffs_dir = SDLC_ROOT / "handoffs"
    handoffs_dir.mkdir(parents=True, exist_ok=True)

    ts = _utc_timestamp()
    filename = f"{ts}-hitl-pause-{run_id}.md"
    path = handoffs_dir / filename
    content = _build_hitl_handoff_markdown(run_id, manifest)
    path.write_text(content, encoding="utf-8")

    latest = handoffs_dir / "LATEST.md"
    latest.write_text(content, encoding="utf-8")
    print(f"HITL_HANDOFF_RECORDED run_id={run_id} path={path}", file=sys.stderr)
    return path


def sync_hitl_tickets_on_pause(run_id: str, manifest: dict[str, Any]) -> None:
    """Bump epic + slice ticket to ready_for_review and sync to work_items provider."""
    from work_items_sync import sync_manifest_ticket

    hitl_context = _hitl_context_from_manifest(manifest)
    for ticket_id, ticket in _select_hitl_sync_tickets(manifest):
        ticket["status"] = "ready_for_review"
        try:
            sync_manifest_ticket(
                ticket_id,
                ticket,
                "ready_for_review",
                manifest=manifest,
                manifest_run_id=run_id,
                hitl_context=hitl_context,
            )
        except (RuntimeError, ValueError) as exc:
            print(f"HITL_TICKET_SYNC_SKIP {ticket_id}: {exc}", file=sys.stderr)


def _hitl_context_from_manifest(manifest: dict[str, Any]) -> dict[str, str]:
    continuity = manifest.get("continuity") if isinstance(manifest.get("continuity"), dict) else {}
    blocked_node = str(continuity.get("blocked_by_node") or "")
    nodes = manifest.get("nodes") or {}
    node_state = nodes.get(blocked_node) if isinstance(nodes, dict) else {}
    hitl = node_state.get("hitl") if isinstance(node_state, dict) and isinstance(node_state.get("hitl"), dict) else {}
    run_id = str((manifest.get("metadata") or {}).get("run_id") or "")
    return {
        "blocked_by_node": blocked_node,
        "awaiting": str(continuity.get("awaiting") or ""),
        "reason": str(hitl.get("reason") or ""),
        "harness_run_id": run_id,
        "harness_node_id": blocked_node,
        "required_actions": json.dumps(continuity.get("required_actions") or []),
    }
