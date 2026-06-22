#!/usr/bin/env python3
"""Deterministic gate evaluation for SDLC workflow runs."""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from _sdlc_paths import REPO_ROOT, SDLC_ROOT
from sdlc_delivery import (
    CLOSURE_RANK,
    DEPLOY_TARGETS,
    LOCAL_DEPLOY_TARGETS,
    achieved_closure,
    closure_rank,
    closure_satisfied,
    default_deploy_target,
    integration_serves_slot,
    required_closure,
)
from sdlc_ref_resolver import RunContext


@dataclass
class GateResult:
    gate_id: str
    outcome: str
    message: str
    metrics: dict[str, Any] | None = None
    hitl_kind: str | None = None

    @property
    def passed(self) -> bool:
        return self.outcome == "PASS"


def gate_result_wait(gate_id: str, hitl_kind: str, message: str) -> GateResult:
    """Procedural HITL wait — correlates with control.hitl on the active node (ADR-020)."""
    return GateResult(gate_id, "WAIT", message, hitl_kind=hitl_kind)


def _load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected object in {path}")
    return data


def check_structured_output(cognitive_path: Path) -> GateResult:
    gate_id = "structured-output.pass"
    if not cognitive_path.is_file():
        return GateResult(gate_id, "FAIL", f"missing cognitive output: {cognitive_path}")

    doc = _load_json(cognitive_path)
    required = ("nodeId", "runId", "recordedAt", "outcome", "confidence", "artifacts")
    missing = [k for k in required if k not in doc]
    if missing:
        return GateResult(gate_id, "FAIL", f"cognitive-output missing fields: {missing}")

    outcome = doc.get("outcome")
    if outcome not in ("success", "partial"):
        return GateResult(gate_id, "RETRY", f"outcome={outcome!r} — regenerate cognitive node")

    confidence = doc.get("confidence")
    if not isinstance(confidence, (int, float)) or confidence < 0.5:
        return GateResult(gate_id, "RETRY", f"low confidence {confidence}")

    return GateResult(gate_id, "PASS", "cognitive-output contract satisfied")


def check_delivery_complete(
    output_dir: Path,
    nodes: dict[str, Any],
    exclude_nodes: frozenset[str] | None = None,
) -> GateResult:
    gate_id = "delivery-complete.pass"
    missing: list[str] = []

    try:
        from sdlc_dsl_bindings import deliverables_root_path  # noqa: WPS433

        deliverables_root = deliverables_root_path()
        output_dir.resolve().relative_to(deliverables_root.resolve())
    except ValueError:
        return GateResult(
            gate_id,
            "FAIL",
            f"output_dir {output_dir} is not under deliverables root {deliverables_root_path()}",
        )

    skip = exclude_nodes or frozenset()

    for required in ("manifest.yaml", "consolidated.md"):
        if not (output_dir / required).is_file():
            missing.append(required)

    assets_dir = output_dir / "assets"
    if not assets_dir.is_dir():
        missing.append("assets/")

    cognitive_dir = output_dir / "cognitive"
    for nid, st in nodes.items():
        if nid in skip:
            continue
        if st.get("status") not in ("completed", "skipped"):
            missing.append(f"node:{nid}:status={st.get('status')}")
            continue
        ref = st.get("content_ref")
        if not ref:
            continue
        rel = ref.removeprefix("cognitive/")
        target = cognitive_dir / rel if ref.startswith("cognitive/") else output_dir / ref
        if not target.is_file():
            missing.append(ref)

    if missing:
        return GateResult(
            gate_id,
            "FAIL",
            f"delivery bundle incomplete — missing {len(missing)} item(s): {missing[:5]}",
            metrics={"missing": missing, "missing_count": len(missing)},
        )
    return GateResult(
        gate_id,
        "PASS",
        "delivery bundle complete — all content_refs materialized",
        metrics={"content_ref_count": sum(1 for st in nodes.values() if st.get("content_ref"))},
    )


def build_node_output(
    node_id: str,
    run_id: str,
    summary: str,
    gate_id: str,
    gate_outcome: str,
    message: str,
    structured: dict[str, Any] | None = None,
    confidence: float = 1.0,
) -> dict[str, Any]:
    from datetime import datetime, timezone

    payload = structured or {}
    payload.setdefault("gateId", gate_id)
    payload.setdefault("gateOutcome", gate_outcome)
    payload.setdefault("message", message)

    return {
        "nodeId": node_id,
        "runId": run_id,
        "recordedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "outcome": "success" if gate_outcome in ("PASS", "WAIT") else "failed",
        "confidence": confidence,
        "summary": summary,
        "structured": payload,
        "artifacts": [
            {"name": f"{node_id}.json", "uri": f"cognitive/{node_id}.json", "kind": "manifest"},
        ],
        "gateInput": {},
    }


def _qa_surface_from_context(ctx: RunContext) -> tuple[str | None, str | None]:
    from sdlc_profile import active_ticket_from_manifest, resolve_qa_surface_from_ticket
    from sdlc_workflow_run_resolve import ensure_feature_flow_child_ticket, is_feature_flow_child_run

    manifest = ctx.manifest or {}
    found = active_ticket_from_manifest(manifest)
    if not found and is_feature_flow_child_run(ctx.run_id):
        healed = ensure_feature_flow_child_ticket(ctx.run_id)
        if healed:
            from sdlc_workflow_manifest import load_manifest

            manifest.clear()
            manifest.update(load_manifest(ctx.run_id))
            found = active_ticket_from_manifest(manifest)
    if not found:
        return None, "qa_surface: no ticket on run manifest — evidence mode is per ticket"
    ticket_id, ticket = found
    return resolve_qa_surface_from_ticket(ticket, ticket_id=ticket_id)


def _ticket_for_qa_contract_check(ctx: RunContext) -> tuple[str, dict[str, Any]] | None:
    from sdlc_profile import active_ticket_from_manifest, hydrate_ticket_qa_fields, load_work_item_ticket

    manifest = ctx.manifest or {}
    found = active_ticket_from_manifest(manifest)
    if found:
        return found

    ticket_id = ""
    if ctx.output_dir and ctx.node_id:
        cog_path = ctx.output_dir / "cognitive" / f"{ctx.node_id}.json"
        if cog_path.is_file():
            try:
                doc = _load_json(cog_path)
            except (OSError, ValueError, json.JSONDecodeError):
                doc = {}
            structured = doc.get("structured")
            if isinstance(structured, dict):
                for key in ("ticket_id", "ticketId", "id"):
                    val = structured.get(key)
                    if isinstance(val, str) and val.strip():
                        ticket_id = val.strip()
                        break
            if not ticket_id:
                for art in doc.get("artifacts") or []:
                    if not isinstance(art, dict):
                        continue
                    name = art.get("name")
                    if isinstance(name, str) and name.strip():
                        ticket_id = name.strip()
                        break

    if not ticket_id:
        for key in ("active_ticket_id", "ticket_id"):
            val = manifest.get(key)
            if isinstance(val, str) and val.strip():
                ticket_id = val.strip()
                break

    if not ticket_id:
        return None

    store_ticket = load_work_item_ticket(ticket_id)
    if isinstance(store_ticket, dict):
        return ticket_id, store_ticket

    tickets = manifest.get("tickets") or {}
    if isinstance(tickets, dict):
        entry = tickets.get(ticket_id)
        if isinstance(entry, dict):
            hydrate_ticket_qa_fields(ticket_id, entry)
            return ticket_id, entry

    return ticket_id, {}


