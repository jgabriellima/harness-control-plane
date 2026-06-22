#!/usr/bin/env python3
"""Local filesystem adapter for work_items sync (ADR-025)."""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from _sdlc_paths import REPO_ROOT, SDLC_ROOT
from sdlc_dsl_bindings import manifest_status_to_provider_state


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load_yaml(path: Path) -> dict[str, Any]:
    import yaml

    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping in {path}")
    return data


def _dump_yaml(path: Path, data: dict[str, Any]) -> None:
    import yaml

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, sort_keys=False, allow_unicode=True)


def _integrations_dir() -> Path:
    return SDLC_ROOT / "integrations"


@lru_cache(maxsize=1)
def load_local_config() -> dict[str, Any]:
    config_path = _integrations_dir() / "local-work-items" / "local-work-items.yaml"
    if not config_path.is_file():
        return {}
    data = _load_yaml(config_path)
    return data if isinstance(data, dict) else {}


def work_items_root() -> Path:
    config = load_local_config()
    storage = config.get("storage") if isinstance(config.get("storage"), dict) else {}
    rel = str(storage.get("root") or "work-items").strip() or "work-items"
    return SDLC_ROOT / rel


def tickets_dir() -> Path:
    config = load_local_config()
    storage = config.get("storage") if isinstance(config.get("storage"), dict) else {}
    sub = str(storage.get("tickets_subdir") or "tickets").strip() or "tickets"
    return work_items_root() / sub


def board_index_path() -> Path:
    config = load_local_config()
    storage = config.get("storage") if isinstance(config.get("storage"), dict) else {}
    name = str(storage.get("board_index") or "INDEX.md").strip() or "INDEX.md"
    return work_items_root() / name


def ticket_file_path(ticket_id: str) -> Path:
    safe_id = ticket_id.strip().replace("/", "-")
    return tickets_dir() / f"{safe_id}.yaml"


def ensure_storage_dirs() -> None:
    tickets_dir().mkdir(parents=True, exist_ok=True)


def _local_states() -> dict[str, dict[str, str]]:
    config = load_local_config()
    raw = config.get("states") or {}
    if not isinstance(raw, dict):
        return {}
    states: dict[str, dict[str, str]] = {}
    for key, meta in raw.items():
        if isinstance(meta, dict):
            states[str(key)] = {
                "name": str(meta.get("name") or key),
                "group": str(meta.get("group") or ""),
            }
    return states


def load_ticket_by_uuid(issue_uuid: str) -> dict[str, Any] | None:
    ensure_storage_dirs()
    for path in sorted(tickets_dir().glob("*.yaml")):
        try:
            ticket = _load_yaml(path)
        except ValueError:
            continue
        if str(ticket.get("uuid") or "") == issue_uuid:
            return ticket
    return None


def load_ticket(ticket_id: str) -> dict[str, Any] | None:
    path = ticket_file_path(ticket_id)
    if not path.is_file():
        return None
    return _load_yaml(path)


def save_ticket(ticket_id: str, ticket: dict[str, Any]) -> Path:
    ensure_storage_dirs()
    ticket["id"] = ticket_id
    ticket["updated_at"] = _utc_now()
    path = ticket_file_path(ticket_id)
    _dump_yaml(path, ticket)
    regenerate_board_index()
    return path


def append_published_evidence_paths(
    ticket_id: str,
    paths: list[str],
    *,
    dry_run: bool = False,
) -> list[str]:
    """Append published deliverables paths to ticket evidence list (ADR-040)."""
    if dry_run or not paths:
        return []
    ticket = load_ticket(ticket_id)
    if ticket is None:
        return []
    evidence = ticket.get("evidence")
    if not isinstance(evidence, list):
        evidence = []
    added: list[str] = []
    for path in paths:
        normalized = str(path).strip()
        if normalized and normalized not in evidence:
            evidence.append(normalized)
            added.append(normalized)
    if added:
        ticket["evidence"] = evidence
        save_ticket(ticket_id, ticket)
    return added


