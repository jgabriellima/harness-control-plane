#!/usr/bin/env python3
"""
Legacy .sdlc/runs/ manifest CLI — read-only archive (ADR-020). Use /sdlc:goal + sdlc_workflow_run.py.

Former /sdlc:e2e manifest control plane for idempotent orchestration runs.

Usage:
  python3 .sdlc/bin/sdlc_e2e_manifest.py init --intent "..." [--run-id slug] [--mode greenfield]
  python3 .sdlc/bin/sdlc_e2e_manifest.py status [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py resume [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py stage-start STAGE [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py stage-complete STAGE [--artifacts path,...] [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py stage-skip STAGE [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py stage-fail STAGE --reason "..." [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py set-mode MODE [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py set-target --route /path [--reference-url URL] [--persistence sqlite]
  python3 .sdlc/bin/sdlc_e2e_manifest.py register-epic --ticket JAMBU-N --uuid UUID [--spec path]
  python3 .sdlc/bin/sdlc_e2e_manifest.py register-ticket --ticket JAMBU-N --uuid UUID --role vertical-slice ...
  python3 .sdlc/bin/sdlc_e2e_manifest.py register-wave --id wave-1 --tickets JAMBU-10,JAMBU-11 [--parallel]
  python3 .sdlc/bin/sdlc_e2e_manifest.py wave-complete WAVE_ID [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py register-subagent-dispatch --ticket JAMBU-N [--agent implementer] [--session-id ID]
  python3 .sdlc/bin/sdlc_e2e_manifest.py feature-flow-stage --ticket JAMBU-N --stage planning|implementation|review|qa|pr_creation
  python3 .sdlc/bin/sdlc_e2e_manifest.py mark-done [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py validate [--run-id slug]
  python3 .sdlc/bin/sdlc_e2e_manifest.py list-runs [--active]
  python3 .sdlc/bin/sdlc_e2e_manifest.py resolve --query "continuar clone reddit"
  python3 .sdlc/bin/sdlc_e2e_manifest.py resolve --query "..." [--json]
"""
from __future__ import annotations

import argparse
import re
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required. Install: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

from _sdlc_paths import BIN_DIR, REPO_ROOT, SDLC_ROOT

RUNS_DIR = SDLC_ROOT / "runs"
TEMPLATE_PATH = SDLC_ROOT / "templates" / "e2e-orchestration-manifest.yaml"
ACTIVE_POINTER = RUNS_DIR / "ACTIVE"

# Deterministic gates — hard fail on transition if requirements not met
sys.path.insert(0, str(BIN_DIR))
from sdlc_dsl_bindings import (  # noqa: E402
    gate_for_review_manifest_statuses,
    manifest_ticket_boolean_fields,
    syncable_manifest_statuses,
)
from sdlc_gate_check import (  # noqa: E402
    format_gate_errors,
    gate_board_sync,
    gate_evidence_dir,
    gate_execution_stage,
    gate_manifest_integrity,
    gate_mark_done,
    gate_stage_complete,
    gate_stage_start,
    gate_ticket_for_review,
    gate_ticket_protocol,
    gate_visual_fidelity,
    gate_worktree_isolation,
    evidence_path,
    ticket_repo_root,
)

STAGE_ORDER = [
    "hydrate",
    "classify",
    "discovery",
    "decomposition",
    "plane-hierarchy",
    "architecture",
    "workspace-rebind",
    "wave-planning",
    "execution",
    "integration",
    "deploy",
    "post-deploy",
    "board-sync",
    "reflect",
]

BOOLEAN_DOD_FIELDS = frozenset(
    {
        "implementation_working",
        "deployed_to_production",
        "all_tickets_done",
        "all_prs_merged",
        "all_evidence_uploaded",
        "board_fully_updated",
        "handoff_recorded",
    }
)

VALID_MODES = {"greenfield", "feature", "fix", "content"}
VALID_STAGE_STATUS = {"pending", "in_progress", "completed", "skipped", "failed"}
VALID_RUN_STATUS = {"pending", "in_progress", "completed", "blocked", "paused"}

ACTIVE_RUN_STATUSES = {"pending", "in_progress", "blocked", "paused"}


def _artifact_name_variants(name: str) -> list[str]:
    variants = {name}
    if "_" in name:
        variants.add(name.replace("_", "-"))
    if "-" in name:
        variants.add(name.replace("-", "_"))
    return list(variants)


def normalize_stage_artifacts(run_id: str, artifacts: list[str]) -> list[str]:
    """Deduplicate manifest artifact entries; prefer paths that exist under the run dir."""
    repo = REPO_ROOT.resolve()
    run_dir = (RUNS_DIR / run_id).resolve() if run_id else None
    by_basename: dict[str, tuple[str, float]] = {}

    for raw in artifacts:
        p = raw.strip()
        if not p or p.endswith("/"):
            continue
        path = Path(p)
        candidates: list[Path] = []
        if path.is_absolute():
            candidates.append(path)
        else:
            candidates.append((repo / p).resolve())
            if len(path.parts) == 1 and run_dir is not None:
                for variant in _artifact_name_variants(path.name):
                    candidates.append((run_dir / variant).resolve())

        best_rel: str | None = None
        best_score = -1.0
        for candidate in candidates:
            try:
                rel = candidate.relative_to(repo).as_posix()
            except ValueError:
                continue
            exists = candidate.is_file()
            under_run = run_id and f".sdlc/runs/{run_id}/" in rel
            score = (10.0 if exists else 0.0) + (5.0 if under_run else 0.0) + len(rel) * 0.01
            if score > best_score:
                best_score = score
                best_rel = rel

        if not best_rel:
            continue
        base = Path(best_rel).name
        prev = by_basename.get(base)
        if prev is None or best_score > prev[1]:
            by_basename[base] = (best_rel, best_score)

    return [entry[0] for entry in by_basename.values()]

CONTINUATION_KEYWORDS = {
    "continuar", "continue", "retomar", "resume", "seguir", "prosseguir",
    "voltar", "pick up", "where we left", "de onde paramos", "reiniciar run",
    "continua", "retoma",
}

NEW_INTENT_KEYWORDS = {
    "crie", "criar", "create", "build", "implemente", "implementar", "novo",
    "new", "clone", "faça", "faca", "make", "scaffold", "from scratch",
}

STOPWORDS = {
    "a", "o", "os", "as", "de", "da", "do", "das", "dos", "em", "no", "na",
    "nos", "nas", "um", "uma", "e", "ou", "para", "com", "que", "the", "an",
    "and", "or", "to", "in", "on", "at", "for", "with", "is", "it", "this",
    "precisa", "somente", "basico", "basic", "local", "localmente",
}


def get_active_pointer() -> str | None:
    if ACTIVE_POINTER.exists():
        value = ACTIVE_POINTER.read_text(encoding="utf-8").strip()
        return value or None
    return None


def iter_run_manifests() -> list[tuple[str, dict[str, Any], Path]]:
    if not RUNS_DIR.exists():
        return []
    results: list[tuple[str, dict[str, Any], Path]] = []
    for run_dir in sorted(RUNS_DIR.iterdir()):
        if not run_dir.is_dir():
            continue
        mf = run_dir / "manifest.yaml"
        if not mf.exists():
            continue
        results.append((run_dir.name, load_yaml(mf), mf))
    return results


def is_active_run(manifest: dict[str, Any]) -> bool:
    return manifest.get("status") in ACTIVE_RUN_STATUSES


def tokenize(text: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9/]+", text.lower())
    return {t for t in tokens if len(t) >= 3 and t not in STOPWORDS}


def has_continuation_intent(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in CONTINUATION_KEYWORDS)