def check_ticket_qa_contract(ctx: RunContext) -> GateResult:
    gate_id = "ticket-qa-contract.pass"
    from sdlc_profile import validate_ticket_qa_contract

    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "ticket-qa-contract satisfied (stub mode)")

    found = _ticket_for_qa_contract_check(ctx)
    if not found:
        return GateResult(
            gate_id,
            "FAIL",
            "no ticket resolved for QA contract — set ticket_id on manifest or work-item store",
        )
    ticket_id, ticket = found
    errors = validate_ticket_qa_contract(ticket, ticket_id)
    if errors:
        return GateResult(gate_id, "FAIL", "; ".join(errors))
    surface = ticket.get("qa_surface")
    return GateResult(gate_id, "PASS", f"{ticket_id}: qa_surface={surface} contract valid")


def _maybe_defer_profile_gate(adapter_id: str, ctx: RunContext, gate_id: str) -> GateResult | None:
    from sdlc_profile import gate_defer_message, gate_deferred_for_surface

    surface, err = _qa_surface_from_context(ctx)
    if err:
        return GateResult(gate_id, "FAIL", err)
    if surface is None:
        return GateResult(gate_id, "FAIL", "qa_surface: ticket contract incomplete")
    if not gate_deferred_for_surface(adapter_id, surface):
        return None
    message = gate_defer_message(adapter_id, surface) or f"{adapter_id} N/A (ticket qa_surface={surface})"
    return GateResult(gate_id, "PASS", message)


def _evidence_dir_from_context(ctx: RunContext) -> Path | None:
    """Resolve evidence directory from run manifest tickets or run_id default."""
    manifest = ctx.manifest or {}
    tickets = manifest.get("tickets") or {}
    for ticket in tickets.values():
        rel = ticket.get("evidence_dir")
        if isinstance(rel, str) and rel.strip():
            path = REPO_ROOT / rel.strip().rstrip("/")
            if path.is_dir():
                return path
    run_id = ctx.run_id or manifest.get("run_id")
    if run_id:
        default = SDLC_ROOT / "evidence" / str(run_id)
        if default.is_dir():
            return default
    return None


def check_library_evidence(evidence_dir: Path) -> GateResult:
    gate_id = "library-evidence.pass"
    manifest_path = evidence_dir / "manifest.md"
    if not manifest_path.is_file():
        return GateResult(gate_id, "FAIL", f"missing evidence manifest: {manifest_path}")

    manifest_text = manifest_path.read_text(encoding="utf-8")
    pytest_report = evidence_dir / "pytest-report.json"
    junit_path = evidence_dir / "junit.xml"

    if pytest_report.is_file():
        try:
            report = _load_json(pytest_report)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            return GateResult(gate_id, "FAIL", f"invalid pytest-report.json: {exc}")
        summary = report.get("summary") if isinstance(report.get("summary"), dict) else report
        failed = summary.get("failed") if isinstance(summary, dict) else None
        passed = summary.get("passed") if isinstance(summary, dict) else None
        if isinstance(passed, int) and passed > 0 and (failed is None or failed == 0):
            return GateResult(
                gate_id,
                "PASS",
                f"pytest-report.json: {passed} passed, {failed or 0} failed",
                metrics={"evidence_dir": str(evidence_dir.relative_to(REPO_ROOT)), "passed": passed},
            )
        return GateResult(gate_id, "FAIL", f"pytest-report.json: passed={passed!r} failed={failed!r}")

    if junit_path.is_file():
        junit_text = junit_path.read_text(encoding="utf-8")
        failure_match = re.search(r'failures="(\d+)"', junit_text)
        error_match = re.search(r'errors="(\d+)"', junit_text)
        failures = int(failure_match.group(1)) if failure_match else -1
        errors = int(error_match.group(1)) if error_match else -1
        if failures == 0 and errors == 0 and "tests=" in junit_text:
            return GateResult(gate_id, "PASS", "junit.xml: 0 failures, 0 errors")
        return GateResult(gate_id, "FAIL", f"junit.xml: failures={failures} errors={errors}")

    if re.search(r"pytest.*\b\d+\s+passed\b", manifest_text, re.IGNORECASE):
        return GateResult(gate_id, "PASS", "manifest.md documents pytest pass")
    if re.search(r"passed:\s*\d+.*failed:\s*0", manifest_text, re.IGNORECASE):
        return GateResult(gate_id, "PASS", "manifest.md documents zero test failures")
    if "pytest: PASS" in manifest_text or "pytest: pass" in manifest_text.lower():
        return GateResult(gate_id, "PASS", "manifest.md declares pytest PASS")

    return GateResult(
        gate_id,
        "FAIL",
        "library evidence requires manifest.md plus pytest-report.json, junit.xml, or pytest pass in manifest",
    )


def check_visual_evidence(evidence_dir: Path) -> GateResult:
    gate_id = "visual-evidence.pass"
    manifest_path = evidence_dir / "manifest.md"
    if not manifest_path.is_file():
        return GateResult(gate_id, "FAIL", f"missing evidence manifest: {manifest_path}")

    viewport_candidates = (
        evidence_dir / "current" / "shell-home-1280.png",
        evidence_dir / "current" / "shell-home-375.png",
        evidence_dir / "current-desktop-1280.png",
        evidence_dir / "current-mobile-375.png",
    )
    found = [p for p in viewport_candidates if p.is_file() and p.stat().st_size > 1024]
    if len(found) < 2:

        def _display_path(path: Path) -> str:
            try:
                return str(path.relative_to(REPO_ROOT))
            except ValueError:
                return str(path)

        missing = [_display_path(p) for p in viewport_candidates[:2]]
        return GateResult(
            gate_id,
            "FAIL",
            f"requires >=2 viewport PNGs >1KB; checked {missing}",
        )
    return GateResult(
        gate_id,
        "PASS",
        f"visual evidence present ({len(found)} viewport capture(s))",
        metrics={"evidence_dir": str(evidence_dir.relative_to(REPO_ROOT)), "captures": len(found)},
    )


