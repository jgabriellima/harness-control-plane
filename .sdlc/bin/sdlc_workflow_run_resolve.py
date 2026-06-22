#!/usr/bin/env python3
"""Resolve workflow run relationships — goal vs feature-flow, parent/child (ADR-023)."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from _sdlc_paths import WORKFLOW_RUNS_DIR

PARENT_RUN_IN_INTENT_RE = re.compile(r"\(workflow=([^)]+)\)")
FEATURE_FLOW_SUFFIX_RE = re.compile(r"-ff-[a-z0-9-]+$", re.I)
FIXTURE_RUN_ID_RE = re.compile(r"^(?:test-|goal-exit42-)", re.I)
GOAL_WORKFLOW_ID = "goal-flow"
FEATURE_FLOW_WORKFLOW_ID = "feature-flow"
ACTIVE_RUN_STATUSES = frozenset(
    {"pending", "in_progress", "blocked", "paused", "retry", "awaiting_human"},
)


def is_fixture_run_id(run_id: str) -> bool:
    """Test/dev fixture runs must never be auto-resumed by hooks."""
    return bool(FIXTURE_RUN_ID_RE.match(run_id))


def is_auto_resumable_goal_run(run_id: str, manifest: dict[str, Any]) -> bool:
    """
    Goal runs hooks may bind without explicit user confirmation.

    Blocked runs with no continuity.required_actions are stale — not resumable.
    Fixture run ids (test-*, goal-exit42-*) are never resumable.
    """
    if is_fixture_run_id(run_id):
        return False
    status = str(manifest.get("status") or "")
    if status not in ACTIVE_RUN_STATUSES:
        return False
    if status == "blocked":
        continuity = manifest.get("continuity") if isinstance(manifest.get("continuity"), dict) else {}
        actions = continuity.get("required_actions") or []
        if not actions:
            return False
    return True


def manifest_path(run_id: str) -> Path:
    return WORKFLOW_RUNS_DIR / run_id / "manifest.yaml"


def _load_yaml(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        import yaml
    except ImportError:
        return None
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else None


def run_metadata(run_id: str) -> tuple[str, str]:
    """Return (workflow_id, status) for run_id; empty strings if missing."""
    doc = _load_yaml(manifest_path(run_id))
    if not doc:
        return "", ""
    meta = doc.get("metadata") if isinstance(doc.get("metadata"), dict) else {}
    workflow_id = str(meta.get("workflow_id") or "")
    status = str(doc.get("status") or "")
    return workflow_id, status


def is_feature_flow_child_run(run_id: str) -> bool:
    workflow_id, _ = run_metadata(run_id)
    return workflow_id == FEATURE_FLOW_WORKFLOW_ID or bool(FEATURE_FLOW_SUFFIX_RE.search(run_id))


def parent_goal_run_id_from_feature_flow(manifest: dict[str, Any]) -> str | None:
    intent = str(manifest.get("intent", ""))
    match = PARENT_RUN_IN_INTENT_RE.search(intent)
    if match:
        return match.group(1).strip()
    return None


def feature_flow_run_id(parent_run_id: str, ticket_id: str) -> str:
    return f"{parent_run_id}-ff-{ticket_id.lower()}"


def parse_parent_ticket_from_child_run(child_run_id: str) -> tuple[str, str] | None:
    """Return (parent_run_id, ticket_id) from a feature-flow child run id."""
    match = re.match(r"^(.+)-ff-(.+)$", child_run_id, re.I)
    if not match:
        return None
    parent_run_id, ticket_slug = match.group(1), match.group(2)
    parent_doc = _load_yaml(manifest_path(parent_run_id))
    if not parent_doc:
        return parent_run_id, ticket_slug
    tickets = parent_doc.get("tickets") or {}
    if isinstance(tickets, dict):
        for tid in tickets:
            if str(tid).lower() == ticket_slug.lower():
                return parent_run_id, str(tid)
    return parent_run_id, ticket_slug


def ensure_feature_flow_child_ticket(child_run_id: str) -> tuple[str, dict[str, Any]] | None:
    """
    Ensure a delegated feature-flow manifest carries its parent goal ticket.

    Idempotent: copies qa_surface, validation_checks, worktree, and harness fields
    from the parent goal manifest when the child manifest tickets map is empty.
    """
    from sdlc_profile import active_ticket_from_manifest, hydrate_ticket_qa_fields
    from sdlc_workflow_manifest import cmd_register_ticket, load_manifest, save_manifest

    child_doc = _load_yaml(manifest_path(child_run_id))
    if not child_doc:
        return None

    found = active_ticket_from_manifest(child_doc)
    if found:
        return found

    parsed = parse_parent_ticket_from_child_run(child_run_id)
    if not parsed:
        return None
    parent_run_id, ticket_id = parsed

    parent_doc = _load_yaml(manifest_path(parent_run_id))
    if not parent_doc:
        return None
    parent_ticket = (parent_doc.get("tickets") or {}).get(ticket_id)
    if not isinstance(parent_ticket, dict):
        return None

    validation_checks = parent_ticket.get("validation_checks")
    checks = validation_checks if isinstance(validation_checks, list) else None
    qa_surface = parent_ticket.get("qa_surface")
    cmd_register_ticket(
        child_run_id,
        ticket_id,
        worktree=parent_ticket.get("worktree") if isinstance(parent_ticket.get("worktree"), str) else None,
        branch=parent_ticket.get("branch") if isinstance(parent_ticket.get("branch"), str) else None,
        pr_url=parent_ticket.get("pr_url") if isinstance(parent_ticket.get("pr_url"), str) else None,
        status=str(parent_ticket.get("status") or "in_progress"),
        role=str(parent_ticket.get("role") or "vertical-slice"),
        uuid=parent_ticket.get("uuid") if isinstance(parent_ticket.get("uuid"), str) else None,
        parent_run_id=parent_run_id,
        qa_surface=str(qa_surface) if isinstance(qa_surface, str) else None,
        validation_checks=checks,
    )

    child_doc = load_manifest(child_run_id)
    child_doc["active_ticket_id"] = ticket_id
    child_doc["ticket_id"] = ticket_id
    save_manifest(child_run_id, child_doc)

    ticket = (child_doc.get("tickets") or {}).get(ticket_id)
    if isinstance(ticket, dict):
        hydrate_ticket_qa_fields(ticket_id, ticket)
        return ticket_id, ticket
    return ticket_id, parent_ticket


def cognitive_output_path(run_id: str, node_id: str) -> Path | None:
    doc = _load_yaml(manifest_path(run_id))
    if not doc:
        return None
    paths = doc.get("paths") if isinstance(doc.get("paths"), dict) else {}
    output_dir = paths.get("output_dir")
    if not isinstance(output_dir, str) or not output_dir.strip():
        return None
    return Path(output_dir.strip()) / "cognitive" / f"{node_id}.json"


def dispatch_is_stalled(run_id: str, node_id: str) -> bool:
    """True when node is running but cognitive output for that node is absent."""
    doc = _load_yaml(manifest_path(run_id))
    if not doc:
        return False
    nodes = doc.get("nodes") if isinstance(doc.get("nodes"), dict) else {}
    state = nodes.get(node_id) if isinstance(nodes.get(node_id), dict) else {}
    if state.get("status") != "running":
        return False
    cog = cognitive_output_path(run_id, node_id)
    return cog is None or not cog.is_file()


def resolve_goal_run_id(
    active_id: str | None,
    goal_runs: list[tuple[str, dict[str, Any]]],
) -> str | None:
    """
    Pick the goal-flow run_id hooks and /sdlc:goal continuity must drive.

    Never return a feature-flow child run — those are delegated via /sdlc:implement.
    """
    if active_id:
        workflow_id, status = run_metadata(active_id)
        if workflow_id == GOAL_WORKFLOW_ID and status in ACTIVE_RUN_STATUSES:
            active_doc = _load_yaml(manifest_path(active_id))
            if active_doc and is_auto_resumable_goal_run(active_id, active_doc):
                return active_id
        if workflow_id == FEATURE_FLOW_WORKFLOW_ID:
            child_doc = _load_yaml(manifest_path(active_id))
            if child_doc:
                parent = parent_goal_run_id_from_feature_flow(child_doc)
                if parent and run_metadata(parent)[0] == GOAL_WORKFLOW_ID:
                    parent_doc = _load_yaml(manifest_path(parent))
                    if parent_doc and is_auto_resumable_goal_run(parent, parent_doc):
                        return parent

    for run_id, manifest in sorted(
        goal_runs,
        key=lambda item: str((item[1].get("metadata") or {}).get("updated_at") or item[1].get("updated_at") or ""),
        reverse=True,
    ):
        if is_auto_resumable_goal_run(run_id, manifest):
            return run_id
    return None