def has_new_intent_signals(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in NEW_INTENT_KEYWORDS)


def current_stage_summary(manifest: dict[str, Any]) -> str:
    for stage_id in STAGE_ORDER:
        stage = manifest.get("stages", {}).get(stage_id, {})
        if stage.get("status") == "in_progress":
            return stage_id
    nxt = next_pending_stage(manifest)
    return nxt or "complete"


def score_run_against_query(
    run_id: str,
    manifest: dict[str, Any],
    query: str,
    *,
    active_pointer: str | None,
    continuation: bool,
) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    q_lower = query.lower()
    q_tokens = tokenize(query)

    if run_id.lower() in q_lower:
        score += 100
        reasons.append("run_id explicit in query")

    run_slug_tokens = set(run_id.lower().split("-"))
    slug_overlap = q_tokens & run_slug_tokens
    if slug_overlap:
        score += 15 * len(slug_overlap)
        reasons.append(f"run_id token overlap: {', '.join(sorted(slug_overlap))}")

    intent = str(manifest.get("intent", ""))
    intent_tokens = tokenize(intent)
    overlap = q_tokens & intent_tokens
    if overlap:
        score += 8 * len(overlap)
        reasons.append(f"intent token overlap: {', '.join(sorted(list(overlap)[:5]))}")

    target = manifest.get("target") or {}
    route = target.get("route")
    if route and route.lower() in q_lower:
        score += 35
        reasons.append(f"route match: {route}")

    epic = manifest.get("epic") or {}
    ticket_id = epic.get("ticket_id")
    if ticket_id and ticket_id.lower() in q_lower:
        score += 45
        reasons.append(f"epic ticket match: {ticket_id}")

    for tid, ticket in (manifest.get("tickets") or {}).items():
        title = str(ticket.get("title", ""))
        if tid.lower() in q_lower:
            score += 30
            reasons.append(f"child ticket match: {tid}")
        title_tokens = tokenize(title)
        title_overlap = q_tokens & title_tokens
        if title_overlap:
            score += 5 * len(title_overlap)
            reasons.append(f"ticket title overlap ({tid})")

    ref_url = target.get("reference_url") or ""
    if ref_url:
        host = re.sub(r"^https?://", "", ref_url).split("/")[0].lower()
        host_key = host.replace("www.", "").split(".")[0]
        if host_key and host_key in q_lower:
            score += 25
            reasons.append(f"reference host match: {host_key}")

    if active_pointer == run_id:
        if continuation:
            score += 20
            reasons.append("ACTIVE pointer + continuation intent")
        else:
            score += 8
            reasons.append("ACTIVE pointer")

    if manifest.get("status") == "in_progress":
        score += 5
        reasons.append("status in_progress")

    return score, reasons


def build_candidate(
    run_id: str,
    manifest: dict[str, Any],
    score: int,
    reasons: list[str],
    active_pointer: str | None,
) -> dict[str, Any]:
    epic = manifest.get("epic") or {}
    target = manifest.get("target") or {}
    return {
        "run_id": run_id,
        "score": score,
        "status": manifest.get("status"),
        "mode": manifest.get("mode"),
        "intent": str(manifest.get("intent", "")).strip(),
        "next_stage": current_stage_summary(manifest),
        "route": target.get("route"),
        "epic_ticket": epic.get("ticket_id"),
        "updated_at": manifest.get("updated_at"),
        "is_active_pointer": run_id == active_pointer,
        "reasons": reasons,
    }


def decide_resolve_action(
    query: str,
    candidates: list[dict[str, Any]],
    active_runs_count: int,
) -> tuple[str, str, str]:
    """Return (action, confidence, reason)."""
    continuation = has_continuation_intent(query)
    new_signals = has_new_intent_signals(query)

    if not candidates:
        if continuation:
            return "none", "high", "continuation intent but no active runs found"
        return "new", "high", "no active runs — safe to start new run"

    ranked = sorted(candidates, key=lambda c: c["score"], reverse=True)
    best = ranked[0]
    second_score = ranked[1]["score"] if len(ranked) > 1 else 0
    margin = best["score"] - second_score

    # Single active run + continuation language → obvious resume
    if active_runs_count == 1 and continuation:
        return "resume", "high", "single active run + continuation intent"

    # Strong dominant match
    if best["score"] >= 60 and margin >= 30:
        if new_signals and not continuation and best["score"] < 80:
            return (
                "confirm",
                "medium",
                f"new-intent signals but strong match to existing run ({best['run_id']})",
            )
        return "resume", "high", f"dominant match (score={best['score']}, margin={margin})"

    # Continuation + clear winner (even if score < 60)
    if continuation and best["score"] >= 45 and margin >= 25:
        return "resume", "high", f"continuation intent + clear match ({best['run_id']})"

    # Moderate match — confirm with user
    if best["score"] >= 35 and (margin < 25 or len(ranked) > 1):
        return (
            "confirm",
            "medium",
            f"plausible match ({best['run_id']}) but not unambiguous (margin={margin})",
        )

    # Multiple plausible candidates
    plausible = [c for c in ranked if c["score"] >= 25]
    if len(plausible) >= 2:
        return "ambiguous", "low", f"{len(plausible)} active runs match query — user must choose"

    # Continuation requested but weak match
    if continuation and best["score"] >= 20:
        return "confirm", "medium", "continuation intent with weak single candidate"

    if continuation and best["score"] < 20:
        return "ambiguous", "low", "continuation intent but no confident run match"

    # Default: new run (creation intent or unrelated query)
    if new_signals or best["score"] < 25:
        if best["score"] >= 25:
            return (
                "confirm",
                "medium",
                f"creation intent but partial overlap with {best['run_id']}",
            )
        return "new", "high", "query does not match active runs — start new run"

    return "confirm", "medium", "unable to auto-resolve — confirm with user"


def cmd_resolve(args: argparse.Namespace) -> int:
    query = args.query.strip()
    if not query:
        raise SystemExit("ERROR: --query is required")

    active_pointer = get_active_pointer()
    all_runs = iter_run_manifests()
    active_runs = [(rid, m, p) for rid, m, p in all_runs if is_active_run(m)]

    scored: list[dict[str, Any]] = []
    continuation = has_continuation_intent(query)
    for run_id, manifest, _path in active_runs:
        score, reasons = score_run_against_query(
            run_id,
            manifest,
            query,
            active_pointer=active_pointer,
            continuation=continuation,
        )
        if score > 0 or continuation:
            scored.append(build_candidate(run_id, manifest, score, reasons, active_pointer))

    action, confidence, reason = decide_resolve_action(query, scored, len(active_runs))

    ranked = sorted(scored, key=lambda c: c["score"], reverse=True)
    selected_run_id = ranked[0]["run_id"] if action == "resume" and ranked else None

    payload = {
        "action": action,
        "confidence": confidence,
        "reason": reason,
        "query": query,
        "continuation_intent": continuation,
        "new_intent_signals": has_new_intent_signals(query),
        "active_runs_count": len(active_runs),
        "active_pointer": active_pointer,
        "selected_run_id": selected_run_id,
        "candidates": ranked,
    }

    if args.json:
        import json
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    print(f"RESOLVE_ACTION={action}")
    print(f"CONFIDENCE={confidence}")
    print(f"REASON={reason}")
    print(f"ACTIVE_RUNS={len(active_runs)}")
    if active_pointer:
        print(f"ACTIVE_POINTER={active_pointer}")
    if payload["selected_run_id"]:
        print(f"RESOLVE_RUN_ID={payload['selected_run_id']}")
    print(f"CONTINUATION_INTENT={'true' if continuation else 'false'}")
    print("CANDIDATES:")
    if not scored:
        print("  (none)")
    else:
        for i, c in enumerate(payload["candidates"], start=1):
            intent_preview = c["intent"][:70].replace("\n", " ")
            epic = c["epic_ticket"] or "—"
            route = c["route"] or "—"
            pointer = " [ACTIVE]" if c["is_active_pointer"] else ""
            print(
                f"  {i}. run_id={c['run_id']} score={c['score']} status={c['status']} "
                f"next_stage={c['next_stage']} epic={epic} route={route}{pointer}"
            )
            print(f"     intent: {intent_preview}")
    return 0


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:60] or "run"


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Invalid manifest at {path}")
    return data