def ensure_local_ticket(
    ticket_id: str,
    *,
    title: str | None = None,
    initial_state: str = "todo",
    qa_surface: str | None = None,
    validation_checks: list[dict[str, Any]] | None = None,
) -> str:
    """Create or load local ticket; return uuid."""
    existing = load_ticket(ticket_id)
    if existing is not None:
        issue_uuid = str(existing.get("uuid") or "").strip()
        if qa_surface and not existing.get("qa_surface"):
            existing["qa_surface"] = qa_surface.strip().lower()
        if validation_checks and not existing.get("validation_checks"):
            existing["validation_checks"] = validation_checks
        if issue_uuid:
            if qa_surface or validation_checks:
                from sdlc_profile import validate_ticket_qa_contract  # noqa: WPS433

                errors = validate_ticket_qa_contract(existing, ticket_id)
                if errors:
                    raise ValueError("; ".join(errors))
                save_ticket(ticket_id, existing)
            return issue_uuid
        issue_uuid = str(uuid.uuid4())
        existing["uuid"] = issue_uuid
        save_ticket(ticket_id, existing)
        return issue_uuid

    issue_uuid = str(uuid.uuid4())
    now = _utc_now()
    ticket: dict[str, Any] = {
        "uuid": issue_uuid,
        "title": title or ticket_id,
        "status": initial_state,
        "priority": "medium",
        "created_at": now,
        "updated_at": now,
        "harness": {},
        "comments": [],
        "evidence": [],
    }
    if isinstance(qa_surface, str) and qa_surface.strip():
        ticket["qa_surface"] = qa_surface.strip().lower()
    if isinstance(validation_checks, list) and validation_checks:
        ticket["validation_checks"] = validation_checks

    if qa_surface is not None:
        from sdlc_profile import validate_ticket_qa_contract  # noqa: WPS433

        contract_errors = validate_ticket_qa_contract(ticket, ticket_id)
        if contract_errors:
            raise ValueError("; ".join(contract_errors))

    save_ticket(ticket_id, ticket)
    return issue_uuid


def set_ticket_state(issue_uuid: str, state_key: str) -> dict[str, Any]:
    states = _local_states()
    if state_key not in states:
        raise ValueError(
            f"Unknown state key: {state_key!r}. Valid: {', '.join(sorted(states))}",
        )
    ticket = load_ticket_by_uuid(issue_uuid)
    if ticket is None:
        raise RuntimeError(f"Local ticket not found for uuid {issue_uuid!r}")
    ticket_id = str(ticket.get("id") or "")
    if ticket.get("status") == state_key:
        return {"skipped": True, "state": state_key, "uuid": issue_uuid}
    ticket["status"] = state_key
    save_ticket(ticket_id, ticket)
    return {"state": state_key, "uuid": issue_uuid, "ticket_id": ticket_id}


def append_review_comment(
    issue_uuid: str,
    *,
    ticket_id: str,
    pr_url: str,
    qa_verdict: str = "PASS",
) -> dict[str, Any]:
    ticket = load_ticket_by_uuid(issue_uuid)
    if ticket is None:
        raise RuntimeError(f"Local ticket not found for uuid {issue_uuid!r}")
    comments = ticket.setdefault("comments", [])
    if not isinstance(comments, list):
        comments = []
        ticket["comments"] = comments
    entry = {
        "type": "pr_ready_for_review",
        "at": _utc_now(),
        "ticket_id": ticket_id,
        "pr_url": pr_url,
        "qa_verdict": qa_verdict,
        "body": (
            f"PR Ready for Review — {ticket_id}\n"
            f"PR: {pr_url}\n"
            f"QA verdict: {qa_verdict}\n"
            f"Implementation complete — awaiting merge."
        ),
    }
    comments.append(entry)
    save_ticket(str(ticket.get("id") or ticket_id), ticket)
    return entry


