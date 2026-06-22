#!/usr/bin/env python3
"""
Deterministic SDLC gates — invoked by sdlc_workflow_gate.py and legacy read-only manifests.

Gates are hard failures (exit 1). No stage-complete, wave-complete, ticket done, or mark-done
without passing the relevant gate set.
"""
from __future__ import annotations

import re
import subprocess
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from sdlc_dsl_bindings import (
    gate_for_review_manifest_statuses,
    ticket_boolean_field_value,
)

REQUIRED_TICKET_FIELDS_FOR_DONE = (
    "subagent_dispatched",
    "feature_flow_complete",
    "qa_verdict",
    "visual_gate",
    "evidence_dir",
    "pr_url",
    "review_url",
)

# Ticket statuses that indicate protocol bypass — never valid at wave-complete or mark-done
INVALID_TICKET_STATUSES = frozenset({"consolidated", "merged_without_agent"})

FEATURE_FLOW_STAGES = (
    "planning",
    "implementation",
    "review",
    "qa",
    "pr_creation",
)

STAGE_ORDER = (
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
)

PLANE_HIERARCHY_DEPENDENT_STAGES = frozenset(
    {
        "architecture",
        "workspace-rebind",
        "wave-planning",
        "execution",
        "integration",
        "deploy",
        "post-deploy",
        "board-sync",
        "reflect",
    }
)

HANDOFF_STUB_PATTERN = "STUB — Agent did not enrich"

from sdlc_dsl_bindings import cognitive_state_paths, load_target_root  # noqa: E402
from sdlc_gate_runner import run_gate_invariant  # noqa: E402


def evidence_path(repo_root: Path, rel: str) -> Path:
    p = Path(rel)
    if p.is_absolute():
        return p.resolve()
    return (repo_root / rel).resolve()


def run_dir(repo_root: Path, manifest: dict[str, Any]) -> Path:
    run_id = str(manifest.get("run_id") or "")
    return repo_root / ".sdlc" / "runs" / run_id


def load_target_root(repo_root: Path) -> str:
    from sdlc_dsl_bindings import load_target_root as _load  # noqa: WPS433

    return _load(repo_root)


def gate_ci_target_aligned(repo_root: Path, target_root: str | None = None) -> list[str]:
    """Verify CI slot invariant via integration gate_contract (ADR-013)."""
    target = target_root or load_target_root(repo_root)
    errors, _warnings = run_gate_invariant(repo_root, "ci-target-aligned", target)
    return errors


def gate_evidence_dir(evidence_dir: Path) -> list[str]:
    errors: list[str] = []
    if not evidence_dir.is_dir():
        errors.append(f"evidence_dir does not exist: {evidence_dir}")
        return errors
    pngs = list(evidence_dir.glob("*.png"))
    if not pngs:
        errors.append(f"evidence_dir has no PNG screenshots: {evidence_dir}")
    manifest = evidence_dir / "manifest.md"
    if not manifest.is_file():
        errors.append(f"evidence_dir missing manifest.md: {evidence_dir}")
    return errors


def ticket_repo_root(ticket: dict[str, Any], default_root: Path) -> Path:
    wt = ticket.get("worktree")
    if wt:
        return Path(wt).resolve()
    return default_root


def gate_ticket_protocol(ticket_id: str, ticket: dict[str, Any]) -> list[str]:
    """Subagent dispatch + feature-flow completion — ADR-009."""
    errors: list[str] = []
    status = ticket.get("status")
    if status in INVALID_TICKET_STATUSES:
        errors.append(
            f"{ticket_id}: status={status!r} is invalid — ticket was not executed via "
            "/sdlc:implement subagent (ADR-009)"
        )
    if ticket.get("subagent_dispatched") is not True:
        errors.append(
            f"{ticket_id}: subagent_dispatched must be true "
            "(register via: register-subagent-dispatch after Task dispatch)"
        )
    if ticket.get("feature_flow_complete") is not True:
        errors.append(
            f"{ticket_id}: feature_flow_complete must be true "
            "(all feature-flow stages: planning, implementation, review, qa, pr_creation)"
        )
    stages = ticket.get("feature_flow_stages") or {}
    for stage in FEATURE_FLOW_STAGES:
        if stages.get(stage) != "completed":
            errors.append(f"{ticket_id}: feature_flow_stages.{stage} must be completed")
    agent = ticket.get("implementation_agent")
    if agent and agent not in ("implementer", "incident-resolver"):
        errors.append(f"{ticket_id}: invalid implementation_agent {agent!r}")
    return errors


