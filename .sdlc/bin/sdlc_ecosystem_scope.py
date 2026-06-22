#!/usr/bin/env python3
"""Ecosystem ops scope audit for stop-hook enforcement (ADR-039 Phase 2)."""
from __future__ import annotations

import fnmatch
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from _sdlc_paths import ACTIVE_WORKFLOW_RUN_POINTER, REPO_ROOT, WORKFLOW_RUNS_DIR

ECOSYSTEM_WORKFLOW_ID = "ecosystem-ops-flow"

DEFAULT_CHILD_FORBIDDEN = (
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.*.json",
    "src/**",
    "app/**",
    "e2e/**",
    "node_modules/**",
)


@dataclass
class ScopeAuditResult:
    passed: bool
    violations: list[str]
    followup_message: str | None = None


def _load_yaml(path: Path) -> dict[str, Any]:
    try:
        import yaml
    except ImportError:
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _active_ecosystem_manifest() -> tuple[str, dict[str, Any]] | None:
    if not ACTIVE_WORKFLOW_RUN_POINTER.is_file():
        return None
    run_id = ACTIVE_WORKFLOW_RUN_POINTER.read_text(encoding="utf-8").strip()
    if not run_id:
        return None
    mf = WORKFLOW_RUNS_DIR / run_id / "manifest.yaml"
    if not mf.is_file():
        return None
    manifest = _load_yaml(mf)
    wf = str((manifest.get("metadata") or {}).get("workflow_id", ""))
    if wf != ECOSYSTEM_WORKFLOW_ID:
        return None
    if manifest.get("status") == "completed":
        return None
    return run_id, manifest


def _git_changed_paths(repo_root: Path) -> list[str]:
    if not repo_root.is_dir():
        return []
    git_dir = repo_root / ".git"
    if not git_dir.exists():
        return []
    paths: set[str] = set()
    commands = (
        ["git", "-C", str(repo_root), "diff", "--name-only", "HEAD"],
        ["git", "-C", str(repo_root), "diff", "--name-only", "--cached"],
        ["git", "-C", str(repo_root), "ls-files", "--others", "--exclude-standard"],
    )
    for cmd in commands:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            continue
        for line in proc.stdout.splitlines():
            normalized = line.strip().replace("\\", "/")
            if normalized:
                paths.add(normalized)
    return sorted(paths)


def _matches_pattern(path: str, pattern: str) -> bool:
    norm = path.replace("\\", "/").lstrip("./")
    pat = pattern.replace("\\", "/").lstrip("./")
    if fnmatch.fnmatch(norm, pat):
        return True
    if pat.endswith("/**"):
        prefix = pat[:-3]
        return norm == prefix or norm.startswith(f"{prefix}/")
    return False


def _matches_any(path: str, patterns: list[str]) -> bool:
    return any(_matches_pattern(path, pat) for pat in patterns)


def _forbidden_patterns(allowlist: dict[str, Any]) -> tuple[list[str], list[str]]:
    child_forbidden: list[str] = []
    ecosystem_forbidden: list[str] = []

    global_fb = allowlist.get("forbidden")
    if isinstance(global_fb, list):
        child_forbidden.extend(str(item) for item in global_fb)

    child = allowlist.get("child")
    if isinstance(child, dict):
        fb = child.get("forbidden")
        if isinstance(fb, list):
            child_forbidden.extend(str(item) for item in fb)

    ecosystem = allowlist.get("ecosystem")
    if isinstance(ecosystem, dict):
        fb = ecosystem.get("forbidden")
        if isinstance(fb, list):
            ecosystem_forbidden.extend(str(item) for item in fb)

    if not child_forbidden:
        child_forbidden = list(DEFAULT_CHILD_FORBIDDEN)
    return child_forbidden, ecosystem_forbidden


def _resolve_allowlist_path(manifest: dict[str, Any]) -> Path | None:
    eco = manifest.get("ecosystem_ops")
    if isinstance(eco, dict):
        rel = eco.get("allowlist_path")
        if isinstance(rel, str) and rel.strip():
            candidate = (REPO_ROOT / rel).resolve()
            if candidate.is_file():
                return candidate

    paths = manifest.get("paths")
    if isinstance(paths, dict):
        output_dir = paths.get("output_dir")
        if isinstance(output_dir, str) and output_dir.strip():
            candidate = REPO_ROOT / output_dir / "allowlist.yaml"
            if candidate.is_file():
                return candidate
    return None