def sync_harness_fields_to_local(
    issue_uuid: str,
    *,
    ticket_id: str,
    fields: dict[str, str],
    dry_run: bool = False,
) -> dict[str, Any]:
    """Mirror harness index fields onto local ticket YAML."""
    if dry_run:
        return {"dry_run": True, "fields": fields}
    ticket = load_ticket_by_uuid(issue_uuid)
    if ticket is None:
        ensure_local_ticket(ticket_id)
        ticket = load_ticket(ticket_id)
    if ticket is None:
        raise RuntimeError(f"Cannot load local ticket {ticket_id!r}")
    harness = ticket.setdefault("harness", {})
    if not isinstance(harness, dict):
        harness = {}
        ticket["harness"] = harness
    for key, value in fields.items():
        if value:
            harness[key] = value
    save_ticket(str(ticket.get("id") or ticket_id), ticket)
    return {"fields": fields, "uuid": issue_uuid}


def append_hitl_intervention_comment(
    issue_uuid: str,
    *,
    ticket_id: str,
    hitl_context: dict[str, str],
) -> dict[str, Any]:
    ticket = load_ticket_by_uuid(issue_uuid)
    if ticket is None:
        raise RuntimeError(f"Local ticket not found for uuid {issue_uuid!r}")
    comments = ticket.setdefault("comments", [])
    if not isinstance(comments, list):
        comments = []
        ticket["comments"] = comments
    entry = {
        "type": "hitl_intervention",
        "at": _utc_now(),
        "ticket_id": ticket_id,
        "blocked_by_node": hitl_context.get("blocked_by_node", ""),
        "awaiting": hitl_context.get("awaiting", ""),
        "reason": hitl_context.get("reason", ""),
        "harness_run_id": hitl_context.get("harness_run_id", ""),
        "body": (
            f"HITL Intervention — {ticket_id}\n"
            f"Blocked node: {hitl_context.get('blocked_by_node', '')}\n"
            f"Awaiting: {hitl_context.get('awaiting', '')}\n"
            f"Reason: {hitl_context.get('reason', '')}\n"
            f"Required actions: {hitl_context.get('required_actions', '[]')}"
        ),
    }
    comments.append(entry)
    save_ticket(str(ticket.get("id") or ticket_id), ticket)
    return entry


def sync_manifest_ticket_state(
    ticket_id: str,
    issue_uuid: str,
    manifest_status: str,
    *,
    pr_url: str | None = None,
    qa_verdict: str | None = None,
    post_comment: bool = True,
    repo_root: Path | None = None,
    hitl_context: dict[str, str] | None = None,
) -> str:
    """Map manifest ticket status to local state via manifest_sync.status_map."""
    root = repo_root or REPO_ROOT
    provider_state = manifest_status_to_provider_state(manifest_status, root)
    set_ticket_state(issue_uuid, provider_state)
    if post_comment and provider_state == "in_review":
        if hitl_context:
            append_hitl_intervention_comment(
                issue_uuid,
                ticket_id=ticket_id,
                hitl_context=hitl_context,
            )
        elif pr_url:
            append_review_comment(
                issue_uuid,
                ticket_id=ticket_id,
                pr_url=pr_url,
                qa_verdict=qa_verdict or "PASS",
            )
    return provider_state