def check_shell_tier_checklist(evidence_dir: Path) -> GateResult:
    gate_id = "shell-tier-checklist.pass"
    current = evidence_dir / "current"
    fidelity_path = current / "fidelity.json"
    if not fidelity_path.is_file():
        return GateResult(gate_id, "PASS", "shell-tier-checklist N/A (no product-shell fidelity.json)")

    try:
        fidelity = _load_json(fidelity_path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        return GateResult(gate_id, "FAIL", f"invalid fidelity.json: {exc}")

    if fidelity.get("revoked_at"):
        return GateResult(
            gate_id,
            "FAIL",
            f"fidelity revoked at {fidelity.get('revoked_at')}: {fidelity.get('revoke_reason', '')}",
        )
    if fidelity.get("overall_pass") is not True:
        return GateResult(
            gate_id,
            "FAIL",
            f"fidelity.json overall_pass={fidelity.get('overall_pass')!r} — measurement required",
        )
    if str(fidelity.get("shell_visual_gate", "")).upper() != "PASS":
        return GateResult(
            gate_id,
            "FAIL",
            f"shell_visual_gate={fidelity.get('shell_visual_gate')!r} — cannot PASS without adapter",
        )

    report_path = current / "tier-checklist-report.md"
    if report_path.is_file():
        text = report_path.read_text(encoding="utf-8")
        if "REVOKED" in text or "| FAIL |" in text:
            return GateResult(gate_id, "FAIL", "tier-checklist-report contains REVOKED or FAIL row")

    return GateResult(gate_id, "PASS", "shell tier checklist and fidelity measurement PASS")


def check_playwright_report(evidence_dir: Path) -> GateResult:
    gate_id = "playwright-report.pass"
    report_path = evidence_dir / "playwright-report.json"
    if not report_path.is_file():
        alt = evidence_dir / "current" / "playwright-report.json"
        report_path = alt if alt.is_file() else report_path
    if not report_path.is_file():
        return GateResult(gate_id, "PASS", "playwright-report.json absent — gate deferred")

    try:
        report = _load_json(report_path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        return GateResult(gate_id, "FAIL", f"invalid playwright-report.json: {exc}")

    exit_code = report.get("exitCode", report.get("exit_code"))
    if exit_code != 0:
        return GateResult(gate_id, "FAIL", f"playwright exitCode={exit_code!r}")
    return GateResult(gate_id, "PASS", "playwright report exitCode 0")


def evaluate_doctor_structural(gate_id: str = "doctor-pass.pass") -> GateResult:
    """Structural doctor: PASS when Totals report 0 failures (exit 0 or 2 DEGRADED)."""
    proc = subprocess.run(
        ["npm", "run", "doctor:structural"],
        cwd=SDLC_ROOT,
        capture_output=True,
        text=True,
    )
    combined = (proc.stdout or "") + (proc.stderr or "")
    has_failures = " failures" in combined and "0 failures" not in combined
    if proc.returncode == 1 or has_failures:
        return GateResult(gate_id, "FAIL", combined or "doctor structural failed")
    if proc.returncode in (0, 2) and "0 failures" in combined:
        return GateResult(gate_id, "PASS", "doctor structural PASS (0 failures)")
    if proc.returncode == 0:
        return GateResult(gate_id, "PASS", "doctor structural PASS")
    if proc.returncode not in (0, 1, 2):
        return GateResult(gate_id, "RETRY", combined or "doctor transient error")
    return GateResult(gate_id, "FAIL", combined or "doctor failed")


def check_doctor_pass(ctx: RunContext) -> GateResult:
    gate_id = "doctor-pass.pass"
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "doctor-pass deferred (stub mode)")
    return evaluate_doctor_structural(gate_id)


def check_ci_target_aligned(ctx: RunContext) -> GateResult:
    gate_id = "ci-target-aligned.pass"
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "ci-target-aligned deferred (stub mode)")
    if not integration_serves_slot("ci"):
        return GateResult(gate_id, "PASS", "ci-target-aligned N/A — no integration serves ci slot")
    from sdlc_dsl_bindings import load_target_root
    from sdlc_gate_runner import run_gate_invariant

    target = load_target_root(REPO_ROOT)
    errors, _warnings = run_gate_invariant(REPO_ROOT, "ci-target-aligned", target)
    if errors:
        return GateResult(gate_id, "FAIL", errors[0], metrics={"errors": errors})
    return GateResult(gate_id, "PASS", f"CI aligned to target_root={target}")


def check_deploy_recorded(ctx: RunContext) -> GateResult:
    gate_id = "deploy-recorded.pass"
    manifest = ctx.manifest or {}
    deploy_state = (manifest.get("nodes") or {}).get("deploy") or {}
    if deploy_state.get("status") == "skipped":
        return GateResult(gate_id, "PASS", "deploy-recorded N/A — deploy node skipped")
    required = required_closure(manifest)
    if closure_rank(required) < CLOSURE_RANK["staging-validated"]:
        return GateResult(gate_id, "PASS", f"deploy-recorded N/A — closure {required!r}")
    structured = {}
    if isinstance(ctx.node_output, dict):
        structured = ctx.node_output.get("structured") or {}
        if not structured and isinstance(ctx.node_output.get("structured"), dict):
            structured = ctx.node_output["structured"]
    deployment = manifest.get("deployment") or {}
    urls = [
        structured.get("deploy_run_url"),
        structured.get("ci_run_url"),
        deployment.get("ci_run_url"),
    ]
    if any(isinstance(u, str) and u.startswith("http") for u in urls):
        return GateResult(gate_id, "PASS", "deploy CI run recorded")
    return GateResult(
        gate_id,
        "FAIL",
        "deploy-recorded: set structured.deploy_run_url or manifest.deployment.ci_run_url",
    )


def check_integration_report(ctx: RunContext) -> GateResult:
    gate_id = "integration-report.pass"
    import re

    if ctx.output_dir:
        report = ctx.output_dir / "integration-report.md"
        if report.is_file():
            content = report.read_text(encoding="utf-8")
            if re.search(r"(?i)(e2e|playwright).{0,40}pass|pass.{0,40}(e2e|playwright)", content):
                return GateResult(gate_id, "PASS", "integration-report.md logs E2E PASS")
            if re.search(r"(?i)status\s*:\s*pass|verdict\s*:\s*pass", content):
                return GateResult(gate_id, "PASS", "integration-report.md verdict PASS")
    structured = {}
    if isinstance(ctx.node_output, dict):
        structured = ctx.node_output.get("structured") or {}
    if str(structured.get("joint_e2e", "")).upper() == "PASS":
        return GateResult(gate_id, "PASS", "cognitive joint_e2e PASS")
    return GateResult(
        gate_id,
        "FAIL",
        "integration-report: write output_dir/integration-report.md with E2E PASS or structured.joint_e2e=PASS",
    )


def check_post_deploy_recorded(ctx: RunContext) -> GateResult:
    gate_id = "post-deploy-recorded.pass"
    manifest = ctx.manifest or {}
    post_state = (manifest.get("nodes") or {}).get("post-deploy") or {}
    if post_state.get("status") == "skipped":
        return GateResult(gate_id, "PASS", "post-deploy-recorded N/A — post-deploy node skipped")
    required = required_closure(manifest)
    if closure_rank(required) < CLOSURE_RANK["production-validated"]:
        return GateResult(gate_id, "PASS", f"post-deploy-recorded N/A — closure {required!r}")
    deployment = manifest.get("deployment") or {}
    if deployment.get("post_deploy_smoke_pass") is True:
        return GateResult(gate_id, "PASS", "post_deploy_smoke_pass=true")
    prod = deployment.get("production_url")
    if isinstance(prod, str) and prod.startswith("http"):
        return GateResult(gate_id, "PASS", f"production_url={prod}")
    structured = {}
    if isinstance(ctx.node_output, dict):
        structured = ctx.node_output.get("structured") or {}
    if structured.get("post_deploy_smoke_pass") is True:
        return GateResult(gate_id, "PASS", "cognitive post_deploy_smoke_pass")
    return GateResult(
        gate_id,
        "FAIL",
        "post-deploy-recorded: set manifest.deployment.production_url or post_deploy_smoke_pass",
    )


def check_local_validation_recorded(ctx: RunContext) -> GateResult:
    gate_id = "local-validation-recorded.pass"
    manifest = ctx.manifest or {}
    closure = manifest.get("closure") or {}
    tier = closure.get("tier") if isinstance(closure, dict) else None
    validation_pass = (
        closure.get("build_pass") is True
        or closure.get("pytest_pass") is True
        or closure.get("validation_pass") is True
    )
    if tier == "local-validated" and validation_pass:
        return GateResult(gate_id, "PASS", "local-validated with validation evidence")
    if ctx.output_dir:
        report = ctx.output_dir / "local-validation-report.md"
        if report.is_file() and "status: PASS" in report.read_text(encoding="utf-8"):
            return GateResult(gate_id, "PASS", "local-validation-report.md PASS")
    execution = (manifest.get("nodes") or {}).get("execution") or {}
    if execution.get("status") == "completed" and execution.get("gate_outcome") == "PASS":
        return GateResult(
            gate_id,
            "FAIL",
            "execution complete but manifest.closure.local-validated not recorded — run validate-local subprocess",
        )
    return GateResult(gate_id, "FAIL", "local-validation-recorded: missing closure tier and report")