def save_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)


def _stage_duration_ms(stage: dict[str, Any]) -> int | None:
    started = stage.get("started_at")
    completed = stage.get("completed_at")
    if not started or not completed:
        return None
    try:
        start_dt = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(str(completed).replace("Z", "+00:00"))
        return int((end_dt - start_dt).total_seconds() * 1000)
    except ValueError:
        return None


def _emit_manifest_workflow(
    run_id: str,
    name: str,
    status: str,
    *,
    stage_id: str | None = None,
    wave_id: str | None = None,
    ticket_id: str | None = None,
    command: str | None = None,
    duration_ms: int | None = None,
    outputs: dict[str, Any] | None = None,
) -> None:
    try:
        import sdlc_trace_collector as collector

        metadata: dict[str, Any] = {
            "run_id": run_id,
            "manifest_command": command or "unknown",
        }
        if stage_id:
            metadata["stage_id"] = stage_id
        if wave_id:
            metadata["wave_id"] = wave_id
        if ticket_id:
            metadata["ticket_id"] = ticket_id
        collector.emit_workflow_event(
            name,
            status,
            metadata,
            outputs,
            duration_ms=duration_ms,
            thread_id=f"run:{run_id}",
        )
    except Exception:
        pass


def save_manifest(run_id: str, path: Path, data: dict[str, Any], *, workflow: dict[str, Any] | None = None) -> None:
    save_yaml(path, data)
    if workflow:
        _emit_manifest_workflow(run_id, **workflow)


def manifest_path(run_id: str) -> Path:
    return RUNS_DIR / run_id / "manifest.yaml"


def resolve_run_id(explicit: str | None) -> str:
    if explicit:
        return explicit
    if ACTIVE_POINTER.exists():
        run_id = ACTIVE_POINTER.read_text(encoding="utf-8").strip()
        if run_id:
            return run_id
    raise SystemExit("ERROR: No run_id provided and no active run. Use --run-id or run init first.")


def migrate_manifest_stages(manifest: dict[str, Any], path: Path) -> None:
    """Insert stages added to STAGE_ORDER after manifest creation (forward-compatible resume)."""
    if not TEMPLATE_PATH.is_file():
        return
    template = load_yaml(TEMPLATE_PATH)
    template_stages = template.get("stages") or {}
    if not isinstance(template_stages, dict):
        return
    stages = manifest.setdefault("stages", {})
    changed = False
    for stage_id in STAGE_ORDER:
        if stage_id not in stages and stage_id in template_stages:
            stage_def = template_stages[stage_id]
            stages[stage_id] = dict(stage_def) if isinstance(stage_def, dict) else {"status": "pending"}
            changed = True
    if changed:
        touch_manifest(manifest)
        save_yaml(path, manifest)
        # Retroactive: skip rebind when run already passed wave-planning (pre-ADR-012 manifests)
        rebind = stages.get("workspace-rebind") or {}
        if rebind.get("status") == "pending":
            later_done = any(
                (stages.get(sid) or {}).get("status") in ("completed", "skipped")
                for sid in ("wave-planning", "execution", "integration")
            )
            if later_done:
                rebind["status"] = "skipped"
                rebind["completed_at"] = utc_now()
                touch_manifest(manifest)
                save_yaml(path, manifest)


def load_manifest(run_id: str | None = None) -> tuple[str, dict[str, Any], Path]:
    rid = resolve_run_id(run_id)
    path = manifest_path(rid)
    if not path.exists():
        raise SystemExit(f"ERROR: Manifest not found at {path}")
    manifest = load_yaml(path)
    migrate_manifest_stages(manifest, path)
    return rid, manifest, path


def touch_manifest(data: dict[str, Any]) -> None:
    data["updated_at"] = utc_now()


def _coerce_ticket_value(field: str, value: str) -> Any:
    """Store YAML booleans for known boolean fields (ADR-012)."""
    if field in manifest_ticket_boolean_fields() or field in BOOLEAN_DOD_FIELDS:
        lowered = value.strip().lower()
        if lowered in ("true", "1", "yes"):
            return True
        if lowered in ("false", "0", "no"):
            return False
    return value


def _sync_definition_of_done(
    manifest: dict[str, Any],
    repo_root: Path,
    *,
    event: str,
    stage_id: str | None = None,
    handoff_path: Path | None = None,
) -> None:
    """Auto-sync definition_of_done flags on stage-complete and record-handoff (ADR-012)."""
    dod = manifest.setdefault("definition_of_done", {})

    if event == "stage-complete" and stage_id == "execution":
        dod["implementation_working"] = True
        tickets = manifest.get("tickets") or {}
        slice_tickets = [
            t for t in tickets.values() if t.get("role") not in ("epic", "fix")
        ]
        if slice_tickets and all(t.get("status") == "done" for t in slice_tickets):
            dod["all_tickets_done"] = True
        if slice_tickets and all(t.get("pr_url") for t in slice_tickets):
            merged = all(t.get("merged_at") for t in slice_tickets)
            if merged:
                dod["all_prs_merged"] = True

    if event == "stage-complete" and stage_id == "deploy":
        dod["deployed_to_production"] = True

    if event == "stage-complete" and stage_id == "board-sync":
        dod["all_evidence_uploaded"] = True
        dod["board_fully_updated"] = True

    if event == "record-handoff" and handoff_path is not None:
        try:
            content = handoff_path.read_text(encoding="utf-8")
        except OSError:
            content = ""
        if "STUB — Agent did not enrich" not in content:
            dod["handoff_recorded"] = True


def set_active(run_id: str) -> None:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVE_POINTER.write_text(run_id, encoding="utf-8")


def clear_active() -> None:
    if ACTIVE_POINTER.exists():
        ACTIVE_POINTER.unlink(missing_ok=True)


def cmd_init(args: argparse.Namespace) -> int:
    run_id = args.run_id or f"{slugify(args.intent[:40])}-{datetime.now().strftime('%Y%m%d')}"
    path = manifest_path(run_id)
    if path.exists() and not args.force:
        print(f"Run already exists: {run_id}")
        print(f"Resume with: /sdlc:e2e --resume {run_id}")
        return 1

    template = load_yaml(TEMPLATE_PATH)
    now = utc_now()
    manifest = deepcopy(template)
    manifest["run_id"] = run_id
    manifest["status"] = "pending"
    manifest["mode"] = args.mode
    manifest["intent"] = args.intent.strip()
    manifest["created_at"] = now
    manifest["updated_at"] = now

    if args.route:
        manifest["target"]["route"] = args.route
    if args.reference_url:
        manifest["target"]["reference_url"] = args.reference_url
    if args.persistence:
        manifest["target"]["persistence"] = args.persistence

    save_yaml(path, manifest)
    set_active(run_id)
    print(f"Created run: {run_id}")
    print(f"Manifest: {path}")
    print(f"Mode: {args.mode}")
    return 0