def gate_worktree_isolation(manifest: dict[str, Any]) -> list[str]:
    """One vertical-slice ticket → one worktree (ADR-009). Content posts skip worktrees."""
    errors: list[str] = []
    by_worktree: dict[str, list[str]] = {}
    for tid, t in manifest.get("tickets", {}).items():
        if t.get("role") in ("epic", "fix", "content-post"):
            continue
        wt = t.get("worktree")
        if not wt:
            continue
        by_worktree.setdefault(wt, []).append(tid)
    for wt, tids in by_worktree.items():
        if len(tids) > 1:
            errors.append(
                f"worktree isolation violated: {wt} shared by {', '.join(tids)} "
                "(one ticket per worktree per ADR-009)"
            )
    by_pr: dict[str, list[str]] = {}
    for tid, t in manifest.get("tickets", {}).items():
        if t.get("role") == "epic":
            continue
        pr = t.get("pr_url")
        if not pr:
            continue
        by_pr.setdefault(pr, []).append(tid)
    for pr, tids in by_pr.items():
        if len(tids) > 1:
            errors.append(
                f"PR isolation violated: {pr} shared by {', '.join(tids)} "
                "(one PR per ticket per ADR-009)"
            )
    return errors


def gate_ticket_for_review(
    ticket_id: str,
    ticket: dict[str, Any],
    repo_root: Path,
    manifest: dict[str, Any] | None = None,
) -> list[str]:
    """Ticket ready for human review handoff — protocol, QA PASS, visual fidelity, evidence, PR + review URL."""
    manifest = manifest or {}
    if ticket.get("role") == "content-post":
        errors: list[str] = []
        draft = ticket.get("content_draft_path") or f".sdlc/content/drafts/{ticket_id}/post.md"
        draft_path = repo_root / draft
        if not draft_path.is_file():
            errors.append(f"{ticket_id}: content draft missing at {draft}")
        elif draft_path.stat().st_size < 200:
            errors.append(f"{ticket_id}: content draft too short at {draft} (<200 bytes)")
        if ticket.get("content_qa_verdict") != "PASS" and ticket.get("qa_verdict") != "PASS":
            errors.append(
                f"{ticket_id}: content_qa_verdict or qa_verdict must be PASS "
                f"(got content={ticket.get('content_qa_verdict')!r}, qa={ticket.get('qa_verdict')!r})"
            )
        return errors

    errors: list[str] = []
    if ticket.get("role") != "epic":
        errors.extend(gate_ticket_protocol(ticket_id, ticket))
        errors.extend(gate_visual_fidelity(ticket_id, ticket, manifest or {}))
    root = ticket_repo_root(ticket, repo_root)
    if ticket.get("qa_verdict") != "PASS":
        errors.append(f"{ticket_id}: qa_verdict must be PASS (got {ticket.get('qa_verdict')!r})")
    if ticket.get("visual_gate") != "PASS":
        errors.append(f"{ticket_id}: visual_gate must be PASS (got {ticket.get('visual_gate')!r})")
    rel = ticket.get("evidence_dir") or ""
    if not rel:
        errors.append(f"{ticket_id}: evidence_dir not set")
    else:
        errors.extend(
            f"{ticket_id}: {e}" for e in gate_evidence_dir(evidence_path(root, rel))
        )
    if not ticket.get("pr_url"):
        errors.append(f"{ticket_id}: pr_url required for review handoff")
    if not ticket.get("review_url"):
        errors.append(f"{ticket_id}: review_url required (local or deployed access URL)")
    if ticket_boolean_field_value(ticket, "work_items_state_synced") is not True:
        errors.append(
            f"{ticket_id}: work_items_state_synced must be true "
            "(run sync-work-items or update-ticket status with work_items sync)"
        )
    return errors