def check_closure_satisfied(ctx: RunContext) -> GateResult:
    gate_id = "closure-satisfied.pass"
    manifest = ctx.manifest or {}
    if closure_satisfied(manifest):
        achieved = achieved_closure(manifest) or "unknown"
        required = required_closure(manifest)
        return GateResult(gate_id, "PASS", f"closure {achieved!r} >= required {required!r}")
    required = required_closure(manifest)
    achieved = achieved_closure(manifest)
    return GateResult(
        gate_id,
        "FAIL",
        f"closure not satisfied — achieved={achieved!r} required={required!r}",
    )


def check_pr_registered(ctx: RunContext) -> GateResult:
    gate_id = "pr-registered.pass"
    run_mode = (ctx.manifest or {}).get("run_mode") or "feature"
    if run_mode == "content":
        return GateResult(gate_id, "PASS", "pr-registered N/A (content mode)")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "pr-registered deferred (stub mode)")

    required = required_closure(ctx.manifest)
    if closure_rank(required) < CLOSURE_RANK["preview-validated"]:
        return GateResult(gate_id, "PASS", f"pr-registered N/A (closure={required})")

    slices = _slice_tickets(ctx.manifest or {})
    if not slices:
        return GateResult(
            gate_id,
            "FAIL",
            "no slice tickets — register-ticket then run: "
            "python3 .sdlc/bin/sdlc_workflow_pr.py create --run-id <run>",
        )

    import re

    pr_re = re.compile(r"^https://github\.com/[^/]+/[^/]+/pull/\d+/?$")
    missing: list[str] = []
    for tid, ticket in slices:
        pr = ticket.get("pr_url")
        if not isinstance(pr, str) or not pr_re.match(pr.strip()):
            missing.append(f"{tid}: pr_url missing or invalid (use sdlc_workflow_pr.py create)")

    if missing:
        return GateResult(
            gate_id,
            "FAIL",
            f"PR registration required — {'; '.join(missing[:4])}",
            metrics={"missing": missing},
        )
    return GateResult(
        gate_id,
        "PASS",
        f"{len(slices)} slice ticket(s) with GitHub PR URL",
        metrics={"ticket_count": len(slices)},
    )


def _parse_github_pr_url(pr_url: str) -> tuple[str, str, str] | None:
    import re

    match = re.match(r"^https://github\.com/([^/]+)/([^/]+)/pull/(\d+)/?$", pr_url.strip())
    if not match:
        return None
    return match.group(1), match.group(2), match.group(3)