def regenerate_board_index() -> Path:
    """Rebuild INDEX.md board from ticket YAML files."""
    ensure_storage_dirs()
    config = load_local_config()
    conn = config.get("connection") if isinstance(config.get("connection"), dict) else {}
    title = str(conn.get("board_title") or "Local Work Items Board")
    states = _local_states()
    columns = ["backlog", "todo", "in_progress", "in_review", "done"]
    for key in states:
        if key not in columns:
            columns.append(key)

    by_state: dict[str, list[str]] = {col: [] for col in columns}
    for path in sorted(tickets_dir().glob("*.yaml")):
        try:
            ticket = _load_yaml(path)
        except ValueError:
            continue
        tid = str(ticket.get("id") or path.stem)
        status = str(ticket.get("status") or "backlog")
        label = f"[{tid}](tickets/{path.name}) — {ticket.get('title', tid)}"
        by_state.setdefault(status, []).append(label)

    lines = [
        f"# {title}",
        "",
        f"Last updated: {_utc_now()}",
        "",
        "Filesystem board for `local-work-items` provider (ADR-025). "
        "Harness source of truth remains workflow run manifests.",
        "",
    ]
    header = "| " + " | ".join(states.get(c, {}).get("name", c) for c in columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    lines.extend([header, sep])
    max_rows = max((len(by_state.get(c, [])) for c in columns), default=0)
    for row in range(max_rows):
        cells: list[str] = []
        for col in columns:
            items = by_state.get(col, [])
            cells.append(items[row] if row < len(items) else "")
        lines.append("| " + " | ".join(cells) + " |")

    lines.extend(["", "## Ticket files", ""])
    for path in sorted(tickets_dir().glob("*.yaml")):
        lines.append(f"- `tickets/{path.name}`")

    index_path = board_index_path()
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return index_path


def create_ticket_cli(
    ticket_id: str,
    title: str,
    *,
    initial_state: str = "todo",
    description_path: str | None = None,
    qa_surface: str | None = None,
    validation_checks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    issue_uuid = ensure_local_ticket(
        ticket_id,
        title=title,
        initial_state=initial_state,
        qa_surface=qa_surface,
        validation_checks=validation_checks,
    )
    ticket = load_ticket(ticket_id)
    if ticket is None:
        raise RuntimeError(f"Failed to create ticket {ticket_id!r}")
    if description_path:
        desc_path = Path(description_path)
        if desc_path.is_file():
            ticket["description_md"] = desc_path.read_text(encoding="utf-8")
            save_ticket(ticket_id, ticket)
    return {"ticket_id": ticket_id, "uuid": issue_uuid, "path": str(ticket_file_path(ticket_id))}


def main() -> int:
    parser = argparse.ArgumentParser(description="Local work-items ticket operations")
    sub = parser.add_subparsers(dest="cmd", required=True)

    create_p = sub.add_parser("create", help="Create local ticket YAML")
    create_p.add_argument("--ticket", required=True, help="Ticket id e.g. PROJ-1")
    create_p.add_argument("--title", required=True, help="Ticket title")
    create_p.add_argument("--state", default="todo", help="Initial state key")
    create_p.add_argument("--description", help="Path to description markdown")
    create_p.add_argument(
        "--qa-surface",
        "--qa_surface",
        dest="qa_surface",
        choices=["browser", "headless"],
        required=True,
        help="ADR-029 evidence mode (required)",
    )
    create_p.add_argument(
        "--validation-checks-json",
        dest="validation_checks_json",
        help='JSON array of {name, cmd} — required when qa_surface=headless',
    )

    list_p = sub.add_parser("list", help="List local tickets")
    list_p.add_argument("--json", action="store_true")

    board_p = sub.add_parser("regenerate-board", help="Rebuild INDEX.md from tickets")

    args = parser.parse_args()
    if args.cmd == "create":
        validation_checks: list[dict[str, Any]] | None = None
        raw_checks = getattr(args, "validation_checks_json", None)
        if raw_checks:
            parsed = json.loads(raw_checks)
            if not isinstance(parsed, list):
                print("ERROR: --validation-checks-json must be a JSON array", file=sys.stderr)
                return 1
            validation_checks = parsed
        try:
            result = create_ticket_cli(
                args.ticket,
                args.title,
                initial_state=args.state,
                description_path=args.description,
                qa_surface=args.qa_surface,
                validation_checks=validation_checks,
            )
        except ValueError as exc:
            print(f"CREATE FAIL: {exc}", file=sys.stderr)
            return 1
        print(json.dumps(result, indent=2))
        return 0
    if args.cmd == "list":
        ensure_storage_dirs()
        rows: list[dict[str, str]] = []
        for path in sorted(tickets_dir().glob("*.yaml")):
            ticket = _load_yaml(path)
            rows.append(
                {
                    "id": str(ticket.get("id") or path.stem),
                    "uuid": str(ticket.get("uuid") or ""),
                    "status": str(ticket.get("status") or ""),
                    "title": str(ticket.get("title") or ""),
                },
            )
        if args.json:
            print(json.dumps(rows, indent=2))
        else:
            for row in rows:
                print(f"{row['id']}\t{row['status']}\t{row['title']}")
        return 0
    if args.cmd == "regenerate-board":
        path = regenerate_board_index()
        print(f"Board written: {path}")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