def _stage_skipped_for_mode(stage: dict[str, Any], mode: str) -> bool:
    return mode in stage.get("skip_in_modes", [])


def _stage_status(manifest: dict[str, Any], stage_id: str) -> str:
    return str(manifest.get("stages", {}).get(stage_id, {}).get("status", "pending"))


def gate_stage_order(manifest: dict[str, Any], stage_id: str) -> list[str]:
    """Every prior non-skipped stage must be completed or skipped before advancing."""
    errors: list[str] = []
    mode = manifest.get("mode", "greenfield")
    stages = manifest.get("stages", {})
    if stage_id not in STAGE_ORDER:
        errors.append(f"stage-order gate: unknown stage {stage_id!r}")
        return errors
    for prior_id in STAGE_ORDER:
        if prior_id == stage_id:
            break
        prior = stages.get(prior_id, {})
        if _stage_skipped_for_mode(prior, mode):
            continue
        if prior.get("status") not in ("completed", "skipped"):
            errors.append(
                f"stage-order gate: cannot transition {stage_id} while predecessor "
                f"{prior_id} is {prior.get('status', 'pending')!r}"
            )
    return errors


def gate_plane_hierarchy_complete(manifest: dict[str, Any], stage_id: str) -> list[str]:
    """Stages after plane-hierarchy require epic + child tickets registered."""
    errors: list[str] = []
    if stage_id not in PLANE_HIERARCHY_DEPENDENT_STAGES:
        return errors
    ph_status = _stage_status(manifest, "plane-hierarchy")
    if ph_status not in ("completed", "skipped"):
        errors.append(
            f"plane-hierarchy gate: {stage_id} blocked — plane-hierarchy is {ph_status!r} "
            "(run /sdlc:spec, register-epic, register-ticket first)"
        )
    epic = manifest.get("epic") or {}
    if not epic.get("uuid"):
        errors.append(
            f"plane-hierarchy gate: {stage_id} blocked — epic.uuid not registered "
            "(register-epic after Plane epic creation)"
        )
    slice_tickets = [
        tid
        for tid, t in (manifest.get("tickets") or {}).items()
        if t.get("role") not in ("epic", "fix")
    ]
    if stage_id in ("execution", "integration", "deploy", "post-deploy", "board-sync", "reflect"):
        if not slice_tickets:
            errors.append(
                f"plane-hierarchy gate: {stage_id} blocked — no slice/content tickets in manifest"
            )
    return errors


def gate_stage_start(manifest: dict[str, Any], stage_id: str) -> list[str]:
    """Hard gates before a stage enters in_progress."""
    errors: list[str] = []
    errors.extend(gate_stage_order(manifest, stage_id))
    errors.extend(gate_plane_hierarchy_complete(manifest, stage_id))
    if stage_id == "execution":
        if not manifest.get("waves"):
            errors.append(
                "stage-start execution: register-wave required before execution "
                "(wave-planning must register ticket groups)"
            )
        mode = manifest.get("mode", "greenfield")
        ticket_scope: set[str] | None = None
        if mode == "content":
            waves = manifest.get("waves") or []
            active_wave = next(
                (w for w in waves if w.get("status") not in ("completed", "skipped")),
                None,
            )
            if active_wave:
                ticket_scope = set(active_wave.get("tickets") or [])
        undispatched = [
            tid
            for tid, t in (manifest.get("tickets") or {}).items()
            if t.get("role") not in ("epic", "fix")
            and t.get("subagent_dispatched") is not True
            and (ticket_scope is None or tid in ticket_scope)
        ]
        if undispatched:
            errors.append(
                "stage-start execution: register-subagent-dispatch required for: "
                + ", ".join(undispatched)
            )
    return errors