def _gh_pr_is_merged(pr_url: str) -> bool | None:
    """Return True if merged, False if open, None if gh unavailable or URL invalid."""
    parsed = _parse_github_pr_url(pr_url)
    if not parsed:
        return None
    owner, repo, number = parsed
    proc = subprocess.run(
        [
            "gh",
            "pr",
            "view",
            number,
            "--repo",
            f"{owner}/{repo}",
            "--json",
            "state,mergedAt",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        return None
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None
    if data.get("mergedAt"):
        return True
    state = str(data.get("state") or "").upper()
    return state == "MERGED"


def check_pr_merged(ctx: RunContext) -> GateResult:
    gate_id = "pr-merged.pass"
    run_mode = (ctx.manifest or {}).get("run_mode") or "feature"
    if run_mode == "content":
        return GateResult(gate_id, "PASS", "pr-merged N/A (content mode)")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "pr-merged deferred (stub mode)")

    slices = _slice_tickets(ctx.manifest or {})
    if not slices:
        return GateResult(
            gate_id,
            "FAIL",
            "no slice tickets — register PRs before merge gate",
        )

    open_prs: list[str] = []
    for ticket_id, ticket in slices:
        pr = ticket.get("pr_url")
        if not isinstance(pr, str) or not _parse_github_pr_url(pr):
            return GateResult(
                gate_id,
                "FAIL",
                f"{ticket_id}: pr_url missing or invalid",
            )
        merged = _gh_pr_is_merged(pr)
        if merged is True:
            continue
        if merged is False:
            open_prs.append(f"{ticket_id}: {pr}")
        else:
            return gate_result_wait(
                gate_id,
                "approval",
                f"Cannot verify merge state for {ticket_id} — merge PR or ensure gh is available",
            )

    if open_prs:
        return gate_result_wait(
            gate_id,
            "approval",
            f"PR merge required — {'; '.join(open_prs[:4])}",
        )
    return GateResult(gate_id, "PASS", f"{len(slices)} slice PR(s) merged")


def check_board_sync_ready(ctx: RunContext) -> GateResult:
    gate_id = "board-sync-ready.pass"
    tickets = (ctx.manifest or {}).get("tickets") or {}
    if not tickets:
        return GateResult(gate_id, "FAIL", "no tickets in workflow manifest — register before board-sync")
    pr_gate = check_pr_registered(ctx)
    if not pr_gate.passed:
        return GateResult(gate_id, "FAIL", pr_gate.message)
    incomplete = [
        tid
        for tid, t in tickets.items()
        if t.get("role") not in ("epic", "content-post") and t.get("status") != "done"
    ]
    if incomplete:
        return GateResult(gate_id, "FAIL", f"tickets not done: {', '.join(incomplete[:5])}")
    return GateResult(gate_id, "PASS", "all slice tickets done with pr_url recorded")


def _qa_worktree_gate_enabled() -> bool:
    path = SDLC_ROOT / "sdlc.yaml"
    if not path.is_file():
        return False
    try:
        import yaml

        with path.open(encoding="utf-8") as handle:
            doc = yaml.safe_load(handle)
    except (OSError, ValueError, yaml.YAMLError):
        return False
    if not isinstance(doc, dict):
        return False
    qa = doc.get("qa")
    if not isinstance(qa, dict):
        return False
    return qa.get("worktree_gate") is True


def _slice_tickets(manifest: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    tickets = manifest.get("tickets") or {}
    return [
        (tid, t)
        for tid, t in tickets.items()
        if isinstance(t, dict) and t.get("role") not in ("epic", "content-post")
    ]


def _git_worktree_valid(wt_path: Path) -> tuple[bool, str]:
    if not wt_path.is_dir():
        return False, f"not a directory: {wt_path}"
    proc = subprocess.run(
        ["git", "-C", str(wt_path), "rev-parse", "--is-inside-work-tree"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0 or proc.stdout.strip() != "true":
        return False, f"not a git worktree: {wt_path}"
    return True, "ok"


def check_worktree_registered(ctx: RunContext) -> GateResult:
    gate_id = "worktree-registered.pass"
    if not _qa_worktree_gate_enabled():
        return GateResult(gate_id, "PASS", "worktree_gate disabled in sdlc.yaml")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "worktree-registered deferred (stub mode)")
    run_mode = (ctx.manifest or {}).get("run_mode") or "feature"
    if run_mode == "content":
        return GateResult(gate_id, "PASS", "worktree-registered N/A (content mode)")

    slices = _slice_tickets(ctx.manifest or {})
    if not slices:
        return GateResult(
            gate_id,
            "FAIL",
            "no slice tickets — register via: "
            "python3 .sdlc/bin/sdlc_workflow_manifest.py register-ticket "
            "--run-id <run> --ticket JAMBU-N --worktree <path> --branch feat/...",
        )

    invalid: list[str] = []
    for tid, ticket in slices:
        wt_raw = ticket.get("worktree")
        if not isinstance(wt_raw, str) or not wt_raw.strip():
            invalid.append(f"{tid}: missing worktree")
            continue
        wt_path = Path(wt_raw.strip()).resolve()
        ok, reason = _git_worktree_valid(wt_path)
        if not ok:
            invalid.append(f"{tid}: {reason}")
            continue
        from sdlc_dsl_bindings import path_under_worktrees_root, worktrees_root_path  # noqa: WPS433

        if not path_under_worktrees_root(str(wt_path)):
            invalid.append(
                f"{tid}: worktree outside DSL root {worktrees_root_path()} — "
                "fix workspace.worktrees.root or register correct path"
            )

    if invalid:
        return GateResult(
            gate_id,
            "FAIL",
            f"worktree registration invalid — {'; '.join(invalid[:4])}",
            metrics={"invalid": invalid},
        )
    return GateResult(
        gate_id,
        "PASS",
        f"{len(slices)} slice ticket(s) with valid worktree path(s)",
        metrics={"ticket_count": len(slices)},
    )


def _default_base_ref(wt_path: Path) -> str:
    for candidate in ("main", "master", "origin/main", "origin/master"):
        proc = subprocess.run(
            ["git", "-C", str(wt_path), "rev-parse", "--verify", candidate],
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            return candidate
    return "HEAD~1"


def _worktree_commit_state(wt_path: Path) -> tuple[bool, str]:
    ok, reason = _git_worktree_valid(wt_path)
    if not ok:
        return False, reason

    status_proc = subprocess.run(
        ["git", "-C", str(wt_path), "status", "--porcelain"],
        capture_output=True,
        text=True,
    )
    if status_proc.returncode != 0:
        return False, f"git status failed: {status_proc.stderr.strip()}"
    if status_proc.stdout.strip():
        return False, "working tree dirty — commit all changes in worktree before submit"

    base = _default_base_ref(wt_path)
    count_proc = subprocess.run(
        ["git", "-C", str(wt_path), "rev-list", "--count", f"{base}..HEAD"],
        capture_output=True,
        text=True,
    )
    if count_proc.returncode != 0:
        return False, f"cannot count commits since {base}: {count_proc.stderr.strip()}"
    try:
        ahead = int((count_proc.stdout or "0").strip() or "0")
    except ValueError:
        ahead = 0
    if ahead < 1:
        return False, f"no commits ahead of {base} — implementation must be committed in worktree"
    return True, f"{ahead} commit(s) ahead of {base}"


def check_worktree_committed(ctx: RunContext) -> GateResult:
    gate_id = "worktree-committed.pass"
    if not _qa_worktree_gate_enabled():
        return GateResult(gate_id, "PASS", "worktree_gate disabled in sdlc.yaml")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "worktree-committed deferred (stub mode)")
    run_mode = (ctx.manifest or {}).get("run_mode") or "feature"
    if run_mode == "content":
        return GateResult(gate_id, "PASS", "worktree-committed N/A (content mode)")

    slices = _slice_tickets(ctx.manifest or {})
    if not slices:
        return GateResult(gate_id, "FAIL", "no slice tickets to verify commits")

    failures: list[str] = []
    for tid, ticket in slices:
        wt_raw = ticket.get("worktree")
        if not isinstance(wt_raw, str) or not wt_raw.strip():
            failures.append(f"{tid}: missing worktree")
            continue
        ok, reason = _worktree_commit_state(Path(wt_raw.strip()).resolve())
        if not ok:
            failures.append(f"{tid}: {reason}")

    if failures:
        return GateResult(
            gate_id,
            "FAIL",
            f"worktree commit gate — {'; '.join(failures[:4])}",
            metrics={"failures": failures},
        )
    return GateResult(gate_id, "PASS", "all slice worktrees clean with commits ahead of base")


def _active_wave_ticket_ids(manifest: dict[str, Any]) -> set[str] | None:
    """Ticket ids in the active (first non-completed) wave; None when no waves declared."""
    waves = manifest.get("waves") or []
    if not waves:
        return None
    active_wave: dict[str, Any] | None = None
    for wave in waves:
        if isinstance(wave, dict) and wave.get("status") not in ("completed", "skipped"):
            active_wave = wave
            break
    if active_wave is None:
        return set()
    return {str(tid) for tid in (active_wave.get("tickets") or [])}


def check_feature_flow_complete(ctx: RunContext) -> GateResult:
    gate_id = "feature-flow-complete.pass"
    from sdlc_workflow_run_resolve import (  # noqa: WPS433
        feature_flow_run_id,
        manifest_path,
    )

    manifest = ctx.manifest or {}
    tickets = manifest.get("tickets") or {}
    if not tickets:
        return GateResult(
            gate_id,
            "FAIL",
            "no tickets in workflow-run manifest — use sdlc_workflow_manifest.py register-ticket",
        )

    parent_run_id = ctx.run_id
    active_wave_ids = _active_wave_ticket_ids(manifest)
    incomplete: list[str] = []
    pending_child_run_ids: list[str] = []
    deferred_wave: list[str] = []
    for ticket_id, ticket in tickets.items():
        if ticket.get("role") in ("epic", "content-post"):
            continue
        child_run_id = ticket.get("child_run_id") or feature_flow_run_id(parent_run_id, ticket_id)
        child_path = manifest_path(str(child_run_id))
        has_child_manifest = child_path.is_file()
        if active_wave_ids is not None and ticket_id not in active_wave_ids and not has_child_manifest:
            deferred_wave.append(ticket_id)
            continue
        if child_path.is_file():
            try:
                import yaml
            except ImportError:
                return GateResult(gate_id, "FAIL", "PyYAML required for feature-flow gate")
            child_doc = yaml.safe_load(child_path.read_text(encoding="utf-8"))
            if isinstance(child_doc, dict):
                child_status = str(child_doc.get("status") or "")
                reconciled = False
                if child_status == "failed":
                    protocol = child_doc.get("protocol") if isinstance(child_doc.get("protocol"), dict) else {}
                    continuity = child_doc.get("continuity") if isinstance(child_doc.get("continuity"), dict) else {}
                    reconciled = bool(ticket.get("reconcile_note") or protocol.get("reconcile_note"))
                    if not reconciled:
                        for hint in continuity.get("resume_hints") or []:
                            if "Reconciled closed" in str(hint):
                                reconciled = True
                                break
                if child_status != "completed" and not reconciled:
                    incomplete.append(
                        f"{ticket_id}: child run {child_run_id} status={child_status!r} (need completed or reconciled failed)",
                    )
                    pending_child_run_ids.append(str(child_run_id))
            continue

        stages = ticket.get("feature_flow_stages") or {}
        if stages:
            pending = [s for s, v in stages.items() if v != "completed"]
            if pending:
                incomplete.append(f"{ticket_id}: stages pending {pending}")
            if ticket.get("feature_flow_complete") is not True:
                incomplete.append(f"{ticket_id}: feature_flow_complete=false")
            pending_child_run_ids.append(str(child_run_id))
        elif ticket.get("feature_flow_complete") is True:
            incomplete.append(
                f"{ticket_id}: feature_flow_complete=true without child run {child_run_id}",
            )
            pending_child_run_ids.append(str(child_run_id))
        else:
            incomplete.append(
                f"{ticket_id}: no child feature-flow run — dispatch execution node first",
            )
            pending_child_run_ids.append(str(child_run_id))

    if incomplete:
        metrics: dict[str, Any] = {
            "incomplete": incomplete,
            "child_run_ids": pending_child_run_ids,
        }
        if deferred_wave:
            metrics["deferred_wave"] = deferred_wave
        return GateResult(
            gate_id,
            "FAIL",
            "; ".join(incomplete[:4]),
            metrics=metrics,
        )
    msg = "all slice feature-flow child runs completed"
    if deferred_wave:
        msg = f"{msg} (deferred future waves: {deferred_wave[:4]})"
    return GateResult(gate_id, "PASS", msg, metrics={"deferred_wave": deferred_wave} if deferred_wave else None)


RUNTIME_INTENT_KEYWORDS = frozenset(
    {
        "control-plane",
        "control plane",
        "runtime",
        "dispatch",
        "subprocess",
        "ssr",
        "gateway",
        "deploy",
        "serverless",
        "spawn",
    }
)
MIN_REFERENCE_PNG_BYTES = 1000


def _reference_screenshots_dir(ctx: RunContext) -> Path | None:
    if ctx.output_dir:
        candidate = ctx.output_dir / "reference-screenshots"
        if candidate.is_dir():
            return candidate
    run_id = ctx.run_id or str((ctx.manifest or {}).get("metadata", {}).get("run_id", ""))
    if run_id:
        legacy = REPO_ROOT / ".sdlc" / "runs" / run_id / "reference-screenshots"
        if legacy.is_dir():
            return legacy
        workflow = REPO_ROOT / ".sdlc" / "workflow-runs" / "output" / "goal-flow" / run_id / "reference-screenshots"
        if workflow.is_dir():
            return workflow
    return None


def _valid_reference_pngs(ref_dir: Path) -> list[Path]:
    return [p for p in ref_dir.glob("*.png") if p.is_file() and p.stat().st_size > MIN_REFERENCE_PNG_BYTES]


def _has_reference_waiver(ctx: RunContext) -> bool:
    target = (ctx.manifest or {}).get("target") or {}
    ref_ui = target.get("reference_ui") or {}
    if ref_ui.get("source") == "waiver":
        return True
    if ctx.output_dir:
        waiver = ctx.output_dir / "reference-waiver-adr.md"
        if waiver.is_file() and waiver.stat().st_size > 100:
            return True
    decisions = SDLC_ROOT / "context" / "decisions"
    if decisions.is_dir():
        for path in decisions.glob("*reference*waiver*.md"):
            if path.is_file():
                return True
    return False


def _intent_requires_feasibility(ctx: RunContext) -> bool:
    manifest = ctx.manifest or {}
    intent = " ".join(
        filter(
            None,
            [
                ctx.intent,
                str(manifest.get("intent", "")),
            ],
        )
    ).lower()
    tags = manifest.get("target", {}).get("intent_tags") or []
    if isinstance(tags, list):
        intent = f"{intent} {' '.join(str(t).lower() for t in tags)}"
    structured = {}
    if isinstance(ctx.node_output, dict):
        structured = ctx.node_output.get("structured") or {}
    classify_tags = structured.get("intent_tags") or structured.get("tags") or []
    if isinstance(classify_tags, list):
        intent = f"{intent} {' '.join(str(t).lower() for t in classify_tags)}"
    return any(kw in intent for kw in RUNTIME_INTENT_KEYWORDS)


def check_reference_ui_ready(ctx: RunContext) -> GateResult:
    gate_id = "reference-ui-ready.pass"
    run_mode = (ctx.manifest or {}).get("run_mode") or "greenfield"
    if run_mode == "fix":
        return GateResult(gate_id, "PASS", "reference-ui-ready N/A (fix mode)")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "reference-ui-ready deferred (stub mode)")

    if _has_reference_waiver(ctx):
        return GateResult(gate_id, "PASS", "reference waiver ADR registered")

    ref_dir = _reference_screenshots_dir(ctx)
    if ref_dir is None:
        return GateResult(
            gate_id,
            "FAIL",
            "reference-screenshots/ missing — capture PNGs via browser or write reference-waiver-adr.md",
        )
    pngs = _valid_reference_pngs(ref_dir)
    if not pngs:
        return GateResult(
            gate_id,
            "FAIL",
            f"no valid PNG (>{MIN_REFERENCE_PNG_BYTES}B) in {ref_dir} — text-only discovery is FAIL",
        )
    return GateResult(gate_id, "PASS", f"{len(pngs)} reference PNG(s) on disk")


def check_reference_confirmed(ctx: RunContext) -> GateResult:
    gate_id = "reference-confirmed.pass"
    run_mode = (ctx.manifest or {}).get("run_mode") or "greenfield"
    if run_mode == "fix":
        return GateResult(gate_id, "PASS", "reference-confirmed N/A (fix mode)")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "reference-confirmed deferred (stub mode)")

    target = (ctx.manifest or {}).get("target") or {}
    ref_ui = target.get("reference_ui") or {}
    if ref_ui.get("confirmed") is True:
        return GateResult(gate_id, "PASS", "target.reference_ui.confirmed=true")

    structured = {}
    if isinstance(ctx.node_output, dict):
        structured = ctx.node_output.get("structured") or {}
    if structured.get("reference_ui_confirmed") is True:
        return GateResult(gate_id, "PASS", "cognitive reference_ui_confirmed=true")

    if ctx.output_dir:
        confirm = ctx.output_dir / "reference-confirmation.md"
        if confirm.is_file() and "target ui" in confirm.read_text(encoding="utf-8", errors="replace").lower():
            return GateResult(gate_id, "PASS", "reference-confirmation.md present")

    if _has_reference_waiver(ctx):
        return GateResult(gate_id, "PASS", "reference waiver — confirm N/A")

    return GateResult(
        gate_id,
        "FAIL",
        "reference UI not confirmed — set target.reference_ui.confirmed=true or write reference-confirmation.md",
    )


def check_feasibility_research(ctx: RunContext) -> GateResult:
    gate_id = "feasibility-research.pass"
    run_mode = (ctx.manifest or {}).get("run_mode") or "greenfield"
    if run_mode == "fix":
        return GateResult(gate_id, "PASS", "feasibility-research N/A (fix mode)")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "feasibility-research deferred (stub mode)")

    if not _intent_requires_feasibility(ctx):
        return GateResult(gate_id, "PASS", "feasibility-research N/A (visual-clone intent)")

    if not ctx.output_dir:
        return GateResult(gate_id, "FAIL", "output_dir required for feasibility-research gate")

    report = ctx.output_dir / "feasibility-report.md"
    if not report.is_file():
        return GateResult(
            gate_id,
            "FAIL",
            "runtime intent requires feasibility-report.md (deploy matrix, execution plane, FS constraints)",
        )

    deploy_target = ((ctx.manifest or {}).get("target") or {}).get("deploy_target") or default_deploy_target()
    if deploy_target not in DEPLOY_TARGETS:
        return GateResult(
            gate_id,
            "FAIL",
            f"manifest.target.deploy_target must be one of {sorted(DEPLOY_TARGETS)}",
        )
    return GateResult(gate_id, "PASS", f"feasibility-report.md + deploy_target={deploy_target}")