def next_pending_stage(manifest: dict[str, Any]) -> str | None:
    mode = manifest.get("mode", "greenfield")
    stages = manifest.get("stages", {})
    for stage_id in STAGE_ORDER:
        stage = stages.get(stage_id, {})
        status = stage.get("status", "pending")
        if status in ("completed", "skipped"):
            continue
        skip_modes = stage.get("skip_in_modes", [])
        if mode in skip_modes:
            continue
        return stage_id
    return None


def cmd_status(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    print(f"Run: {run_id}")
    print(f"Status: {manifest.get('status')}")
    print(f"Mode: {manifest.get('mode')}")
    print(f"Intent: {manifest.get('intent', '')[:120]}...")
    print(f"Manifest: {path}")
    print()
    print("Stages:")
    for stage_id in STAGE_ORDER:
        stage = manifest.get("stages", {}).get(stage_id, {})
        status = stage.get("status", "pending")
        marker = "→" if status == "in_progress" else " "
        print(f"  {marker} {stage_id}: {status}")
    print()
    epic = manifest.get("epic", {})
    if epic.get("ticket_id"):
        print(f"Epic: {epic['ticket_id']} ({epic.get('uuid', 'no uuid')})")
    tickets = manifest.get("tickets", {})
    if tickets:
        print(f"Tickets: {len(tickets)}")
        for tid, t in tickets.items():
            print(f"  {tid}: {t.get('status', 'pending')} — {t.get('title', '')[:60]}")
    waves = manifest.get("waves", [])
    if waves:
        print(f"Waves: {len(waves)}")
        for w in waves:
            print(f"  {w.get('id')}: {w.get('status', 'pending')} — {w.get('tickets', [])}")
    dod = manifest.get("definition_of_done", {})
    done_count = sum(1 for v in dod.values() if v)
    print(f"\nDefinition of Done: {done_count}/{len(dod)}")
    return 0


def cmd_resume(args: argparse.Namespace) -> int:
    run_id, manifest, _ = load_manifest(args.run_id)
    set_active(run_id)
    nxt = next_pending_stage(manifest)
    if nxt is None:
        print(f"Run {run_id}: all stages complete or skipped.")
        return 0
    stage = manifest["stages"][nxt]
    print(f"RESUME_RUN={run_id}")
    print(f"NEXT_STAGE={nxt}")
    print(f"STAGE_NAME={stage.get('name', nxt)}")
    print(f"STAGE_COMMAND={stage.get('command', 'internal')}")
    print(f"MODE={manifest.get('mode')}")
    return 0


def update_stage(
    manifest: dict[str, Any],
    stage_id: str,
    status: str,
    *,
    artifacts: list[str] | None = None,
    fail_reason: str | None = None,
) -> None:
    if stage_id not in STAGE_ORDER:
        raise SystemExit(f"ERROR: Unknown stage '{stage_id}'. Valid: {', '.join(STAGE_ORDER)}")
    if status not in VALID_STAGE_STATUS:
        raise SystemExit(f"ERROR: Invalid status '{status}'")

    stages = manifest.setdefault("stages", {})
    stage = stages.setdefault(stage_id, {"name": stage_id, "status": "pending"})
    now = utc_now()

    if status == "in_progress":
        stage["status"] = "in_progress"
        stage["started_at"] = stage.get("started_at") or now
        manifest["status"] = "in_progress"
    elif status == "completed":
        if stage.get("status") == "completed":
            print(f"Stage '{stage_id}' already completed — idempotent skip.")
            return
        stage["status"] = "completed"
        stage["completed_at"] = now
        if artifacts:
            existing = stage.setdefault("artifacts", [])
            combined = list(existing)
            for a in artifacts:
                if a not in combined:
                    combined.append(a)
            run_id = str(manifest.get("run_id") or "")
            stage["artifacts"] = normalize_stage_artifacts(run_id, combined)
    elif status == "skipped":
        stage["status"] = "skipped"
        stage["completed_at"] = now
    elif status == "failed":
        stage["status"] = "failed"
        stage["fail_reason"] = fail_reason or "unspecified"
        manifest["status"] = "blocked"

    touch_manifest(manifest)


def reset_stage(manifest: dict[str, Any], stage_id: str, *, reason: str | None = None) -> None:
    """Reopen a failed or stuck stage — sets pending and clears fail markers."""
    if stage_id not in STAGE_ORDER:
        raise SystemExit(f"ERROR: Unknown stage '{stage_id}'. Valid: {', '.join(STAGE_ORDER)}")
    stages = manifest.setdefault("stages", {})
    stage = stages.setdefault(stage_id, {"name": stage_id, "status": "pending"})
    stage["status"] = "pending"
    stage.pop("fail_reason", None)
    stage.pop("completed_at", None)
    stage["started_at"] = None
    if reason:
        stage["reset_reason"] = reason
    if manifest.get("status") == "blocked":
        manifest["status"] = "in_progress"
    touch_manifest(manifest)


def cmd_stage_reset(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    reset_stage(manifest, args.stage, reason=getattr(args, "reason", None))
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": f"Stage reset: {args.stage}",
            "status": "processing",
            "stage_id": args.stage,
            "command": "stage-reset",
        },
    )
    print(f"Stage '{args.stage}' → pending (reset)")
    return 0


def cmd_record_handoff(args: argparse.Namespace) -> int:
    """Bind session handoff file to active E2E run manifest (mandatory for /sdlc:e2e)."""
    run_id, manifest, path = load_manifest(args.run_id)
    handoff_path = Path(args.handoff)
    if not handoff_path.is_file():
        raise SystemExit(f"ERROR: handoff file not found: {handoff_path}")
    try:
        rel = handoff_path.resolve().relative_to(REPO_ROOT.resolve())
        handoff_rel = str(rel)
    except ValueError:
        handoff_rel = str(handoff_path.resolve())

    orch = manifest.setdefault("orchestrator", {})
    orch["last_handoff"] = handoff_rel
    if args.session_id:
        orch["session_id"] = args.session_id
    touch_manifest(manifest)
    _sync_definition_of_done(
        manifest,
        REPO_ROOT,
        event="record-handoff",
        handoff_path=handoff_path,
    )

    nxt = next_pending_stage(manifest)
    stage_summary = current_stage_summary(manifest)
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": "Handoff recorded on run",
            "status": "completed",
            "command": "record-handoff",
            "outputs": {"handoff": handoff_rel, "next_stage": nxt or ""},
        },
    )
    print(f"RUN_ID={run_id}")
    print(f"HANDOFF={handoff_rel}")
    print(f"CURRENT_STAGE={stage_summary}")
    print(f"NEXT_STAGE={nxt or 'none'}")
    print(f"RUN_STATUS={manifest.get('status')}")
    return 0


def cmd_stage_start(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    blocked = _block_legacy_mutation(run_id)
    if blocked:
        return blocked
    force = getattr(args, "force", False)
    stage_id = args.stage

    if not force:
        errs = gate_stage_start(manifest, stage_id)
        if errs:
            print(format_gate_errors(f"stage-start {stage_id}", errs), file=sys.stderr)
            manifest.setdefault("protocol", {})["violation"] = (
                f"stage-start {stage_id} blocked: {errs[0]}"
            )
            manifest["status"] = "blocked"
            touch_manifest(manifest)
            save_manifest(run_id, path, manifest)
            return 1

    update_stage(manifest, stage_id, "in_progress")
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": f"Stage start: {args.stage}",
            "status": "processing",
            "stage_id": args.stage,
            "command": "stage-start",
        },
    )
    print(f"Stage '{args.stage}' → in_progress")
    return 0