def _report_has_pass_verdict(path: Path, label: str) -> list[str]:
    if not path.is_file():
        return [f"{label}: report missing at {path}"]
    content = path.read_text(encoding="utf-8")
    if re.search(r"(?i)(verdict|status|overall)\s*:\s*pass", content):
        return []
    if re.search(r"(?i)\bpass\b", content) and "fail" not in content.lower()[:500]:
        return []
    return [f"{label}: report at {path} does not contain PASS verdict"]


def gate_integration(manifest: dict[str, Any], repo_root: Path) -> list[str]:
    """integration-report.md exists; joint E2E pass logged (ADR-012)."""
    errors: list[str] = []
    report = run_dir(repo_root, manifest) / "integration-report.md"
    if not report.is_file():
        errors.append(
            f"integration gate: integration-report.md missing at {report} "
            "— run joint E2E and write report before stage-complete"
        )
        return errors
    content = report.read_text(encoding="utf-8")
    if not re.search(r"(?i)(e2e|playwright).{0,40}pass|pass.{0,40}(e2e|playwright)", content):
        if not re.search(r"(?i)status\s*:\s*pass|verdict\s*:\s*pass", content):
            errors.append(
                "integration gate: integration-report.md must log joint E2E PASS "
                "(include 'E2E PASS' or 'Status: PASS')"
            )
    return errors


def gate_deploy(manifest: dict[str, Any], repo_root: Path) -> list[str]:
    """CI deploy workflow aligned; staging smoke PASS or URL in manifest (ADR-012)."""
    errors: list[str] = []
    errors.extend(gate_ci_target_aligned(repo_root))
    orch = manifest.get("orchestrator") or {}
    deploy_stage = (manifest.get("stages") or {}).get("deploy") or {}
    staging_url = orch.get("staging_url") or deploy_stage.get("staging_url")
    staging_smoke = orch.get("staging_smoke_pass") or deploy_stage.get("staging_smoke_pass")
    if staging_smoke is True:
        return errors
    if staging_url:
        return errors
    errors.append(
        "deploy gate: staging_smoke_pass must be true or orchestrator.staging_url set "
        "(record after /sdlc:deploy staging validation)"
    )
    return errors