def check_spec_reconciliation(ctx: RunContext) -> GateResult:
    gate_id = "spec-reconciliation.pass"
    run_mode = (ctx.manifest or {}).get("run_mode") or "greenfield"
    if run_mode == "fix":
        return GateResult(gate_id, "PASS", "spec-reconciliation N/A (fix mode)")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "spec-reconciliation deferred (stub mode)")

    if not ctx.output_dir:
        return GateResult(gate_id, "FAIL", "output_dir required for spec-reconciliation gate")

    report = ctx.output_dir / "spec-reconciliation.md"
    if not report.is_file():
        return GateResult(
            gate_id,
            "FAIL",
            "spec-reconciliation.md missing — emit capability authority table before architecture completes",
        )

    content = report.read_text(encoding="utf-8", errors="replace")
    import re

    if re.search(r"(?i)\|\s*P0\s*\|[^\n]*(?:unresolved|pending|open|TBD)", content):
        return GateResult(gate_id, "FAIL", "spec-reconciliation.md has unresolved P0 rows")
    if re.search(r"(?i)unresolved\s+P0", content):
        return GateResult(gate_id, "FAIL", "spec-reconciliation.md lists unresolved P0 conflicts")
    return GateResult(gate_id, "PASS", "spec-reconciliation.md present without unresolved P0")