def _sync_discovery_screenshot_flags(manifest: dict[str, Any]) -> None:
    """Set reference_screenshots_on_disk from disk state after discovery completes."""
    run_id = str(manifest.get("run_id") or "")
    ref_dir = REPO_ROOT / ".sdlc" / "runs" / run_id / "reference-screenshots"
    stage = manifest.setdefault("stages", {}).setdefault("discovery", {})
    pngs = [f for f in ref_dir.glob("*.png") if f.is_file() and f.stat().st_size > 1000]
    stage["reference_screenshots_on_disk"] = bool(pngs)
    refs = stage.setdefault("reference_screenshots", {})
    if pngs:
        for p in pngs:
            key = p.stem.replace("reference-", "").replace("-", "_")
            refs[key] = f".sdlc/runs/{run_id}/reference-screenshots/{p.name}"


def _block_legacy_mutation(run_id: str) -> int | None:
    """ADR-027: in-progress legacy runs must migrate before mutation."""
    from sdlc_workflow_migrate import legacy_blocks_mutation

    message = legacy_blocks_mutation(run_id)
    if message:
        print(f"ERROR: {message}", file=sys.stderr)
        return 1
    return None


def _block_if_workflow_runner_active() -> int | None:
    """ADR-018: legacy .sdlc/runs/ stage lifecycle must not run when workflow runner is active."""
    from _sdlc_paths import ACTIVE_WORKFLOW_RUN_POINTER

    if ACTIVE_WORKFLOW_RUN_POINTER.is_file():
        active = ACTIVE_WORKFLOW_RUN_POINTER.read_text(encoding="utf-8").strip()
        if active:
            print(
                "ERROR: sdlc_e2e_manifest stage lifecycle is deprecated (ADR-018). "
                f"Active workflow run: {active}. "
                "Use: python3 .sdlc/bin/sdlc_workflow_run.py step --run-id "
                f"{active} --mode agent",
                file=sys.stderr,
            )
            return 1
    return None


def cmd_stage_complete(args: argparse.Namespace) -> int:
    blocked = _block_if_workflow_runner_active()
    if blocked:
        return blocked
    run_id, manifest, path = load_manifest(args.run_id)
    blocked = _block_legacy_mutation(run_id)
    if blocked:
        return blocked
    stage_id = args.stage
    force = getattr(args, "force", False)

    if not force:
        errs = gate_stage_complete(manifest, stage_id, REPO_ROOT)
        if errs:
            print(format_gate_errors(f"stage-complete {stage_id}", errs), file=sys.stderr)
            manifest.setdefault("protocol", {})["violation"] = (
                f"stage-complete {stage_id} blocked: {errs[0]}"
            )
            manifest["status"] = "blocked"
            touch_manifest(manifest)
            save_manifest(run_id, path, manifest)
            return 1

    artifacts = [a.strip() for a in args.artifacts.split(",") if a.strip()] if args.artifacts else None
    update_stage(manifest, stage_id, "completed", artifacts=artifacts)
    _sync_definition_of_done(manifest, REPO_ROOT, event="stage-complete", stage_id=stage_id)
    if stage_id == "discovery":
        _sync_discovery_screenshot_flags(manifest)
    stage = manifest.get("stages", {}).get(stage_id, {})
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": f"Stage complete: {stage_id}",
            "status": "completed",
            "stage_id": stage_id,
            "command": "stage-complete",
            "duration_ms": _stage_duration_ms(stage),
            "outputs": {"artifacts": stage.get("artifacts", [])},
        },
    )
    print(f"Stage '{stage_id}' → completed")
    nxt = next_pending_stage(manifest)
    if nxt:
        print(f"Next stage: {nxt}")
    else:
        print("All stages complete.")
    return 0


def cmd_stage_skip(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    update_stage(manifest, args.stage, "skipped")
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": f"Stage skip: {args.stage}",
            "status": "completed",
            "stage_id": args.stage,
            "command": "stage-skip",
        },
    )
    print(f"Stage '{args.stage}' → skipped")
    return 0


def cmd_stage_fail(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    update_stage(manifest, args.stage, "failed", fail_reason=args.reason)
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": f"Stage fail: {args.stage}",
            "status": "error",
            "stage_id": args.stage,
            "command": "stage-fail",
            "outputs": {"reason": args.reason},
        },
    )
    print(f"Stage '{args.stage}' → failed: {args.reason}")
    return 1


def cmd_set_mode(args: argparse.Namespace) -> int:
    if args.mode not in VALID_MODES:
        raise SystemExit(f"ERROR: mode must be one of {VALID_MODES}")
    run_id, manifest, path = load_manifest(args.run_id)
    manifest["mode"] = args.mode
    touch_manifest(manifest)
    save_yaml(path, manifest)
    print(f"Mode set to: {args.mode}")
    return 0