def _resolve_targets(manifest: dict[str, Any]) -> tuple[Path | None, Path | None]:
    eco = manifest.get("ecosystem_ops")
    child_target: Path | None = None
    jambu_root: Path | None = None
    if isinstance(eco, dict):
        raw_child = eco.get("child_target")
        raw_jambu = eco.get("jambu_root")
        if isinstance(raw_child, str) and raw_child.strip():
            child_target = Path(raw_child).resolve()
        if isinstance(raw_jambu, str) and raw_jambu.strip():
            jambu_root = Path(raw_jambu).resolve()
    if jambu_root is None:
        jambu_root = REPO_ROOT.parent.resolve()
    return child_target, jambu_root


def _check_child_sdlc_state(child_target: Path) -> str | None:
    sdlc_yaml = child_target / ".sdlc" / "sdlc.yaml"
    if not sdlc_yaml.is_file():
        return None
    doc = _load_yaml(sdlc_yaml)
    if doc.get("status") != "operational":
        return None
    selections = child_target / ".sdlc" / "pipeline" / ".init-selections.json"
    if selections.is_file():
        return None
    return (
        f"{child_target.name}/.sdlc/sdlc.yaml has status=operational "
        "without completed /sdlc:init (.init-selections.json missing)"
    )


def audit_ecosystem_scope(
    manifest: dict[str, Any],
    allowlist_path: Path,
    *,
    child_target: Path | None = None,
    jambu_root: Path | None = None,
) -> ScopeAuditResult:
    allowlist = _load_yaml(allowlist_path)
    child_forbidden, ecosystem_forbidden = _forbidden_patterns(allowlist)
    if child_target is None or jambu_root is None:
        resolved_child, resolved_jambu = _resolve_targets(manifest)
        child_target = child_target or resolved_child
        jambu_root = jambu_root or resolved_jambu

    violations: list[str] = []

    if child_target is not None and child_target.is_dir():
        for rel_path in _git_changed_paths(child_target):
            if _matches_any(rel_path, child_forbidden):
                violations.append(f"child:{child_target.name}/{rel_path} matches forbidden pattern")
        state_violation = _check_child_sdlc_state(child_target)
        if state_violation:
            violations.append(state_violation)

    if jambu_root is not None and jambu_root.is_dir():
        for rel_path in _git_changed_paths(jambu_root):
            if ecosystem_forbidden and _matches_any(rel_path, ecosystem_forbidden):
                violations.append(f"ecosystem:{rel_path} matches forbidden pattern")

    passed = len(violations) == 0
    return ScopeAuditResult(passed=passed, violations=violations)


def _format_followup(run_id: str, violations: list[str]) -> str:
    lines = "\n".join(f"  - {item}" for item in violations)
    return (
        "SDLC_ECOSYSTEM_SCOPE_VIOLATION\n"
        f"run_id={run_id}\n"
        "Changed paths violate ecosystem-ops allowlist (ADR-039).\n"
        "Revert forbidden writes or complete scope-verify before handoff.\n"
        f"Violations:\n{lines}"
    )


def evaluate_stop_scope_audit() -> ScopeAuditResult | None:
    """Return audit result when ACTIVE run is ecosystem-ops-flow with allowlist."""
    active = _active_ecosystem_manifest()
    if not active:
        return None

    run_id, manifest = active
    eco = manifest.get("ecosystem_ops")
    if not isinstance(eco, dict):
        return ScopeAuditResult(
            passed=False,
            violations=["manifest missing ecosystem_ops block"],
            followup_message=_format_followup(run_id, ["manifest missing ecosystem_ops block"]),
        )

    if eco.get("scope_gate") == "PASS":
        return ScopeAuditResult(passed=True, violations=[])

    allowlist_path = _resolve_allowlist_path(manifest)
    if allowlist_path is None:
        return None

    child_target, jambu_root = _resolve_targets(manifest)
    result = audit_ecosystem_scope(
        manifest,
        allowlist_path,
        child_target=child_target,
        jambu_root=jambu_root,
    )
    if result.passed:
        return result
    result.followup_message = _format_followup(run_id, result.violations)
    return result