def check_deploy_target_declared(ctx: RunContext) -> GateResult:
    gate_id = "deploy-target-declared.pass"
    run_mode = (ctx.manifest or {}).get("run_mode") or "greenfield"
    if run_mode == "fix":
        return GateResult(gate_id, "PASS", "deploy-target-declared N/A (fix mode)")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "deploy-target-declared deferred (stub mode)")

    deploy_target = ((ctx.manifest or {}).get("target") or {}).get("deploy_target") or default_deploy_target()
    if deploy_target in DEPLOY_TARGETS:
        return GateResult(gate_id, "PASS", f"deploy_target={deploy_target}")
    return GateResult(
        gate_id,
        "FAIL",
        f"manifest.target.deploy_target required — enum: {sorted(DEPLOY_TARGETS)}",
    )


def check_execution_plane_adr(ctx: RunContext) -> GateResult:
    gate_id = "execution-plane-adr.pass"
    run_mode = (ctx.manifest or {}).get("run_mode") or "greenfield"
    if run_mode == "fix":
        return GateResult(gate_id, "PASS", "execution-plane-adr N/A (fix mode)")
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "execution-plane-adr deferred (stub mode)")

    target = (ctx.manifest or {}).get("target") or {}
    plane = str(target.get("execution_plane", "")).lower()
    subprocess_markers = ("subprocess", "spawn", "python3", "external-worker")
    needs_adr = any(m in plane for m in subprocess_markers)
    if not needs_adr and ctx.output_dir:
        feasibility = ctx.output_dir / "feasibility-report.md"
        if feasibility.is_file():
            text = feasibility.read_text(encoding="utf-8", errors="replace").lower()
            needs_adr = "spawn" in text or "subprocess" in text

    if not needs_adr:
        return GateResult(gate_id, "PASS", "execution-plane-adr N/A (no subprocess plane)")

    adr_ref = target.get("execution_plane_adr")
    if isinstance(adr_ref, str) and adr_ref.strip():
        return GateResult(gate_id, "PASS", f"execution_plane_adr={adr_ref}")

    decisions = SDLC_ROOT / "context" / "decisions"
    if decisions.is_dir():
        for path in sorted(decisions.glob("ADR-*.md")):
            text = path.read_text(encoding="utf-8", errors="replace").lower()
            if "execution plane" in text or "subprocess" in text or "spawn" in text:
                return GateResult(gate_id, "PASS", f"ADR found: {path.name}")

    return GateResult(
        gate_id,
        "FAIL",
        "subprocess/spawn execution plane requires execution_plane_adr on manifest.target or ADR in decisions/",
    )


def check_e2e_deploy_target(ctx: RunContext) -> GateResult:
    gate_id = "e2e-deploy-target.pass"
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "e2e-deploy-target deferred (stub mode)")

    deploy_target = ((ctx.manifest or {}).get("target") or {}).get("deploy_target") or default_deploy_target()
    if deploy_target in LOCAL_DEPLOY_TARGETS or deploy_target is None:
        return GateResult(gate_id, "PASS", f"e2e-deploy-target N/A (deploy_target={deploy_target})")

    deployment = (ctx.manifest or {}).get("deployment") or {}
    if deployment.get("e2e_deploy_target_pass") is True:
        return GateResult(gate_id, "PASS", "manifest.deployment.e2e_deploy_target_pass=true")

    if ctx.output_dir:
        report = ctx.output_dir / "e2e-deploy-target-report.md"
        if report.is_file():
            content = report.read_text(encoding="utf-8", errors="replace")
            import re

            if re.search(r"(?i)(verdict|status)\s*:\s*pass", content):
                return GateResult(gate_id, "PASS", "e2e-deploy-target-report.md PASS")

    return GateResult(
        gate_id,
        "FAIL",
        f"deploy_target={deploy_target!r} requires e2e-deploy-target-report.md PASS or deployment.e2e_deploy_target_pass",
    )


def check_memory_consistency(ctx: RunContext) -> GateResult:
    gate_id = "memory-consistency.pass"
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "memory-consistency deferred (stub mode)")

    handoff_path = SDLC_ROOT / "handoffs" / "LATEST.md"
    memory_path = REPO_ROOT / ".cursor" / "memories" / "operational-context.md"
    if not handoff_path.is_file() or not memory_path.is_file():
        return GateResult(gate_id, "PASS", "handoff or memory missing — skip consistency check")

    handoff = handoff_path.read_text(encoding="utf-8", errors="replace").lower()
    memory = memory_path.read_text(encoding="utf-8", errors="replace").lower()

    handoff_broken = any(
        phrase in handoff
        for phrase in (
            "runtime non-operational",
            "runtime broken",
            "dispatch broken",
            "not operational",
            "verdict: fail",
            "status: fail",
        )
    )
    if not handoff_broken:
        return GateResult(gate_id, "PASS", "handoff does not report runtime failure")

    memory_complete = "complete" in memory and "production pass" in memory.replace("_", " ")
    if memory_complete and handoff_broken:
        return GateResult(
            gate_id,
            "FAIL",
            "operational-context.md claims COMPLETE/production PASS but LATEST handoff reports runtime failure",
        )
    return GateResult(gate_id, "PASS", "memory consistent with handoff")


def check_open_integration_run(ctx: RunContext) -> GateResult:
    gate_id = "open-integration-run.pass"
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "open-integration-run deferred (stub mode)")

    from sdlc_workflow_overlap import find_open_integration_conflicts, format_conflict_message

    target = (ctx.manifest or {}).get("target") or {}
    conflicts = find_open_integration_conflicts(
        target_root=target.get("target_root"),
        route=target.get("route"),
        exclude_run_id=ctx.run_id,
    )
    if conflicts:
        return GateResult(gate_id, "FAIL", format_conflict_message(conflicts), metrics={"conflicts": conflicts})
    return GateResult(gate_id, "PASS", "no open integration runs on overlapping surface")