def cmd_set_target(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    target = manifest.setdefault("target", {})
    if args.route:
        target["route"] = args.route
    if args.reference_url:
        target["reference_url"] = args.reference_url
    if args.persistence:
        target["persistence"] = args.persistence
    touch_manifest(manifest)
    save_yaml(path, manifest)
    print(f"Target updated: {target}")
    return 0


def cmd_register_epic(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    manifest["epic"] = {
        "ticket_id": args.ticket,
        "uuid": args.uuid,
        "spec_path": args.spec,
        "plane_url": args.plane_url,
    }
    touch_manifest(manifest)
    save_yaml(path, manifest)
    print(f"Epic registered: {args.ticket}")
    return 0


def cmd_register_ticket(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    blocked = _block_legacy_mutation(run_id)
    if blocked:
        return blocked
    tickets = manifest.setdefault("tickets", {})
    tickets[args.ticket] = {
        "role": args.role,
        "title": args.title,
        "uuid": args.uuid,
        "parent": args.parent,
        "wave": args.wave,
        "status": "pending",
        "worktree": args.worktree,
        "branch": args.branch,
        "spec_path": args.spec,
        "pr_url": None,
        "pr_number": None,
        "evidence_dir": f".sdlc/evidence/{args.ticket}/",
        "merged_at": None,
        "qa_verdict": None,
        "visual_gate": None,
        "review_url": None,
        "work_items_evidence_uploaded": False,
        "work_items_state_synced": False,
        "work_items_state": None,
        "plane_evidence_uploaded": False,
        "plane_state_synced": False,
        "plane_state": None,
        "subagent_dispatched": False,
        "subagent_session_id": None,
        "subagent_dispatched_at": None,
        "implementation_agent": None,
        "feature_flow_complete": False,
        "feature_flow_stages": {
            "planning": "pending",
            "implementation": "pending",
            "review": "pending",
            "qa": "pending",
            "pr_creation": "pending",
        },
    }
    touch_manifest(manifest)
    save_yaml(path, manifest)
    print(f"Ticket registered: {args.ticket}")
    return 0


def cmd_register_wave(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    waves = manifest.setdefault("waves", [])
    ticket_list = [t.strip() for t in args.tickets.split(",") if t.strip()]
    wave_entry = {
        "id": args.id,
        "name": args.name or args.id,
        "parallel": args.parallel,
        "depends_on": [d.strip() for d in (args.depends_on or "").split(",") if d.strip()],
        "tickets": ticket_list,
        "status": "pending",
        "started_at": None,
        "completed_at": None,
    }
    existing_ids = {w["id"] for w in waves}
    if args.id in existing_ids:
        waves = [w if w["id"] != args.id else wave_entry for w in waves]
        manifest["waves"] = waves
    else:
        waves.append(wave_entry)
    touch_manifest(manifest)
    save_yaml(path, manifest)
    print(f"Wave registered: {args.id} → {ticket_list}")
    return 0


def cmd_wave_complete(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    force = getattr(args, "force", False)
    waves = manifest.get("waves", [])
    found = False
    wave_tickets: list[str] = []
    for w in waves:
        if w.get("id") == args.wave_id:
            wave_tickets = w.get("tickets", [])
            if not force:
                tickets = manifest.get("tickets", {})
                errs: list[str] = []
                for tid in wave_tickets:
                    if tid in tickets:
                        errs.extend(gate_ticket_for_review(tid, tickets[tid], REPO_ROOT))
                if errs:
                    print(format_gate_errors(f"wave-complete {args.wave_id}", errs), file=sys.stderr)
                    return 1
            w["status"] = "completed"
            w["completed_at"] = utc_now()
            found = True
            if not force:
                for tid in wave_tickets:
                    if tid in manifest.get("tickets", {}):
                        manifest["tickets"][tid]["status"] = "done"
                        manifest["tickets"][tid]["merged_at"] = utc_now()
    if not found:
        raise SystemExit(f"ERROR: Wave '{args.wave_id}' not found")
    touch_manifest(manifest)
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": f"Wave complete: {args.wave_id}",
            "status": "completed",
            "wave_id": args.wave_id,
            "command": "wave-complete",
            "outputs": {"tickets": wave_tickets},
        },
    )
    print(f"Wave '{args.wave_id}' → completed")
    return 0


def cmd_register_subagent_dispatch(args: argparse.Namespace) -> int:
    """Record that orchestrator dispatched Task(subagent) for a ticket — ADR-009 gate."""
    run_id, manifest, path = load_manifest(args.run_id)
    tickets = manifest.get("tickets", {})
    if args.ticket not in tickets:
        raise SystemExit(f"ERROR: Ticket '{args.ticket}' not registered")
    t = tickets[args.ticket]
    t["subagent_dispatched"] = True
    t["subagent_dispatched_at"] = utc_now()
    t["implementation_agent"] = args.agent or "implementer"
    if args.session_id:
        t["subagent_session_id"] = args.session_id
    if args.command:
        t["delegated_command"] = args.command
    touch_manifest(manifest)
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": "Subagent dispatch recorded",
            "status": "completed",
            "ticket_id": args.ticket,
            "command": "register-subagent-dispatch",
            "outputs": {
                "agent": t["implementation_agent"],
                "session_id": t.get("subagent_session_id"),
            },
        },
    )
    print(f"Subagent dispatch recorded: {args.ticket} agent={t['implementation_agent']}")
    return 0


def cmd_feature_flow_stage(args: argparse.Namespace) -> int:
    """Mark a feature-flow stage complete for a ticket (called by subagent or orchestrator on report)."""
    run_id, manifest, path = load_manifest(args.run_id)
    tickets = manifest.get("tickets", {})
    if args.ticket not in tickets:
        raise SystemExit(f"ERROR: Ticket '{args.ticket}' not registered")
    t = tickets[args.ticket]
    stages = t.setdefault(
        "feature_flow_stages",
        {
            "planning": "pending",
            "implementation": "pending",
            "review": "pending",
            "qa": "pending",
            "pr_creation": "pending",
        },
    )
    if args.stage not in stages:
        raise SystemExit(f"ERROR: Unknown feature-flow stage '{args.stage}'")
    stages[args.stage] = "completed"
    if all(stages.get(s) == "completed" for s in stages):
        t["feature_flow_complete"] = True
    touch_manifest(manifest)
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": f"Feature flow stage: {args.stage}",
            "status": "completed",
            "ticket_id": args.ticket,
            "command": "feature-flow-stage",
            "outputs": {"stage": args.stage, "feature_flow_stages": stages},
        },
    )
    print(f"Ticket {args.ticket} feature_flow_stages.{args.stage} = completed")
    return 0


def _gate_ticket_status_transition(ticket_id: str, ticket: dict[str, Any], value: str) -> list[str]:
    if value not in gate_for_review_manifest_statuses():
        return []
    return gate_ticket_for_review(ticket_id, ticket, REPO_ROOT)


def _gate_ticket_field_update(
    ticket_id: str,
    ticket: dict[str, Any],
    field: str,
    value: str,
    manifest: dict[str, Any],
) -> list[str]:
    """Block auto-certification on PASS fields — requires gate adapter evidence (ADR-017 Phase 3)."""
    if field not in ("visual_gate", "qa_verdict", "content_qa_verdict"):
        return []
    normalized = str(value).strip().upper()
    if normalized != "PASS":
        return []

    errors: list[str] = []
    if field in ("qa_verdict", "content_qa_verdict"):
        stages = ticket.get("feature_flow_stages") or {}
        if stages and stages.get("qa") != "completed":
            errors.append(
                f"{ticket_id}: qa_verdict=PASS blocked — feature_flow_stages.qa is "
                f"{stages.get('qa')!r}; complete QA via feature-flow postCondition first"
            )
        rel = ticket.get("evidence_dir") or ""
        if not rel:
            errors.append(f"{ticket_id}: qa_verdict=PASS blocked — evidence_dir not set")
        else:
            root = ticket_repo_root(ticket, REPO_ROOT)
            errors.extend(
                f"{ticket_id}: {msg}" for msg in gate_evidence_dir(evidence_path(root, rel))
            )

    if field == "visual_gate":
        from sdlc_workflow_gate import check_shell_tier_checklist, check_visual_evidence

        rel = ticket.get("evidence_dir") or ""
        if not rel:
            errors.append(f"{ticket_id}: visual_gate=PASS blocked — evidence_dir not set")
        else:
            ev = (REPO_ROOT / rel.strip().rstrip("/")).resolve()
            for check in (check_visual_evidence(ev), check_shell_tier_checklist(ev)):
                if not check.passed:
                    errors.append(f"{ticket_id}: visual_gate=PASS blocked — {check.message}")
        errors.extend(gate_visual_fidelity(ticket_id, ticket, manifest))
        errors.extend(gate_ticket_protocol(ticket_id, ticket))

    return errors


def _sync_work_items_for_ticket(
    ticket_id: str, ticket: dict[str, Any], manifest_status: str
) -> None:
    """Sync active work_items provider when manifest ticket status changes."""
    from work_items_sync import sync_manifest_ticket

    sync_manifest_ticket(ticket_id, ticket, manifest_status)


