#!/usr/bin/env python3
"""Validate-local subprocess for goal-flow — profile-aware build/test + closure tier."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Any

from _sdlc_paths import BIN_DIR, REPO_ROOT, load_sdlc_yaml, workspace_target_root

sys.path.insert(0, str(BIN_DIR))

from sdlc_delivery import (  # noqa: E402
    merge_delivery_evidence_if_allowed,
    record_closure,
    rebind_worktree_editable_install,
    sync_definition_of_done,
)
from sdlc_dsl_bindings import load_target_root  # noqa: E402
from sdlc_profile import (  # noqa: E402
    QA_SURFACE_BROWSER,
    QA_SURFACE_HEADLESS,
    active_ticket_from_manifest,
    local_validation_checks,
    resolve_qa_surface,
    workspace_profile,
)
from sdlc_workflow_manifest import load_manifest, save_manifest  # noqa: E402


def _run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    output = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, output.strip()


def _ticket_worktrees(manifest: dict[str, Any]) -> list[tuple[str, dict[str, Any], Path]]:
    pairs: list[tuple[str, dict[str, Any], Path]] = []
    for ticket_id, ticket in (manifest.get("tickets") or {}).items():
        if not isinstance(ticket, dict):
            continue
        if ticket.get("role") in ("epic", "content-post"):
            continue
        wt = ticket.get("worktree")
        if isinstance(wt, str) and wt.strip():
            pairs.append((str(ticket_id), ticket, Path(wt.strip())))
    return pairs


def _run_checks(
    label: str,
    cwd: Path,
    checks: list[tuple[str, list[str]]],
) -> tuple[bool, list[tuple[str, str]], list[str]]:
    results: list[tuple[str, str]] = []
    failures: list[str] = []
    for check_name, cmd in checks:
        code, out = _run(cmd, cwd)
        status = "PASS" if code == 0 else "FAIL"
        results.append((f"[{label}] {check_name}", status))
        if code != 0:
            joined = " ".join(cmd)
            failures.append(f"[{label}] {check_name} ({joined}) exit {code}\n{out}")
    return not failures, results, failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Local validation for goal-flow validate-local node")
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()

    sdlc = load_sdlc_yaml()
    manifest = load_manifest(args.run_id)
    output_rel = (manifest.get("paths") or {}).get("output_dir", "")
    output_dir = (REPO_ROOT / output_rel).resolve() if output_rel else REPO_ROOT / ".sdlc" / "workflow-runs" / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    target_rel = load_target_root(REPO_ROOT)
    target_root = workspace_target_root() if target_rel == "." else (REPO_ROOT / target_rel).resolve()
    if not target_root.is_dir():
        print(f"VALIDATE-LOCAL FAIL: target_root missing: {target_root}", file=sys.stderr)
        return 1

    profile = workspace_profile(sdlc)
    worktrees = _ticket_worktrees(manifest)
    results: list[tuple[str, str]] = []
    surface = QA_SURFACE_BROWSER

    if worktrees:
        all_failures: list[str] = []
        for ticket_id, ticket, wt in worktrees:
            if not wt.is_dir():
                all_failures.append(f"[{ticket_id}] worktree missing: {wt}")
                continue
            rebind_worktree_editable_install(wt, sdlc)
            try:
                surface = resolve_qa_surface(manifest=manifest, ticket=ticket, ticket_id=ticket_id)
            except ValueError as exc:
                print(f"VALIDATE-LOCAL FAIL: {exc}", file=sys.stderr)
                return 1
            checks = local_validation_checks(wt, sdlc, manifest=manifest, ticket=ticket)
            checks = merge_delivery_evidence_if_allowed(
                checks,
                ticket,
                wt,
                sdlc,
                qa_surface=surface,
            )
            if surface == QA_SURFACE_HEADLESS and not checks:
                print(
                    f"VALIDATE-LOCAL FAIL: {ticket_id} qa_surface=headless requires validation_checks "
                    "with {name, cmd} on the ticket (spec-flow / plane-ticket)",
                    file=sys.stderr,
                )
                return 1
            ok, ticket_results, failures = _run_checks(ticket_id, wt, checks)
            results.extend(ticket_results)
            all_failures.extend(failures)
        if all_failures:
            print("VALIDATE-LOCAL FAIL:\n" + "\n".join(all_failures), file=sys.stderr)
            return 1
    else:
        found = active_ticket_from_manifest(manifest)
        ticket_id = ""
        ticket: dict[str, Any] | None = None
        if found:
            ticket_id, ticket = found
        try:
            surface = resolve_qa_surface(manifest=manifest, ticket=ticket, ticket_id=ticket_id)
        except ValueError as exc:
            print(f"VALIDATE-LOCAL FAIL: {exc}", file=sys.stderr)
            return 1
        checks = local_validation_checks(target_root, sdlc, manifest=manifest, ticket=ticket)
        checks = merge_delivery_evidence_if_allowed(
            checks,
            ticket,
            target_root,
            sdlc,
            qa_surface=surface,
        )

        if surface == QA_SURFACE_HEADLESS and not checks:
            label = ticket_id or "ticket"
            print(
                f"VALIDATE-LOCAL FAIL: {label} qa_surface=headless requires validation_checks "
                "with {name, cmd} on the ticket (spec-flow / plane-ticket)",
                file=sys.stderr,
            )
            return 1

        ok, results, failures = _run_checks(ticket_id or "target_root", target_root, checks)
        if failures:
            print("VALIDATE-LOCAL FAIL:\n" + "\n".join(failures), file=sys.stderr)
            return 1

    report_lines = [
        "# Local Validation Report",
        "",
        "status: PASS",
        f"target_root: {target_rel}",
        f"profile: {profile or 'unset'}",
        f"qa_surface: {surface}",
        "checks:",
    ]
    for check_name, status in results:
        report_lines.append(f"- {check_name}: {status}")
    report_lines.append("")

    report = output_dir / "local-validation-report.md"
    report.write_text("\n".join(report_lines), encoding="utf-8")

    closure_extra: dict[str, bool] = {"validation_pass": True}
    if surface == QA_SURFACE_HEADLESS:
        closure_extra["pytest_pass"] = any("pytest" in name and status == "PASS" for name, status in results)
        closure_extra["typecheck_pass"] = any("typecheck" in name and status == "PASS" for name, status in results)
        closure_extra["lint_pass"] = any("lint" in name and status == "PASS" for name, status in results)
    else:
        closure_extra["build_pass"] = any("build" in name and status == "PASS" for name, status in results)
        closure_extra["typecheck_pass"] = any("typecheck" in name and status == "PASS" for name, status in results)

    record_closure(manifest, "local-validated", **closure_extra)
    sync_definition_of_done(manifest, sdlc)
    save_manifest(args.run_id, manifest)

    scope = f"worktrees={len(worktrees)}" if worktrees else f"target={target_rel}"
    print(
        f"VALIDATE-LOCAL PASS {scope} profile={profile} surface={surface} "
        f"closure=local-validated report={report.relative_to(REPO_ROOT)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