def check_harness_parity(ctx: RunContext) -> GateResult:
    gate_id = "harness-parity.pass"
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "harness-parity deferred (stub mode)")

    from sdlc_harness_parity import check_harness_parity as run_parity, parity_summary

    violations, applicable = run_parity()
    if not applicable:
        return GateResult(gate_id, "PASS", "harness-parity N/A — no harness pairs on disk")
    if violations:
        return GateResult(
            gate_id,
            "FAIL",
            parity_summary(),
            metrics={"violations": [v.__dict__ for v in violations]},
        )
    return GateResult(gate_id, "PASS", "harness parity contract satisfied")


def check_legacy_run_migrated(ctx: RunContext) -> GateResult:
    gate_id = "legacy-run-migrated.pass"
    if ctx.execution_mode == "stub":
        return GateResult(gate_id, "PASS", "legacy-run-migrated deferred (stub mode)")

    from sdlc_workflow_migrate import is_migrated, legacy_blocks_mutation

    run_id = ctx.run_id
    if not run_id:
        return GateResult(gate_id, "PASS", "no run_id — skip legacy migration gate")
    if is_migrated(run_id):
        return GateResult(gate_id, "PASS", f"workflow manifest exists for {run_id}")
    message = legacy_blocks_mutation(run_id)
    if message:
        return GateResult(gate_id, "FAIL", message)
    return GateResult(gate_id, "PASS", "legacy run not active or already archived")


def run_gate_adapter(
    adapter_id: str,
    gate_id: str,
    inputs: dict[str, Any],
    ctx: RunContext,
) -> GateResult:
    if adapter_id in ("structured-output", "schema-valid"):
        if ctx.output_dir and ctx.node_id:
            return check_structured_output(ctx.output_dir / "cognitive" / f"{ctx.node_id}.json")
        target = inputs.get("target") or inputs.get("cognitiveOutput")
        if isinstance(target, dict):
            required = ("nodeId", "runId", "recordedAt", "outcome", "confidence", "artifacts")
            missing = [k for k in required if k not in target]
            if missing:
                return GateResult(gate_id, "FAIL", f"missing fields: {missing}")
            return GateResult(gate_id, "PASS", "structured output valid")
        if ctx.execution_mode == "stub":
            return GateResult(gate_id, "PASS", f"{adapter_id} satisfied (stub mode)")
        return GateResult(gate_id, "FAIL", "no cognitive output for structured-output gate")

    if adapter_id == "delivery-complete":
        if not ctx.output_dir:
            return GateResult(gate_id, "FAIL", "output_dir required for delivery-complete")
        nodes = ctx.manifest.get("nodes") or {}
        exclude = frozenset({ctx.node_id}) if ctx.node_id else frozenset()
        return check_delivery_complete(ctx.output_dir, nodes, exclude_nodes=exclude)

    if adapter_id == "doctor-pass":
        return check_doctor_pass(ctx)

    if adapter_id == "ci-target-aligned":
        return check_ci_target_aligned(ctx)

    if adapter_id == "integration-report":
        return check_integration_report(ctx)

    if adapter_id == "deploy-recorded":
        return check_deploy_recorded(ctx)

    if adapter_id == "post-deploy-recorded":
        return check_post_deploy_recorded(ctx)

    if adapter_id == "board-sync-ready":
        return check_board_sync_ready(ctx)

    if adapter_id == "manifest-stage":
        return GateResult(
            gate_id,
            "FAIL",
            "manifest-stage adapter removed (ADR-018) — use workflow-run manifest gates",
        )

    if adapter_id == "index-registered":
        index_path = SDLC_ROOT / "INDEX.md"
        if index_path.is_file():
            return GateResult(gate_id, "PASS", "INDEX.md present")
        return GateResult(gate_id, "FAIL", "missing .sdlc/INDEX.md")

    if adapter_id == "visual-evidence":
        if ctx.execution_mode == "stub":
            return GateResult(gate_id, "PASS", "visual-evidence deferred (stub mode)")
        deferred = _maybe_defer_profile_gate(adapter_id, ctx, gate_id)
        if deferred is not None:
            return deferred
        evidence_dir = _evidence_dir_from_context(ctx)
        if evidence_dir is None:
            return GateResult(gate_id, "FAIL", "evidence_dir not resolved from manifest")
        return check_visual_evidence(evidence_dir)

    if adapter_id == "library-evidence":
        if ctx.execution_mode == "stub":
            return GateResult(gate_id, "PASS", "library-evidence deferred (stub mode)")
        deferred = _maybe_defer_profile_gate(adapter_id, ctx, gate_id)
        if deferred is not None:
            return deferred
        evidence_dir = _evidence_dir_from_context(ctx)
        if evidence_dir is None:
            return GateResult(gate_id, "FAIL", "evidence_dir not resolved from manifest")
        return check_library_evidence(evidence_dir)

    if adapter_id == "shell-tier-checklist":
        if ctx.execution_mode == "stub":
            return GateResult(gate_id, "PASS", "shell-tier-checklist deferred (stub mode)")
        deferred = _maybe_defer_profile_gate(adapter_id, ctx, gate_id)
        if deferred is not None:
            return deferred
        evidence_dir = _evidence_dir_from_context(ctx)
        if evidence_dir is None:
            return GateResult(gate_id, "FAIL", "evidence_dir not resolved from manifest")
        return check_shell_tier_checklist(evidence_dir)

    if adapter_id == "playwright-report":
        if ctx.execution_mode == "stub":
            return GateResult(gate_id, "PASS", "playwright-report deferred (stub mode)")
        deferred = _maybe_defer_profile_gate(adapter_id, ctx, gate_id)
        if deferred is not None:
            return deferred
        evidence_dir = _evidence_dir_from_context(ctx)
        if evidence_dir is None:
            return GateResult(gate_id, "FAIL", "evidence_dir not resolved from manifest")
        return check_playwright_report(evidence_dir)

    if adapter_id == "feature-flow-complete":
        if ctx.execution_mode == "stub":
            return GateResult(gate_id, "PASS", "feature-flow-complete deferred (stub mode)")
        return check_feature_flow_complete(ctx)

    if adapter_id == "worktree-registered":
        return check_worktree_registered(ctx)

    if adapter_id == "ticket-qa-contract":
        return check_ticket_qa_contract(ctx)

    if adapter_id == "worktree-committed":
        return check_worktree_committed(ctx)

    if adapter_id == "pr-registered":
        return check_pr_registered(ctx)

    if adapter_id == "pr-merged":
        return check_pr_merged(ctx)

    if adapter_id == "reference-ui-ready":
        return check_reference_ui_ready(ctx)

    if adapter_id == "reference-confirmed":
        return check_reference_confirmed(ctx)

    if adapter_id == "feasibility-research":
        return check_feasibility_research(ctx)

    if adapter_id == "spec-reconciliation":
        return check_spec_reconciliation(ctx)

    if adapter_id == "deploy-target-declared":
        return check_deploy_target_declared(ctx)

    if adapter_id == "execution-plane-adr":
        return check_execution_plane_adr(ctx)

    if adapter_id == "e2e-deploy-target":
        return check_e2e_deploy_target(ctx)

    if adapter_id == "memory-consistency":
        return check_memory_consistency(ctx)

    if adapter_id == "open-integration-run":
        return check_open_integration_run(ctx)

    if adapter_id == "harness-parity":
        return check_harness_parity(ctx)

    if adapter_id == "local-validation-recorded":
        return check_local_validation_recorded(ctx)

    if adapter_id == "closure-satisfied":
        return check_closure_satisfied(ctx)

    if adapter_id == "legacy-run-migrated":
        return check_legacy_run_migrated(ctx)

    return GateResult(gate_id, "FAIL", f"unknown gate adapter {adapter_id!r}")