def cmd_update_ticket(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    blocked = _block_legacy_mutation(run_id)
    if blocked:
        return blocked
    tickets = manifest.get("tickets", {})
    if args.ticket not in tickets:
        raise SystemExit(f"ERROR: Ticket '{args.ticket}' not registered")
    force = getattr(args, "force", False)
    if args.field == "status" and not force:
        errs = _gate_ticket_status_transition(args.ticket, tickets[args.ticket], args.value)
        if errs:
            print(
                format_gate_errors(f"update-ticket {args.ticket} → {args.value}", errs),
                file=sys.stderr,
            )
            return 1
    if not force:
        field_errs = _gate_ticket_field_update(
            args.ticket, tickets[args.ticket], args.field, args.value, manifest,
        )
        if field_errs:
            print(
                format_gate_errors(
                    f"update-ticket {args.ticket}.{args.field}={args.value}", field_errs,
                ),
                file=sys.stderr,
            )
            return 1
    tickets[args.ticket][args.field] = _coerce_ticket_value(args.field, args.value)
    if args.field == "status" and args.value == "done":
        tickets[args.ticket]["merged_at"] = utc_now()
    skip_sync = getattr(args, "skip_work_items_sync", False) or getattr(
        args, "skip_plane_sync", False
    )
    syncable = syncable_manifest_statuses()
    if args.field == "status" and args.value in syncable and not skip_sync:
        try:
            _sync_work_items_for_ticket(args.ticket, tickets[args.ticket], args.value)
            provider_state = tickets[args.ticket].get("work_items_state") or tickets[
                args.ticket
            ].get("plane_state")
            print(f"Work-items sync: {args.ticket} → {provider_state}")
        except (RuntimeError, ValueError) as exc:
            print(f"GATE FAIL: Work-items sync — {exc}", file=sys.stderr)
            return 1
    touch_manifest(manifest)
    save_yaml(path, manifest)
    print(f"Ticket {args.ticket}.{args.field} = {args.value}")
    return 0


def cmd_sync_work_items(args: argparse.Namespace) -> int:
    """Sync work_items provider state from manifest ticket status (retroactive fix)."""
    run_id, manifest, path = load_manifest(args.run_id)
    tickets = manifest.get("tickets", {})
    if args.ticket not in tickets:
        raise SystemExit(f"ERROR: Ticket '{args.ticket}' not registered")
    ticket = tickets[args.ticket]
    status = args.status or ticket.get("status")
    syncable = syncable_manifest_statuses()
    if status not in syncable:
        raise SystemExit(
            f"ERROR: Cannot sync work_items for manifest status {status!r}. "
            f"Syncable statuses: {', '.join(sorted(syncable))}"
        )
    try:
        _sync_work_items_for_ticket(args.ticket, ticket, str(status))
    except (RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    touch_manifest(manifest)
    save_yaml(path, manifest)
    provider_state = ticket.get("work_items_state") or ticket.get("plane_state")
    print(f"Work-items sync OK: {args.ticket} → {provider_state}")
    return 0


def cmd_sync_plane(args: argparse.Namespace) -> int:
    """Deprecated alias — use sync-work-items."""
    return cmd_sync_work_items(args)


def cmd_update_orchestrator_session(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    orch = manifest.setdefault("orchestrator", {})
    if orch.get("session_id") and not getattr(args, "force", False):
        print(f"Orchestrator session already bound: {orch['session_id']}")
        return 0
    orch["session_id"] = args.session_id
    touch_manifest(manifest)
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": "Orchestrator session bound",
            "status": "completed",
            "command": "update-orchestrator-session",
            "outputs": {"session_id": args.session_id},
        },
    )
    print(f"Orchestrator session bound: {args.session_id}")
    return 0


def cmd_mark_done(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    blocked = _block_legacy_mutation(run_id)
    if blocked:
        return blocked
    force = getattr(args, "force", False)
    if not force:
        errs, warnings = gate_mark_done(manifest, REPO_ROOT)
        for w in warnings:
            print(f"GATE WARN: mark-done — {w}", file=sys.stderr)
        if errs:
            print(format_gate_errors("mark-done", errs), file=sys.stderr)
            return 1
    manifest["status"] = "completed"
    manifest["completed_at"] = utc_now()
    dod = manifest.setdefault("definition_of_done", {})
    for key in dod:
        dod[key] = True
    touch_manifest(manifest)
    save_manifest(
        run_id,
        path,
        manifest,
        workflow={
            "name": "Run marked complete",
            "status": "completed",
            "command": "mark-done",
        },
    )
    if get_active_pointer() == run_id:
        clear_active()
    print(f"Run {run_id} marked complete.")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    run_id, manifest, path = load_manifest(args.run_id)
    errors: list[str] = []
    warnings: list[str] = []

    if manifest.get("status") not in VALID_RUN_STATUS:
        errors.append(f"Invalid run status: {manifest.get('status')}")

    for stage_id in STAGE_ORDER:
        stage = manifest.get("stages", {}).get(stage_id)
        if not stage:
            errors.append(f"Missing stage definition: {stage_id}")
            continue
        if stage.get("status") not in VALID_STAGE_STATUS:
            errors.append(f"Invalid stage status for {stage_id}: {stage.get('status')}")

    if manifest.get("mode") not in VALID_MODES:
        errors.append(f"Invalid mode: {manifest.get('mode')}")

    errors.extend(gate_worktree_isolation(manifest))

    errors.extend(gate_manifest_integrity(manifest, REPO_ROOT))

    tickets = manifest.get("tickets", {})
    for tid, t in tickets.items():
        if t.get("status") in ("consolidated", "merged_without_agent"):
            errors.append(
                f"{tid}: protocol violation — status={t.get('status')!r} "
                "(re-execute via /sdlc:implement subagent per ADR-009)"
            )
    for wave in manifest.get("waves", []):
        for tid in wave.get("tickets", []):
            if tid not in tickets:
                errors.append(f"Wave {wave['id']} references unregistered ticket {tid}")

    if manifest.get("status") == "completed":
        for stage_id in STAGE_ORDER:
            stage = manifest.get("stages", {}).get(stage_id, {})
            mode = manifest.get("mode", "greenfield")
            if mode in stage.get("skip_in_modes", []):
                continue
            if stage.get("status") not in ("completed", "skipped"):
                errors.append(f"Run marked complete but stage {stage_id} is {stage.get('status')}")
        mark_errs, mark_warns = gate_mark_done(manifest, REPO_ROOT)
        errors.extend(mark_errs)
        warnings.extend(mark_warns)

    # Warn on premature ticket done without gates (even if run not completed)
    for tid, t in tickets.items():
        if t.get("status") not in gate_for_review_manifest_statuses():
            continue
        gate_errs = gate_ticket_for_review(tid, t, REPO_ROOT)
        if gate_errs:
            errors.extend(gate_errs)

    nxt = next_pending_stage(manifest)
    if nxt and manifest.get("status") == "completed":
        warnings.append(f"Run status is completed but pending stage exists: {nxt}")

    if errors:
        print("VALIDATION: FAIL")
        for e in errors:
            print(f"  ERROR: {e}")
        for w in warnings:
            print(f"  WARN: {w}")
        return 1

    print("VALIDATION: PASS")
    for w in warnings:
        print(f"  WARN: {w}")
    if nxt:
        print(f"Next pending stage: {nxt}")
    else:
        print("All executable stages complete.")
    return 0


def cmd_list_runs(args: argparse.Namespace) -> int:
    if not RUNS_DIR.exists():
        print("No runs directory.")
        return 0
    active_pointer = get_active_pointer()
    for run_id, m, _path in iter_run_manifests():
        if args.active and not is_active_run(m):
            continue
        marker = "*" if run_id == active_pointer else " "
        stage = current_stage_summary(m)
        epic = (m.get("epic") or {}).get("ticket_id") or "—"
        print(
            f"{marker} {run_id}: {m.get('status')} [{m.get('mode')}] "
            f"stage={stage} epic={epic} — {str(m.get('intent', ''))[:50]}"
        )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="E2E orchestration manifest control plane")
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="Create new orchestration run")
    p_init.add_argument("--intent", required=True)
    p_init.add_argument("--run-id")
    p_init.add_argument("--mode", default="greenfield", choices=sorted(VALID_MODES))
    p_init.add_argument("--route")
    p_init.add_argument("--reference-url")
    p_init.add_argument("--persistence")
    p_init.add_argument("--force", action="store_true")
    p_init.set_defaults(func=cmd_init)

    for name, help_text in [
        ("status", "Show run status"),
        ("resume", "Print next stage to execute"),
        ("validate", "Validate manifest consistency"),
        ("list-runs", "List all runs"),
        ("mark-done", "Mark run as complete"),
    ]:
        p = sub.add_parser(name, help=help_text)
        p.add_argument("--run-id")
        if name == "list-runs":
            p.add_argument("--active", action="store_true", help="Show only non-completed runs")
        if name == "mark-done":
            p.add_argument("--force", action="store_true", help="Bypass deterministic gates")
        p.set_defaults(func=globals()[f"cmd_{name.replace('-', '_')}"])

    p_resolve = sub.add_parser(
        "resolve",
        help="Cognitive run resolution — match query to active runs",
    )
    p_resolve.add_argument("--query", required=True, help="User description or intent")
    p_resolve.add_argument("--json", action="store_true", help="Emit JSON for orchestrator")
    p_resolve.set_defaults(func=cmd_resolve)

    for name in ["stage-start", "stage-complete", "stage-skip", "stage-fail"]:
        p = sub.add_parser(name, help=f"Update stage: {name}")
        p.add_argument("stage")
        p.add_argument("--run-id")
        if name in ("stage-complete", "stage-start"):
            p.add_argument("--force", action="store_true", help="Bypass deterministic gates")
        if name == "stage-complete":
            p.add_argument("--artifacts", help="Comma-separated artifact paths")
        if name == "stage-fail":
            p.add_argument("--reason", required=True)
        p.set_defaults(func=globals()[f"cmd_{name.replace('-', '_')}"])

    p_reset = sub.add_parser("stage-reset", help="Reset failed/stuck stage to pending")
    p_reset.add_argument("stage")
    p_reset.add_argument("--reason", help="Audit reason for reset")
    p_reset.add_argument("--run-id")
    p_reset.set_defaults(func=cmd_stage_reset)

    p_rh = sub.add_parser(
        "record-handoff",
        help="Bind handoff file to active E2E run (required when ACTIVE run exists)",
    )
    p_rh.add_argument("--handoff", required=True, help="Path to handoff markdown file")
    p_rh.add_argument("--session-id", help="Cursor session id")
    p_rh.add_argument("--run-id")
    p_rh.set_defaults(func=cmd_record_handoff)

    p_mode = sub.add_parser("set-mode", help="Set run mode")
    p_mode.add_argument("mode", choices=sorted(VALID_MODES))
    p_mode.add_argument("--run-id")
    p_mode.set_defaults(func=cmd_set_mode)

    p_target = sub.add_parser("set-target", help="Set target route/reference")
    p_target.add_argument("--route")
    p_target.add_argument("--reference-url")
    p_target.add_argument("--persistence")
    p_target.add_argument("--run-id")
    p_target.set_defaults(func=cmd_set_target)

    p_epic = sub.add_parser("register-epic", help="Register epic ticket")
    p_epic.add_argument("--ticket", required=True)
    p_epic.add_argument("--uuid", required=True)
    p_epic.add_argument("--spec")
    p_epic.add_argument("--plane-url")
    p_epic.add_argument("--run-id")
    p_epic.set_defaults(func=cmd_register_epic)

    p_ticket = sub.add_parser("register-ticket", help="Register child ticket")
    p_ticket.add_argument("--ticket", required=True)
    p_ticket.add_argument("--uuid", required=True)
    p_ticket.add_argument("--role", default="vertical-slice")
    p_ticket.add_argument("--title", default="")
    p_ticket.add_argument("--parent")
    p_ticket.add_argument("--wave")
    p_ticket.add_argument("--worktree")
    p_ticket.add_argument("--branch")
    p_ticket.add_argument("--spec")
    p_ticket.add_argument("--run-id")
    p_ticket.set_defaults(func=cmd_register_ticket)

    p_wave = sub.add_parser("register-wave", help="Register execution wave")
    p_wave.add_argument("--id", required=True)
    p_wave.add_argument("--tickets", required=True)
    p_wave.add_argument("--name")
    p_wave.add_argument("--parallel", action="store_true")
    p_wave.add_argument("--depends-on", default="")
    p_wave.add_argument("--run-id")
    p_wave.set_defaults(func=cmd_register_wave)

    p_wc = sub.add_parser("wave-complete", help="Mark wave complete")
    p_wc.add_argument("wave_id")
    p_wc.add_argument("--run-id")
    p_wc.add_argument("--force", action="store_true", help="Bypass deterministic gates")
    p_wc.set_defaults(func=cmd_wave_complete)

    p_ut = sub.add_parser("update-ticket", help="Update ticket field")
    p_ut.add_argument("--ticket", required=True)
    p_ut.add_argument("--field", required=True)
    p_ut.add_argument("--value", required=True)
    p_ut.add_argument("--run-id")
    p_ut.add_argument("--force", action="store_true", help="Bypass deterministic gates")
    p_ut.add_argument(
        "--skip-work-items-sync",
        action="store_true",
        help="Do not sync work_items provider when updating status",
    )
    p_ut.add_argument(
        "--skip-plane-sync",
        action="store_true",
        help="Deprecated alias for --skip-work-items-sync",
    )
    p_ut.set_defaults(func=cmd_update_ticket)

    sync_status_choices = tuple(sorted(syncable_manifest_statuses())) or None
    p_sw = sub.add_parser(
        "sync-work-items",
        help="Sync work_items provider ticket state from manifest status",
    )
    p_sw.add_argument("--ticket", required=True)
    p_sw.add_argument(
        "--status",
        choices=sync_status_choices,
        help="Override manifest status for sync (default: current manifest status)",
    )
    p_sw.add_argument("--run-id")
    p_sw.set_defaults(func=cmd_sync_work_items)

    p_sp = sub.add_parser(
        "sync-plane",
        help="Deprecated alias for sync-work-items",
    )
    p_sp.add_argument("--ticket", required=True)
    p_sp.add_argument(
        "--status",
        choices=sync_status_choices,
        help="Override manifest status for sync (default: current manifest status)",
    )
    p_sp.add_argument("--run-id")
    p_sp.set_defaults(func=cmd_sync_plane)

    p_sd = sub.add_parser(
        "register-subagent-dispatch",
        help="Record Task(subagent) dispatch for ticket (ADR-009 gate)",
    )
    p_sd.add_argument("--ticket", required=True)
    p_sd.add_argument("--agent", default="implementer", help="implementer | incident-resolver")
    p_sd.add_argument("--session-id", help="Cursor subagent session id if available")
    p_sd.add_argument("--command", default="/sdlc:implement", help="Delegated command")
    p_sd.add_argument("--run-id")
    p_sd.set_defaults(func=cmd_register_subagent_dispatch)

    p_ff = sub.add_parser(
        "feature-flow-stage",
        help="Mark feature-flow stage complete for ticket",
    )
    p_ff.add_argument("--ticket", required=True)
    p_ff.add_argument(
        "--stage",
        required=True,
        choices=["planning", "implementation", "review", "qa", "pr_creation"],
    )
    p_ff.add_argument("--run-id")
    p_ff.set_defaults(func=cmd_feature_flow_stage)

    p_orch = sub.add_parser(
        "update-orchestrator-session",
        help="Bind orchestrator Cursor session id to manifest",
    )
    p_orch.add_argument("--session-id", required=True)
    p_orch.add_argument("--run-id")
    p_orch.add_argument("--force", action="store_true", help="Overwrite existing session id")
    p_orch.set_defaults(func=cmd_update_orchestrator_session)

    return parser


# ADR-020 Phase 1: legacy .sdlc/runs/ control plane is read-only archive.
_READ_ONLY_COMMANDS = frozenset({"status", "list-runs", "validate", "resolve", "resume"})
_ADR_020_REMOVED_MSG = (
    "ERROR: sdlc_e2e_manifest.py legacy control plane is removed (ADR-020). "
    "Macro orchestration: python3 .sdlc/bin/sdlc_workflow_run.py run --workflow goal-flow "
    "(or /sdlc:goal). Active runs: .sdlc/workflow-runs/ only. "
    "See .sdlc/context/decisions/ADR-020-workflow-continuity-hitl-and-goal.md"
)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    cmd = getattr(args, "command", None)
    if cmd not in _READ_ONLY_COMMANDS:
        print(_ADR_020_REMOVED_MSG, file=sys.stderr)
        return 1
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