def gate_post_deploy(manifest: dict[str, Any], repo_root: Path) -> list[str]:
    """Evidence dir with manifest.md; production HTTP 200 (ADR-012)."""
    errors: list[str] = []
    tickets = manifest.get("tickets") or {}
    slice_tickets = [
        (tid, t)
        for tid, t in tickets.items()
        if t.get("role") not in ("epic",)
    ]
    if not slice_tickets:
        errors.append("post-deploy gate: no tickets to validate evidence for")
    for tid, t in slice_tickets:
        rel = t.get("evidence_dir") or ""
        if not rel:
            errors.append(f"{tid}: evidence_dir not set for post-deploy gate")
            continue
        root = ticket_repo_root(t, repo_root)
        errors.extend(f"{tid}: {e}" for e in gate_evidence_dir(evidence_path(root, rel)))

    orch = manifest.get("orchestrator") or {}
    prod_url = orch.get("production_url") or orch.get("deploy_url")
    if not prod_url:
        errors.append(
            "post-deploy gate: orchestrator.production_url not set "
            "(record after /sdlc:post-deployment)"
        )
        return errors

    try:
        req = urllib.request.Request(str(prod_url), method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                errors.append(
                    f"post-deploy gate: production URL returned HTTP {resp.status}: {prod_url}"
                )
    except urllib.error.URLError as exc:
        errors.append(f"post-deploy gate: production URL unreachable ({prod_url}): {exc}")
    except Exception as exc:
        errors.append(f"post-deploy gate: HTTP check failed for {prod_url}: {exc}")
    return errors


def gate_reflect(manifest: dict[str, Any], repo_root: Path) -> list[str]:
    """reflect-report.md exists; verdict PASS (ADR-012)."""
    report = run_dir(repo_root, manifest) / "reflect-report.md"
    return _report_has_pass_verdict(report, "reflect gate")


def gate_workspace_rebind(manifest: dict[str, Any], repo_root: Path) -> list[str]:
    """doctor workspace:ci-target-aligned PASS; rebind-report.md exists (ADR-012)."""
    errors: list[str] = []
    report = run_dir(repo_root, manifest) / "rebind-report.md"
    if not report.is_file():
        errors.append(
            f"workspace-rebind gate: rebind-report.md missing at {report} "
            "— run sdlc_workspace_rebind.py first"
        )
    errors.extend(gate_ci_target_aligned(repo_root))
    return errors


def gate_handoff_not_stub(repo_root: Path) -> list[str]:
    """LATEST.md must not be session-stub pattern (ADR-012)."""
    latest = repo_root / ".sdlc" / "handoffs" / "LATEST.md"
    if not latest.is_file():
        return ["mark-done gate: .sdlc/handoffs/LATEST.md missing — run /sdlc:handoff"]
    content = latest.read_text(encoding="utf-8")
    if HANDOFF_STUB_PATTERN in content:
        return [
            "mark-done gate: LATEST.md is session stub — run /sdlc:handoff with enriched content "
            "before mark-done"
        ]
    return []


def gate_sdlc_state_committed(repo_root: Path) -> tuple[list[str], list[str]]:
    """Warn if SDLC cognitive state files are dirty in git (ADR-012)."""
    errors: list[str] = []
    warnings: list[str] = []
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        warnings.append("mark-done gate: could not run git status for sdlc_state_committed check")
        return errors, warnings

    dirty_sdlc: list[str] = []
    for line in result.stdout.splitlines():
        if len(line) < 4:
            continue
        path = line[3:].strip()
        if path.startswith(".sdlc/runs/") and path.endswith("manifest.yaml"):
            dirty_sdlc.append(path)
            continue
        for prefix in cognitive_state_paths(repo_root):
            if path == prefix or path.startswith(prefix.rstrip("/") + "/"):
                dirty_sdlc.append(path)
                break

    if dirty_sdlc:
        warnings.append(
            "mark-done gate: SDLC cognitive state uncommitted — "
            + ", ".join(dirty_sdlc[:5])
            + ("..." if len(dirty_sdlc) > 5 else "")
            + " (commit or document in run policy before next session)"
        )
    return errors, warnings


def gate_stage_complete(manifest: dict[str, Any], stage_id: str, repo_root: Path) -> list[str]:
    """All gates that must pass before marking a stage completed."""
    errors: list[str] = []
    errors.extend(gate_stage_order(manifest, stage_id))
    errors.extend(gate_plane_hierarchy_complete(manifest, stage_id))
    if stage_id == "discovery":
        errors.extend(gate_discovery_stage(manifest, repo_root))
    elif stage_id == "workspace-rebind":
        errors.extend(gate_workspace_rebind(manifest, repo_root))
    elif stage_id == "execution":
        errors.extend(gate_execution_stage(manifest, repo_root))
    elif stage_id == "integration":
        errors.extend(gate_integration(manifest, repo_root))
    elif stage_id == "deploy":
        errors.extend(gate_deploy(manifest, repo_root))
    elif stage_id == "post-deploy":
        errors.extend(gate_post_deploy(manifest, repo_root))
    elif stage_id == "reflect":
        errors.extend(gate_reflect(manifest, repo_root))
    elif stage_id == "board-sync":
        errors.extend(gate_board_sync(manifest, repo_root))
    return errors


def gate_manifest_integrity(manifest: dict[str, Any], repo_root: Path) -> list[str]:
    """Detect protocol violations on active or completed runs (validate always)."""
    errors: list[str] = []
    mode = manifest.get("mode", "greenfield")
    stages = manifest.get("stages", {})

    for i, stage_id in enumerate(STAGE_ORDER):
        stage = stages.get(stage_id, {})
        if _stage_skipped_for_mode(stage, mode):
            continue
        if stage.get("status") not in ("completed", "skipped"):
            continue
        for prior_id in STAGE_ORDER[:i]:
            prior = stages.get(prior_id, {})
            if _stage_skipped_for_mode(prior, mode):
                continue
            if prior.get("status") not in ("completed", "skipped"):
                errors.append(
                    f"integrity: stage {stage_id!r} marked completed but predecessor "
                    f"{prior_id!r} is {prior.get('status', 'pending')!r}"
                )

    exec_stage = stages.get("execution", {})
    if exec_stage.get("status") in ("in_progress", "completed") and not manifest.get("tickets"):
        errors.append(
            "integrity: execution stage in_progress/completed with tickets: {} "
            "(ADR-009 — implementation requires Plane tickets + subagent dispatch)"
        )

    if exec_stage.get("status") == "completed":
        errors.extend(gate_execution_stage(manifest, repo_root))

    protocol = manifest.get("protocol") or {}
    violation = protocol.get("violation")
    if violation:
        errors.append(f"integrity: protocol.violation recorded — {violation}")

    errors.extend(gate_worktree_isolation(manifest))
    return errors


def gate_discovery_stage(manifest: dict[str, Any], repo_root: Path) -> list[str]:
    """Reference screenshots must be on disk before decomposition (clone/greenfield mode)."""
    errors: list[str] = []
    mode = manifest.get("mode", "greenfield")
    if mode == "fix":
        return errors

    target = manifest.get("target") or {}
    ref_ui = target.get("reference_ui") or {}
    if ref_ui.get("source") == "waiver":
        return errors

    run_id = manifest.get("run_id", "")
    workflow_id = (manifest.get("workflow") or {}).get("workflow_id") or "goal-flow"
    ref_dirs: list[Path] = []
    output_rel = (manifest.get("paths") or {}).get("output_dir")
    if isinstance(output_rel, str) and output_rel.strip():
        ref_dirs.append(repo_root / output_rel.strip() / "reference-screenshots")
    if run_id:
        ref_dirs.append(repo_root / ".sdlc" / "runs" / run_id / "reference-screenshots")
        ref_dirs.append(
            repo_root / ".sdlc" / "workflow-runs" / "output" / workflow_id / run_id / "reference-screenshots"
        )

    ref_url = target.get("reference_url")
    requires_pngs = bool(ref_url) or mode in ("greenfield", "feature")
    if not requires_pngs:
        return errors

    ref_dir = next((d for d in ref_dirs if d.is_dir()), None)
    if ref_dir is None:
        errors.append(
            "discovery gate: reference-screenshots/ missing — capture reference PNGs "
            "or register reference-waiver-adr.md (ADR-027)"
        )
        return errors
    pngs = [f for f in ref_dir.glob("*.png") if f.stat().st_size > 1000]
    if not pngs:
        errors.append(
            f"discovery gate: no valid PNG (>1KB) in {ref_dir} "
            "— browser capture failed or was skipped; retry or use Playwright headless fallback"
        )
    return errors


def _normalize_fidelity_score(raw: float) -> float:
    """Accept 0–1 fraction (legacy) or 0–100 percent (visual_fidelity_check.py)."""
    return raw * 100.0 if raw <= 1.0 else raw


def gate_visual_fidelity(ticket_id: str, ticket: dict[str, Any], manifest: dict[str, Any]) -> list[str]:
    """For clone mode: visual_gate=PASS requires a measured fidelity score, not declaration."""
    errors: list[str] = []
    mode = manifest.get("mode", "greenfield")
    ref_url = (manifest.get("target") or {}).get("reference_url")
    if mode not in ("greenfield",) or not ref_url:
        return errors
    if ticket.get("visual_gate") != "PASS":
        return errors
    score = ticket.get("visual_fidelity_score")
    if score is None:
        errors.append(
            f"{ticket_id}: visual_gate=PASS but visual_fidelity_score not recorded "
            "— provision pb.webdesign.visual-fidelity-gate; score must be >= 85 from visual_fidelity_check.py"
        )
    elif _normalize_fidelity_score(float(score)) < 85.0:
        errors.append(
            f"{ticket_id}: visual_fidelity_score={score} < 85 threshold "
            "— visual_gate cannot be PASS; provision pb.webdesign.visual-fidelity-gate and re-measure"
        )
    iters = ticket.get("visual_fidelity_iterations", 0)
    if iters == 0:
        errors.append(
            f"{ticket_id}: visual_fidelity_iterations=0 — fidelity loop never ran"
        )
    return errors


def gate_execution_stage(manifest: dict[str, Any], repo_root: Path) -> list[str]:
    errors: list[str] = []
    errors.extend(gate_worktree_isolation(manifest))
    tickets = manifest.get("tickets", {})
    if not tickets:
        errors.append("execution gate: no tickets registered")
        return errors
    slice_tickets = [
        (tid, t)
        for tid, t in tickets.items()
        if t.get("role") not in ("epic",) and t.get("status") not in ("skipped",)
    ]
    if not slice_tickets:
        errors.append("execution gate: no vertical-slice tickets registered")
        return errors
    incomplete = [
        tid
        for tid, t in slice_tickets
        if t.get("status") not in gate_for_review_manifest_statuses()
    ]
    if incomplete:
        errors.append(
            f"execution gate: tickets not done: {', '.join(incomplete)}"
        )
    manifest_obj = manifest
    for tid, t in slice_tickets:
        if t.get("status") in gate_for_review_manifest_statuses():
            errors.extend(gate_ticket_for_review(tid, t, repo_root, manifest_obj))
    return errors


def gate_board_sync(manifest: dict[str, Any], repo_root: Path) -> list[str]:
    errors: list[str] = []
    if not manifest.get("epic", {}).get("uuid"):
        errors.append("board-sync gate: epic uuid not registered")
    for tid, t in manifest.get("tickets", {}).items():
        if ticket_boolean_field_value(t, "work_items_evidence_uploaded") is not True:
            errors.append(f"{tid}: work_items_evidence_uploaded must be true")
    errors.extend(gate_execution_stage(manifest, repo_root))
    return errors


def gate_mark_done(manifest: dict[str, Any], repo_root: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    mode = manifest.get("mode", "greenfield")
    for stage_id in STAGE_ORDER:
        stage = manifest.get("stages", {}).get(stage_id, {})
        if mode in stage.get("skip_in_modes", []):
            continue
        if stage.get("status") not in ("completed", "skipped"):
            errors.append(f"mark-done gate: stage {stage_id} is {stage.get('status')}")
    dod = manifest.get("definition_of_done", {})
    content_skip_dod = {"deployed_to_production", "closure_satisfied", "all_prs_merged", "implementation_working"}
    for key, val in dod.items():
        if mode == "content" and key in content_skip_dod:
            continue
        if val is not True:
            errors.append(f"mark-done gate: definition_of_done.{key} is not true")
    errors.extend(gate_board_sync(manifest, repo_root))
    errors.extend(gate_handoff_not_stub(repo_root))
    _, sdlc_warnings = gate_sdlc_state_committed(repo_root)
    warnings.extend(sdlc_warnings)
    return errors, warnings


def format_gate_errors(prefix: str, errors: list[str]) -> str:
    lines = [f"GATE FAIL: {prefix}", *[f"  - {e}" for e in errors]]
    return "\n".join(lines)
