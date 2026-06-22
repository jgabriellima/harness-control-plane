#!/usr/bin/env python3
"""
SDLC workflow run manifest control plane — idempotent resume for composite workflows.

Usage (from repo root):
  python3 .sdlc/bin/sdlc_workflow_manifest.py init --workflow incident-flow --intent "..."
  python3 .sdlc/bin/sdlc_workflow_manifest.py resume [--run-id ID]
  python3 .sdlc/bin/sdlc_workflow_manifest.py validate [--run-id ID]
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required. pip install pyyaml", file=sys.stderr)
    sys.exit(1)

from _sdlc_paths import (
    ACTIVE_WORKFLOW_RUN_POINTER,
    REPO_ROOT,
    SDLC_ROOT,
    WORKFLOW_RUNS_DIR,
    WORKFLOWS_DIR,
)

sys.path.insert(0, str(SDLC_ROOT / "bin"))

VALID_NODE_STATUS = {
    "pending",
    "running",
    "completed",
    "failed",
    "blocked",
    "skipped",
    "retry",
    "awaiting_input",
    "awaiting_approval",
    "awaiting_external",
}
VALID_RUN_STATUS = {
    "pending",
    "in_progress",
    "completed",
    "blocked",
    "failed",
    "paused",
    "awaiting_human",
}
ACTIVE_RUN_STATUSES = {"pending", "in_progress", "blocked", "paused", "retry", "awaiting_human"}
AWAITING_NODE_STATUSES = frozenset({"awaiting_input", "awaiting_approval", "awaiting_external"})
HITL_KIND_TO_NODE_STATUS = {
    "input": "awaiting_input",
    "approval": "awaiting_approval",
    "external": "awaiting_external",
}


def default_continuity() -> dict[str, Any]:
    return {
        "phase": None,
        "awaiting": "none",
        "blocked_by_node": None,
        "required_actions": [],
        "resume_hints": [],
        "conflict_policy": "ask",
        "last_resolution": None,
    }


def default_node_shell(node_id: str) -> dict[str, Any]:
    return {
        "id": node_id,
        "status": "pending",
        "started_at": None,
        "completed_at": None,
        "gate_outcome": None,
        "content_ref": None,
        "artifacts": {},
        "hitl": None,
    }


def resolve_on_failure_target(on_failure: str, order: list[str]) -> str | None:
    """Map control.onFailure return_to_* value to a workflow node id (ADR-026)."""
    prefix = "return_to_"
    if not on_failure.startswith(prefix):
        return None
    slug = on_failure[len(prefix) :].replace("_", "-")
    if slug in order:
        return slug
    return None


def reset_nodes_from(manifest: dict[str, Any], order: list[str], start_node_id: str) -> None:
    """Reset start_node_id and all downstream nodes to pending shells (in-memory redo)."""
    if start_node_id not in order:
        raise ValueError(f"unknown node {start_node_id}")
    start_idx = order.index(start_node_id)
    nodes = manifest.setdefault("nodes", {})
    for nid in order[start_idx:]:
        nodes[nid] = default_node_shell(nid)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping in {path}")
    return data


def _dump_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, sort_keys=False, allow_unicode=True)


def slugify(text: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"run-{base or 'workflow'}-{ts}"


def idempotency_key(workflow_id: str, intent: str) -> str:
    digest = hashlib.sha256(f"{workflow_id}:{intent.strip()}".encode()).hexdigest()[:16]
    return f"idem-{digest}"


def workflow_dsl_rel_path(manifest: dict[str, Any]) -> str:
    workflow = manifest.get("workflow")
    if isinstance(workflow, dict):
        dsl_path = workflow.get("dsl_path")
        if isinstance(dsl_path, str) and dsl_path.strip():
            return dsl_path.strip()
    meta = manifest.get("metadata")
    if isinstance(meta, dict):
        workflow_id = meta.get("workflow_id")
        if isinstance(workflow_id, str) and workflow_id.strip():
            return f".sdlc/workflows/{workflow_id.strip()}.yaml"
    run_id = (meta or {}).get("run_id", "?") if isinstance(meta, dict) else "?"
    raise ValueError(f"manifest {run_id!r} missing workflow.dsl_path")


def get_active_pointer() -> str | None:
    if ACTIVE_WORKFLOW_RUN_POINTER.is_file():
        value = ACTIVE_WORKFLOW_RUN_POINTER.read_text(encoding="utf-8").strip()
        return value or None
    return None


def set_active(run_id: str) -> None:
    WORKFLOW_RUNS_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVE_WORKFLOW_RUN_POINTER.write_text(run_id + "\n", encoding="utf-8")


def resolve_run_id(explicit: str | None) -> str:
    if explicit:
        return explicit
    active = get_active_pointer()
    if active:
        return active
    raise SystemExit("ERROR: no --run-id and no ACTIVE pointer in .sdlc/workflow-runs/ACTIVE")


def manifest_path(run_id: str) -> Path:
    return WORKFLOW_RUNS_DIR / run_id / "manifest.yaml"


def sync_nodes_from_dsl(manifest: dict[str, Any], dsl: dict[str, Any]) -> bool:
    """Add nodes introduced by DSL upgrades (e.g. preflight) as pending."""
    order = node_order_from_dsl(dsl)
    nodes = manifest.setdefault("nodes", {})
    changed = False
    for nid in order:
        if nid not in nodes:
            nodes[nid] = default_node_shell(nid)
            changed = True
        else:
            shell = default_node_shell(nid)
            for key in ("artifacts", "hitl"):
                if key not in nodes[nid]:
                    nodes[nid][key] = shell[key]
                    changed = True
    if "continuity" not in manifest:
        manifest["continuity"] = default_continuity()
        changed = True
    return changed


def load_manifest(run_id: str) -> dict[str, Any]:
    path = manifest_path(run_id)
    if not path.is_file():
        raise SystemExit(f"ERROR: manifest not found: {path}")
    manifest = _load_yaml(path)
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id")
    if workflow_id:
        dsl = load_workflow_dsl(workflow_id)
        if sync_nodes_from_dsl(manifest, dsl):
            save_manifest(run_id, manifest)
    return manifest


def save_manifest(run_id: str, manifest: dict[str, Any]) -> None:
    manifest.setdefault("metadata", {})["updated_at"] = _utc_now()
    _dump_yaml(manifest_path(run_id), manifest)


def orchestrator_session_id(manifest: dict[str, Any]) -> str | None:
    orch = manifest.get("orchestrator")
    if not isinstance(orch, dict):
        return None
    session_id = orch.get("session_id")
    if isinstance(session_id, str) and session_id.strip():
        return session_id.strip()
    return None


def bind_orchestrator_session(
    run_id: str,
    session_id: str,
    *,
    force: bool = False,
) -> tuple[bool, str | None]:
    """
    Bind Cursor conversation_id as the sole orchestrator session for a run.

    Returns (bound, previous_owner). When another session owns the run and force
    is false, returns (False, previous_owner) without mutating the manifest.
    """
    if not session_id.strip():
        raise ValueError("session_id must be non-empty")
    manifest = load_manifest(run_id)
    orch = manifest.setdefault("orchestrator", {})
    previous = orchestrator_session_id(manifest)
    if previous and previous != session_id and not force:
        return False, previous
    orch["session_id"] = session_id.strip()
    orch["session_bound_at"] = _utc_now()
    save_manifest(run_id, manifest)
    return True, previous


# One-release compatibility: legacy run manifests and CLI flags (ADR-020 Phase 1).
WORKFLOW_ID_ALIASES: dict[str, str] = {
    "e2e-orchestration-flow": "goal-flow",
}


def load_workflow_dsl(workflow_id: str) -> dict[str, Any]:
    resolved = WORKFLOW_ID_ALIASES.get(workflow_id, workflow_id)
    path = WORKFLOWS_DIR / f"{resolved}.yaml"
    if not path.is_file():
        raise SystemExit(f"ERROR: workflow DSL not found: {path}")
    return _load_yaml(path)


def _iter_post_condition_checks(dsl: dict[str, Any]):
    for node in dsl.get("spec", {}).get("nodes") or []:
        if not isinstance(node, dict):
            continue
        post = node.get("postCondition")
        if not isinstance(post, dict):
            continue
        for check in post.get("checks") or []:
            if isinstance(check, dict):
                yield check


def workflow_requires_delivery_bundle(dsl: dict[str, Any]) -> bool:
    for check in _iter_post_condition_checks(dsl):
        if "delivery-complete" in str(check.get("ref", "")):
            return True
    return False


def node_order_from_dsl(dsl: dict[str, Any]) -> list[str]:
    nodes = dsl.get("spec", {}).get("nodes") or []
    by_id = {n["id"]: n for n in nodes if isinstance(n, dict) and n.get("id")}
    order: list[str] = []
    visited: set[str] = set()

    def visit(nid: str) -> None:
        if nid in visited or nid not in by_id:
            return
        for dep in by_id[nid].get("dependsOn") or []:
            visit(str(dep))
        if nid not in visited:
            visited.add(nid)
            order.append(nid)

    for nid in by_id:
        visit(nid)
    return order


def _trigger_command(dsl: dict[str, Any]) -> str:
    meta = dsl.get("metadata") or {}
    if isinstance(meta.get("trigger"), str):
        return str(meta["trigger"])
    for trigger in dsl.get("spec", {}).get("triggers") or []:
        if isinstance(trigger, dict) and trigger.get("type") == "command":
            cmd = trigger.get("command")
            if isinstance(cmd, str):
                return cmd
    return "/unknown"


def init_manifest(workflow_id: str, intent: str, run_id: str | None, mode: str) -> str:
    dsl = load_workflow_dsl(workflow_id)
    rid = run_id or slugify(intent)
    if manifest_path(rid).is_file():
        print(f"WARN: manifest exists, use resume: {rid}")
        return rid

    node_ids = node_order_from_dsl(dsl)
    nodes_state = {nid: default_node_shell(nid) for nid in node_ids}
    continuity = default_continuity()
    continuity["phase"] = workflow_id

    manifest: dict[str, Any] = {
        "apiVersion": "sdlc.jambu/v1",
        "kind": "WorkflowRunManifest",
        "metadata": {
            "run_id": rid,
            "workflow_id": workflow_id,
            "recorded_at": _utc_now(),
            "updated_at": _utc_now(),
        },
        "status": "pending",
        "intent": intent.strip(),
        "execution": {
            "mode": mode,
            "idempotency_key": idempotency_key(workflow_id, intent),
            "resume_from_node": None,
        },
        "workflow": {
            "command": _trigger_command(dsl),
            "dsl_path": f".sdlc/workflows/{workflow_id}.yaml",
        },
        "paths": {
            "output_dir": f"output/{workflow_id}/{rid}",
            "trace_path": f".sdlc/workflow-runs/traces/{rid}.yaml",
            "state_path": f".sdlc/workflow-runs/{rid}/workflow-state.yaml",
        },
        "nodes": nodes_state,
        "continuity": continuity,
        "run_mode": None,
        "tickets": {},
        "waves": [],
        "deployment": {},
        "target": {},
        "closure": {},
        "definition_of_done": {
            "all_nodes_completed": False,
            "delivery_bundle_written": False,
            "closure_satisfied": False,
        },
    }
    from sdlc_delivery import seed_manifest_target  # noqa: WPS433

    seed_manifest_target(manifest)
    _dump_yaml(manifest_path(rid), manifest)
    set_active(rid)
    print(f"INIT run_id={rid} workflow={workflow_id} nodes={len(node_ids)}")
    return rid


def cmd_resume(run_id: str) -> None:
    manifest = load_manifest(run_id)
    nodes = manifest.get("nodes") or {}
    next_node = None
    for nid, state in nodes.items():
        if state.get("status") in ("pending", "retry", "failed"):
            next_node = nid
            break
    print(f"RESUME run_id={run_id} status={manifest.get('status')} NEXT_NODE={next_node or 'NONE'}")


def cmd_node_start(run_id: str, node_id: str) -> None:
    manifest = load_manifest(run_id)
    nodes = manifest.setdefault("nodes", {})
    if node_id not in nodes:
        raise SystemExit(f"ERROR: unknown node {node_id}")
    state = nodes[node_id]
    if state.get("status") in ("completed", "skipped"):
        print(f"SKIP node-start {node_id} (idempotent — already {state.get('status')})")
        return
    state["status"] = "running"
    state["started_at"] = _utc_now()
    manifest["status"] = "in_progress"
    save_manifest(run_id, manifest)
    print(f"NODE_START {node_id}")


def sync_continuity_from_nodes(manifest: dict[str, Any], workflow_id: str | None = None) -> None:
    """Recompute run-level continuity from blocking awaiting_* nodes."""
    continuity = manifest.setdefault("continuity", default_continuity())
    if workflow_id:
        continuity["phase"] = workflow_id
    nodes = manifest.get("nodes") or {}
    blocking: list[tuple[str, dict[str, Any]]] = []
    for nid, state in nodes.items():
        status = state.get("status")
        if status in AWAITING_NODE_STATUSES:
            blocking.append((nid, state))
    if not blocking:
        continuity["awaiting"] = "none"
        continuity["blocked_by_node"] = None
        continuity["required_actions"] = []
        if manifest.get("status") == "awaiting_human":
            manifest["status"] = "in_progress"
        return

    nid, state = blocking[0]
    hitl = state.get("hitl") if isinstance(state.get("hitl"), dict) else {}
    kind = hitl.get("kind") or "input"
    continuity["awaiting"] = kind
    continuity["blocked_by_node"] = nid
    continuity["required_actions"] = [
        {
            "id": f"{nid}-hitl",
            "type": "human",
            "description": hitl.get("reason") or f"Human {kind} required for node {nid}",
        },
    ]
    resume_gate = hitl.get("resumeGate")
    if isinstance(resume_gate, str) and resume_gate.strip():
        continuity["required_actions"].append(
            {
                "id": f"{nid}-gate",
                "type": "gate",
                "gate": resume_gate.strip(),
                "description": f"Clear gate {resume_gate.strip()} then resume",
            },
        )
    continuity["resume_hints"] = [
        f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {manifest.get('metadata', {}).get('run_id', '')} --mode agent",
    ]
    manifest["status"] = "awaiting_human"


def set_node_awaiting_human(
    run_id: str,
    node_id: str,
    *,
    hitl_kind: str,
    reason: str,
    resume_gate: str | None = None,
    gate_id: str | None = None,
) -> None:
    manifest = load_manifest(run_id)
    nodes = manifest.setdefault("nodes", {})
    if node_id not in nodes:
        raise SystemExit(f"ERROR: unknown node {node_id}")
    node_status = HITL_KIND_TO_NODE_STATUS.get(hitl_kind)
    if not node_status:
        raise SystemExit(f"ERROR: invalid hitl kind {hitl_kind!r}")
    state = nodes[node_id]
    state["status"] = node_status
    state["gate_outcome"] = "WAIT"
    state["hitl"] = {
        "kind": hitl_kind,
        "since": _utc_now(),
        "reason": reason,
        "resumeGate": resume_gate,
        "gate_id": gate_id,
    }
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id")
    sync_continuity_from_nodes(manifest, workflow_id if isinstance(workflow_id, str) else None)
    save_manifest(run_id, manifest)
    try:
        from sdlc_hitl_handoff import record_hitl_handoff, sync_hitl_tickets_on_pause

        record_hitl_handoff(run_id, manifest)
        sync_hitl_tickets_on_pause(run_id, manifest)
        save_manifest(run_id, manifest)
    except Exception as exc:  # noqa: BLE001 — HITL side effects must not block pause
        print(f"HITL_SIDE_EFFECT_WARN run_id={run_id}: {exc}", file=sys.stderr)
    print(f"NODE_AWAITING {node_id} status={node_status} awaiting={hitl_kind}")


def cmd_node_redo(run_id: str, node_id: str) -> int:
    manifest = load_manifest(run_id)
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id")
    if not workflow_id:
        raise SystemExit("ERROR: manifest missing metadata.workflow_id")
    dsl = load_workflow_dsl(workflow_id)
    order = node_order_from_dsl(dsl)
    if node_id not in order:
        raise SystemExit(f"ERROR: unknown node {node_id}")
    start_idx = order.index(node_id)
    nodes = manifest.setdefault("nodes", {})
    for nid in order[start_idx:]:
        nodes[nid] = default_node_shell(nid)
    sync_continuity_from_nodes(manifest, workflow_id)
    manifest["status"] = "in_progress"
    save_manifest(run_id, manifest)
    print(f"NODE_REDO from={node_id} reset={order[start_idx:]}")
    return 0


def cmd_node_complete(run_id: str, node_id: str, outcome: str, gate: str | None) -> None:
    manifest = load_manifest(run_id)
    nodes = manifest.setdefault("nodes", {})
    if node_id not in nodes:
        raise SystemExit(f"ERROR: unknown node {node_id}")
    state = nodes[node_id]
    if state.get("status") == "completed" and outcome == "PASS":
        print(f"SKIP node-complete {node_id} (idempotent)")
        return
    state["completed_at"] = _utc_now()
    state["gate_outcome"] = outcome
    state["content_ref"] = f"cognitive/{node_id}.json"
    if outcome == "PASS":
        state["status"] = "completed"
    elif outcome == "SKIP":
        state["status"] = "skipped"
    elif outcome == "RETRY":
        state["status"] = "retry"
    else:
        state["status"] = "failed"
    state["hitl"] = None
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id")
    sync_continuity_from_nodes(manifest, workflow_id if isinstance(workflow_id, str) else None)
    save_manifest(run_id, manifest)
    print(f"NODE_COMPLETE {node_id} outcome={outcome} gate={gate or '-'}")


def cmd_validate(run_id: str) -> int:
    manifest = load_manifest(run_id)
    nodes = manifest.get("nodes") or {}
    errors: list[str] = []
    for nid, state in nodes.items():
        if state.get("status") not in ("completed", "skipped"):
            errors.append(f"node {nid} status={state.get('status')}")

    dod = manifest.get("definition_of_done") or {}
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id")
    dsl: dict[str, Any] = {}
    if isinstance(workflow_id, str) and workflow_id.strip():
        dsl = load_workflow_dsl(workflow_id.strip())

    if workflow_requires_delivery_bundle(dsl) and not dod.get("delivery_bundle_written"):
        errors.append("delivery_bundle_written false")

    output_rel = (manifest.get("paths") or {}).get("output_dir", "")
    if output_rel and dod.get("delivery_bundle_written"):
        output_dir = (REPO_ROOT / output_rel).resolve()
        from sdlc_workflow_gate import check_delivery_complete  # noqa: WPS433

        delivery = check_delivery_complete(output_dir, nodes)
        if not delivery.passed:
            errors.append(delivery.message)

    if errors:
        print("VALIDATE FAIL:")
        for err in errors:
            print(f"  - {err}")
        return 1
    print("VALIDATE PASS")
    return 0


def cmd_register_ticket(
    run_id: str,
    ticket_id: str,
    *,
    worktree: str | None = None,
    branch: str | None = None,
    pr_url: str | None = None,
    status: str = "pending",
    role: str = "vertical-slice",
    uuid: str | None = None,
    parent_run_id: str | None = None,
    child_run_id: str | None = None,
    qa_surface: str | None = None,
    validation_checks: list[dict[str, Any]] | None = None,
) -> int:
    manifest = load_manifest(run_id)
    tickets = manifest.setdefault("tickets", {})
    ticket: dict[str, Any] = {
        "role": role,
        "status": status,
        "worktree": worktree,
        "branch": branch,
        "pr_url": pr_url,
        "feature_flow_complete": False,
        "feature_flow_stages": {},
        "harness": {},
    }
    if isinstance(qa_surface, str) and qa_surface.strip():
        ticket["qa_surface"] = qa_surface.strip().lower()
    if isinstance(validation_checks, list) and validation_checks:
        ticket["validation_checks"] = validation_checks
    if parent_run_id:
        ticket["parent_run_id"] = parent_run_id
    if child_run_id:
        ticket["child_run_id"] = child_run_id

    from sdlc_profile import hydrate_ticket_qa_fields, validate_ticket_qa_contract  # noqa: WPS433

    hydrate_ticket_qa_fields(ticket_id, ticket)

    contract_errors = validate_ticket_qa_contract(ticket, ticket_id)
    if contract_errors:
        print("REGISTER-TICKET FAIL:", file=sys.stderr)
        for err in contract_errors:
            print(f"  - {err}", file=sys.stderr)
        print(
            "  Fix: pass --qa-surface browser|headless "
            "[--validation-checks-json '[{\"name\":\"pytest\",\"cmd\":[\"python3\",\"-m\",\"pytest\",\"-q\"]}]'] "
            "or set qa_surface on the work-item ticket before register.",
            file=sys.stderr,
        )
        return 1

    if uuid:
        ticket["uuid"] = uuid
    elif not uuid:
        try:
            from sdlc_dsl_bindings import work_items_provider  # noqa: WPS433

            provider_id, _entry, _config_path = work_items_provider(REPO_ROOT)
            if provider_id == "local-work-items":
                from local_ticket_state import ensure_local_ticket  # noqa: WPS433

                ticket["uuid"] = ensure_local_ticket(
                    ticket_id,
                    qa_surface=str(ticket["qa_surface"]) if ticket.get("qa_surface") else None,
                    validation_checks=(
                        ticket.get("validation_checks")
                        if isinstance(ticket.get("validation_checks"), list)
                        else None
                    ),
                )
        except RuntimeError:
            pass

    tickets[ticket_id] = ticket

    from work_items_sync import apply_harness_fields_to_ticket  # noqa: WPS433

    apply_harness_fields_to_ticket(run_id, manifest, ticket)
    waves = manifest.setdefault("waves", [])
    if not waves:
        waves.append(
            {
                "id": "wave-1",
                "name": "wave-1",
                "parallel": True,
                "depends_on": [],
                "tickets": [ticket_id],
                "status": "pending",
            },
        )
    elif ticket_id not in (waves[0].get("tickets") or []):
        waves[0].setdefault("tickets", []).append(ticket_id)
    save_manifest(run_id, manifest)
    print(f"REGISTERED ticket {ticket_id} on run {run_id}")
    return 0


def cmd_list_runs(active_only: bool) -> None:
    if not WORKFLOW_RUNS_DIR.is_dir():
        return
    for entry in sorted(WORKFLOW_RUNS_DIR.iterdir()):
        if not entry.is_dir() or entry.name == "ACTIVE":
            continue
        mf = entry / "manifest.yaml"
        if not mf.is_file():
            continue
        manifest = _load_yaml(mf)
        status = manifest.get("status", "?")
        if active_only and status not in ACTIVE_RUN_STATUSES:
            continue
        wf = (manifest.get("metadata") or {}).get("workflow_id", "?")
        print(f"{entry.name}\t{status}\t{wf}")


def main() -> int:
    parser = argparse.ArgumentParser(description="SDLC workflow run manifest")
    sub = parser.add_subparsers(dest="cmd", required=True)

    init_parser = sub.add_parser("init")
    init_parser.add_argument("--workflow", required=True)
    init_parser.add_argument("--intent", required=True)
    init_parser.add_argument("--run-id")
    init_parser.add_argument("--mode", default="stub", choices=["stub", "agent"])

    resume_parser = sub.add_parser("resume")
    resume_parser.add_argument("--run-id")

    node_start_parser = sub.add_parser("node-start")
    node_start_parser.add_argument("node_id")
    node_start_parser.add_argument("--run-id")

    node_complete_parser = sub.add_parser("node-complete")
    node_complete_parser.add_argument("node_id")
    node_complete_parser.add_argument("--outcome", required=True, choices=["PASS", "FAIL", "RETRY", "SKIP"])
    node_complete_parser.add_argument("--gate")
    node_complete_parser.add_argument("--run-id")

    validate_parser = sub.add_parser("validate")
    validate_parser.add_argument("--run-id")

    list_parser = sub.add_parser("list-runs")
    list_parser.add_argument("--active", action="store_true")

    reg_parser = sub.add_parser("register-ticket", help="Register ticket on workflow-run manifest")
    reg_parser.add_argument("--ticket", required=True)
    reg_parser.add_argument("--worktree")
    reg_parser.add_argument("--branch")
    reg_parser.add_argument("--pr-url")
    reg_parser.add_argument("--status", default="pending")
    reg_parser.add_argument("--uuid", help="Plane issue UUID for work_items sync")
    reg_parser.add_argument("--parent-run-id", help="Parent goal run id when ticket uses child run")
    reg_parser.add_argument("--child-run-id", help="Delegated feature-flow run id")
    reg_parser.add_argument("--qa-surface", "--qa_surface", dest="qa_surface", choices=["browser", "headless"], help="Ticket evidence mode (ADR-029)")
    reg_parser.add_argument(
        "--validation-checks-json",
        help='JSON array of {name, cmd} for headless tickets, e.g. \'[{"name":"pytest","cmd":["python3","-m","pytest","-q"]}]\'',
    )
    reg_parser.add_argument("--run-id")

    redo_parser = sub.add_parser("node-redo", help="Reset node and downstream nodes to pending")
    redo_parser.add_argument("node_id")
    redo_parser.add_argument("--run-id")

    args = parser.parse_args()

    if args.cmd == "init":
        init_manifest(args.workflow, args.intent, args.run_id, args.mode)
        return 0
    if args.cmd == "list-runs":
        cmd_list_runs(args.active)
        return 0

    run_id = resolve_run_id(getattr(args, "run_id", None))
    if args.cmd == "resume":
        cmd_resume(run_id)
        return 0
    if args.cmd == "node-start":
        cmd_node_start(run_id, args.node_id)
        return 0
    if args.cmd == "node-complete":
        cmd_node_complete(run_id, args.node_id, args.outcome, args.gate)
        return 0
    if args.cmd == "validate":
        return cmd_validate(run_id)
    if args.cmd == "register-ticket":
        run_id = resolve_run_id(args.run_id)
        validation_checks: list[dict[str, Any]] | None = None
        raw_checks = getattr(args, "validation_checks_json", None)
        if isinstance(raw_checks, str) and raw_checks.strip():
            import json

            parsed = json.loads(raw_checks)
            if isinstance(parsed, list):
                validation_checks = [item for item in parsed if isinstance(item, dict)]
        return cmd_register_ticket(
            run_id,
            args.ticket,
            worktree=args.worktree,
            branch=args.branch,
            pr_url=args.pr_url,
            status=args.status,
            uuid=getattr(args, "uuid", None),
            parent_run_id=getattr(args, "parent_run_id", None),
            child_run_id=getattr(args, "child_run_id", None),
            qa_surface=getattr(args, "qa_surface", None),
            validation_checks=validation_checks,
        )
    if args.cmd == "node-redo":
        run_id = resolve_run_id(args.run_id)
        return cmd_node_redo(run_id, args.node_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
