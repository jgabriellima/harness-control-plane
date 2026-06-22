#!/usr/bin/env python3
"""
Work-items state sync — provider-agnostic dispatcher for workflow manifest tickets.

Resolves the active work_items integration from sdlc.yaml and delegates to the
provider adapter. Gate scripts MUST NOT import plane_ticket_state directly.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from _sdlc_paths import WORKFLOW_RUNS_DIR

_BIN_DIR = Path(__file__).resolve().parent
_STABLE_REPO_ROOT = _BIN_DIR.parents[1]


def _repo_root() -> Path:
    """Repo root anchored to this file — stable when tests monkeypatch _sdlc_paths.REPO_ROOT."""
    return _STABLE_REPO_ROOT
from sdlc_dsl_bindings import (
    manifest_status_post_comment,
    manifest_status_to_provider_state,
    manifest_sync_harness_fields,
    syncable_manifest_statuses,
    work_items_provider,
)

AWAITING_NODE_STATUSES = frozenset(
    {"awaiting_input", "awaiting_approval", "awaiting_external"},
)
ACTIVE_NODE_STATUSES = frozenset(
    {
        "pending",
        "running",
        "retry",
        "blocked",
        "failed",
        *AWAITING_NODE_STATUSES,
    },
)


def _load_yaml(path: Path) -> dict[str, Any]:
    import yaml

    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping in {path}")
    return data


def active_node_id(manifest: dict[str, Any]) -> str | None:
    """First blocking or in-progress node on the run manifest."""
    continuity = manifest.get("continuity")
    if isinstance(continuity, dict):
        blocked = continuity.get("blocked_by_node")
        if isinstance(blocked, str) and blocked.strip():
            return blocked.strip()
    nodes = manifest.get("nodes") or {}
    if not isinstance(nodes, dict):
        return None
    for node_id, state in nodes.items():
        if isinstance(state, dict) and state.get("status") in ACTIVE_NODE_STATUSES:
            return str(node_id)
    return None


def continuity_status_for_manifest(manifest: dict[str, Any]) -> str:
    continuity = manifest.get("continuity")
    if isinstance(continuity, dict):
        awaiting = continuity.get("awaiting")
        if isinstance(awaiting, str) and awaiting.strip() and awaiting != "none":
            return awaiting.strip()
    run_status = manifest.get("status")
    if isinstance(run_status, str) and run_status.strip():
        return run_status.strip()
    return "unknown"


def build_harness_fields(
    manifest_run_id: str,
    manifest: dict[str, Any],
    ticket: dict[str, Any],
) -> dict[str, str]:
    """Build harness index payload from workflow run manifest (source of truth)."""
    meta = manifest.get("metadata") if isinstance(manifest.get("metadata"), dict) else {}
    workflow_id = str(meta.get("workflow_id") or "")
    child_run_id = ticket.get("child_run_id")
    effective_run_id = str(child_run_id or manifest_run_id)
    parent_run_id = manifest_run_id if child_run_id else ticket.get("parent_run_id")
    harness_meta = ticket.get("harness") if isinstance(ticket.get("harness"), dict) else {}

    node_id = ticket.get("active_node_id") or active_node_id(manifest) or ""

    fields: dict[str, str] = {
        "harness_run_id": effective_run_id,
        "harness_parent_run_id": str(parent_run_id or ""),
        "harness_workflow_id": workflow_id,
        "harness_node_id": str(node_id),
        "continuity_status": continuity_status_for_manifest(manifest),
    }

    spec_path = harness_meta.get("spec_path") or ticket.get("spec_path")
    if isinstance(spec_path, str) and spec_path.strip():
        fields["spec_path"] = spec_path.strip()
    pr_url = harness_meta.get("pr_url") or ticket.get("pr_url")
    if isinstance(pr_url, str) and pr_url.strip():
        fields["pr_url"] = pr_url.strip()

    configured = manifest_sync_harness_fields(_repo_root())
    if configured:
        return {key: fields.get(key, "") for key in configured}
    return fields


def apply_harness_fields_to_ticket(
    manifest_run_id: str,
    manifest: dict[str, Any],
    ticket: dict[str, Any],
) -> dict[str, str]:
    """Write harness pointers onto manifest ticket dict and return field payload."""
    fields = build_harness_fields(manifest_run_id, manifest, ticket)
    for key, value in fields.items():
        ticket[key] = value
    harness_meta = ticket.setdefault("harness", {})
    if not isinstance(harness_meta, dict):
        harness_meta = {}
        ticket["harness"] = harness_meta
    if fields.get("harness_workflow_id"):
        harness_meta["workflow_id"] = fields["harness_workflow_id"]
    if "spec_path" in fields:
        harness_meta["spec_path"] = fields["spec_path"]
    if "pr_url" in fields:
        harness_meta["pr_url"] = fields["pr_url"]
    ticket["harness_synced_at"] = fields.get("harness_run_id", "")
    return fields


def find_manifest_for_ticket(
    ticket_id: str,
    *,
    run_id: str | None = None,
) -> tuple[str, dict[str, Any]] | None:
    """Locate workflow run manifest containing ticket_id."""
    if run_id:
        manifest_path = WORKFLOW_RUNS_DIR / run_id / "manifest.yaml"
        if manifest_path.is_file():
            manifest = _load_yaml(manifest_path)
            if ticket_id in (manifest.get("tickets") or {}):
                return run_id, manifest

    if not WORKFLOW_RUNS_DIR.is_dir():
        return None

    matches: list[tuple[str, dict[str, Any]]] = []
    for entry in sorted(WORKFLOW_RUNS_DIR.iterdir()):
        if not entry.is_dir() or entry.name == "output" or entry.name == "traces":
            continue
        manifest_path = entry / "manifest.yaml"
        if not manifest_path.is_file():
            continue
        manifest = _load_yaml(manifest_path)
        if ticket_id in (manifest.get("tickets") or {}):
            matches.append((entry.name, manifest))

    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]
    active_path = WORKFLOW_RUNS_DIR / "ACTIVE"
    if active_path.is_file():
        active_id = active_path.read_text(encoding="utf-8").strip()
        for rid, manifest in matches:
            if rid == active_id:
                return rid, manifest
    return matches[-1]


def sync_ticket_harness(
    ticket_id: str,
    ticket: dict[str, Any],
    manifest: dict[str, Any],
    manifest_run_id: str,
    *,
    dry_run: bool = False,
) -> dict[str, str]:
    """Push harness index fields to work_items provider."""
    issue_uuid = ticket.get("uuid")
    if not issue_uuid:
        raise RuntimeError(f"{ticket_id}: uuid not registered — cannot sync harness index")

    fields = apply_harness_fields_to_ticket(manifest_run_id, manifest, ticket)
    provider_id, _entry, _config_path = work_items_provider(_repo_root())

    if provider_id == "plane":
        from plane_ticket_state import sync_harness_fields_to_plane

        sync_harness_fields_to_plane(
            str(issue_uuid),
            ticket_id=ticket_id,
            fields=fields,
            dry_run=dry_run,
        )
    elif provider_id == "local-work-items":
        from local_ticket_state import sync_harness_fields_to_local

        sync_harness_fields_to_local(
            str(issue_uuid),
            ticket_id=ticket_id,
            fields=fields,
            dry_run=dry_run,
        )
    else:
        raise RuntimeError(
            f"No harness sync adapter for provider {provider_id!r}. "
            "Add adapter in work_items_sync.py."
        )

    ticket["harness_synced"] = not dry_run
    return fields


def sync_manifest_ticket(
    ticket_id: str,
    ticket: dict[str, Any],
    manifest_status: str,
    *,
    manifest: dict[str, Any] | None = None,
    manifest_run_id: str | None = None,
    dry_run: bool = False,
    hitl_context: dict[str, str] | None = None,
) -> str:
    """
    Sync manifest ticket status to the active work_items provider.

    Returns provider state key applied. Sets work_items_state_synced and
    work_items_state on the ticket dict (plus legacy plane_* aliases when provider is plane).
    """
    if manifest_status not in syncable_manifest_statuses(_repo_root()):
        raise ValueError(
            f"Manifest status {manifest_status!r} is not syncable. "
            f"Syncable: {sorted(syncable_manifest_statuses(_repo_root()))}"
        )

    issue_uuid = ticket.get("uuid")
    if not issue_uuid:
        raise RuntimeError(f"{ticket_id}: uuid not registered — cannot sync work_items")

    provider_id, _entry, _config_path = work_items_provider(_repo_root())
    post_comment = manifest_status_post_comment(manifest_status, _repo_root())

    if provider_id == "plane":
        from plane_ticket_state import sync_manifest_ticket_state

        if dry_run:
            provider_state = manifest_status_to_provider_state(manifest_status, _repo_root())
        else:
            provider_state = sync_manifest_ticket_state(
                ticket_id,
                str(issue_uuid),
                manifest_status,
                pr_url=ticket.get("pr_url"),
                qa_verdict=ticket.get("qa_verdict"),
                post_comment=post_comment,
                hitl_context=hitl_context,
            )
    elif provider_id == "local-work-items":
        from local_ticket_state import sync_manifest_ticket_state as sync_local_state

        if dry_run:
            provider_state = manifest_status_to_provider_state(manifest_status, _repo_root())
        else:
            provider_state = sync_local_state(
                ticket_id,
                str(issue_uuid),
                manifest_status,
                pr_url=ticket.get("pr_url"),
                qa_verdict=ticket.get("qa_verdict"),
                post_comment=post_comment,
                repo_root=_repo_root(),
                hitl_context=hitl_context,
            )
    else:
        raise RuntimeError(
            f"No work_items sync adapter for provider {provider_id!r}. "
            "Add adapter in work_items_sync.py."
        )

    ticket["work_items_state_synced"] = not dry_run
    ticket["work_items_state"] = provider_state
    if provider_id == "plane":
        ticket["plane_state_synced"] = not dry_run
        ticket["plane_state"] = provider_state

    if manifest is not None and manifest_run_id:
        sync_ticket_harness(
            ticket_id,
            ticket,
            manifest,
            manifest_run_id,
            dry_run=dry_run,
        )

    return provider_state


def provider_state_for_manifest_status(manifest_status: str) -> str:
    """Resolve provider state key without performing API call (for validation/CLI)."""
    return manifest_status_to_provider_state(manifest_status, _repo_root())


def cmd_transition(args: argparse.Namespace) -> int:
    """Transition manifest ticket to a syncable status and push to work_items provider."""
    located = find_manifest_for_ticket(args.ticket, run_id=args.run_id)
    if not located:
        print(f"ERROR: ticket {args.ticket!r} not found in workflow run manifests", file=sys.stderr)
        return 1

    manifest_run_id, manifest = located
    tickets = manifest.get("tickets") or {}
    ticket = tickets.get(args.ticket)
    if not isinstance(ticket, dict):
        print(f"ERROR: ticket {args.ticket!r} missing from manifest", file=sys.stderr)
        return 1

    manifest_status = str(args.manifest_status).strip()
    syncable = syncable_manifest_statuses(_repo_root())
    if manifest_status not in syncable:
        print(
            f"ERROR: manifest status {manifest_status!r} not in syncable set: {sorted(syncable)}",
            file=sys.stderr,
        )
        return 1

    ticket["status"] = manifest_status
    if args.dry_run:
        provider_state = manifest_status_to_provider_state(manifest_status, _repo_root())
    else:
        provider_state = sync_manifest_ticket(
            args.ticket,
            ticket,
            manifest_status,
            manifest=manifest,
            manifest_run_id=manifest_run_id,
            dry_run=False,
        )
        import yaml

        manifest_path = WORKFLOW_RUNS_DIR / manifest_run_id / "manifest.yaml"
        with manifest_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(manifest, handle, sort_keys=False, allow_unicode=True)

    payload = {
        "ticket": args.ticket,
        "run_id": manifest_run_id,
        "manifest_status": manifest_status,
        "provider_state": provider_state,
        "ticket_state": provider_state,
    }
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(
            f"TRANSITION {args.ticket} manifest={manifest_status} provider={provider_state} "
            f"run={manifest_run_id}"
        )
    return 0


def cmd_sync(args: argparse.Namespace) -> int:
    located = find_manifest_for_ticket(args.ticket, run_id=args.run_id)
    if not located:
        print(f"ERROR: ticket {args.ticket!r} not found in workflow run manifests", file=sys.stderr)
        return 1

    manifest_run_id, manifest = located
    tickets = manifest.get("tickets") or {}
    ticket = tickets.get(args.ticket)
    if not isinstance(ticket, dict):
        print(f"ERROR: ticket {args.ticket!r} missing from manifest", file=sys.stderr)
        return 1

    manifest_status = str(ticket.get("status") or "in_progress")
    if args.harness_only:
        fields = sync_ticket_harness(
            args.ticket,
            ticket,
            manifest,
            manifest_run_id,
            dry_run=args.dry_run,
        )
    elif manifest_status in syncable_manifest_statuses(_repo_root()):
        sync_manifest_ticket(
            args.ticket,
            ticket,
            manifest_status,
            manifest=manifest,
            manifest_run_id=manifest_run_id,
            dry_run=args.dry_run,
        )
        fields = build_harness_fields(manifest_run_id, manifest, ticket)
    else:
        fields = sync_ticket_harness(
            args.ticket,
            ticket,
            manifest,
            manifest_run_id,
            dry_run=args.dry_run,
        )

    if not args.dry_run:
        manifest_path = WORKFLOW_RUNS_DIR / manifest_run_id / "manifest.yaml"
        import yaml

        with manifest_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(manifest, handle, sort_keys=False, allow_unicode=True)

        from _sdlc_paths import load_sdlc_yaml  # noqa: WPS433

        qa = load_sdlc_yaml().get("qa") if isinstance(load_sdlc_yaml().get("qa"), dict) else {}
        if qa.get("evidence_publish_to_deliverables"):
            from sdlc_deliverables_publish import publish_deliverables  # noqa: WPS433

            publish_deliverables(manifest_run_id, manifest, trigger="qa")

    payload = {
        "ticket": args.ticket,
        "run_id": manifest_run_id,
        "dry_run": args.dry_run,
        "harness": fields,
    }
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(f"SYNC {'(dry-run) ' if args.dry_run else ''}{args.ticket} run={manifest_run_id}")
        for key, value in fields.items():
            print(f"  {key}: {value}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync workflow manifest tickets to work_items provider")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sync_parser = sub.add_parser("sync", help="Sync ticket state + harness index to work_items provider")
    sync_parser.add_argument("--ticket", required=True, help="Ticket id e.g. JAMBU-110")
    sync_parser.add_argument("--run-id", help="Workflow run id (default: search manifests)")
    sync_parser.add_argument("--dry-run", action="store_true", help="Build payload without Plane API calls")
    sync_parser.add_argument("--harness-only", action="store_true", help="Sync harness fields only")
    sync_parser.add_argument("--json", action="store_true", help="Emit JSON result")
    sync_parser.set_defaults(func=cmd_sync)

    transition_parser = sub.add_parser(
        "transition",
        help="Set manifest ticket status and sync to work_items provider",
    )
    transition_parser.add_argument("--ticket", required=True, help="Ticket id e.g. PROJ-1")
    transition_parser.add_argument("--run-id", help="Workflow run id (default: search manifests)")
    transition_parser.add_argument(
        "--manifest-status",
        required=True,
        help="Manifest ticket status key (e.g. ready_for_review, done)",
    )
    transition_parser.add_argument("--dry-run", action="store_true", help="Resolve mapping only")
    transition_parser.add_argument("--json", action="store_true", help="Emit JSON result")
    transition_parser.set_defaults(func=cmd_transition)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
