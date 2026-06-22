#!/usr/bin/env python3
"""Harness parity contract checker — TS/Python read-path invariants (ADR-027 FM-7)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from _sdlc_paths import GATES_DIR, REPO_ROOT, workspace_target_root

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore[assignment]

CONTRACT_PATH = GATES_DIR / "harness-parity.contract.yaml"


@dataclass
class ParityViolation:
    invariant_id: str
    language: str
    file_path: str
    message: str


def _load_contract() -> dict[str, Any]:
    if yaml is None or not CONTRACT_PATH.is_file():
        return {}
    data = yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _glob_paths(pattern: str) -> list[Path]:
    roots = [REPO_ROOT, workspace_target_root()]
    seen: set[Path] = set()
    for root in roots:
        if not root.is_dir():
            continue
        for path in root.glob(pattern):
            if path.is_file():
                seen.add(path.resolve())
    return sorted(seen)


def _check_language_file(
    invariant_id: str,
    language: str,
    spec: dict[str, Any],
) -> list[ParityViolation]:
    violations: list[ParityViolation] = []
    glob_pattern = str(spec.get("glob", ""))
    if not glob_pattern:
        return violations

    paths = _glob_paths(glob_pattern)
    if not paths:
        return violations

    required = [str(p) for p in spec.get("required_patterns") or []]
    forbidden = [str(p) for p in spec.get("forbidden_patterns") or []]

    for path in paths:
        rel = str(path.relative_to(REPO_ROOT))
        content = path.read_text(encoding="utf-8", errors="replace")
        for pattern in required:
            if pattern not in content and not re.search(pattern, content):
                violations.append(
                    ParityViolation(
                        invariant_id,
                        language,
                        rel,
                        f"missing required pattern {pattern!r}",
                    ),
                )
        for pattern in forbidden:
            if pattern in content or re.search(pattern, content):
                violations.append(
                    ParityViolation(
                        invariant_id,
                        language,
                        rel,
                        f"forbidden pattern matched {pattern!r}",
                    ),
                )
    return violations


def check_harness_parity() -> tuple[list[ParityViolation], bool]:
    """
    Returns (violations, applicable).
    applicable=False when no contract implementations exist on disk (N/A).
    """
    doc = _load_contract()
    invariants = (doc.get("spec") or {}).get("invariants") or []
    if not isinstance(invariants, list):
        return [], False

    violations: list[ParityViolation] = []
    any_implementation = False

    for inv in invariants:
        if not isinstance(inv, dict):
            continue
        inv_id = str(inv.get("id", "unknown"))
        for language in ("python", "typescript"):
            spec = inv.get(language)
            if not isinstance(spec, dict):
                continue
            glob_pattern = str(spec.get("glob", ""))
            if glob_pattern and _glob_paths(glob_pattern):
                any_implementation = True
            violations.extend(_check_language_file(inv_id, language, spec))

    return violations, any_implementation


def parity_summary() -> str:
    violations, applicable = check_harness_parity()
    if not applicable:
        return "harness-parity N/A — no harness implementation files on disk"
    if violations:
        first = violations[0]
        return f"{first.invariant_id} {first.language} {first.file_path}: {first.message}"
    return "harness parity contract satisfied"


def main() -> int:
    violations, applicable = check_harness_parity()
    if not applicable:
        print("HARNESS_PARITY N/A")
        return 0
    if violations:
        for v in violations:
            print(f"FAIL {v.invariant_id} [{v.language}] {v.file_path}: {v.message}", file=__import__("sys").stderr)
        return 1
    print("HARNESS_PARITY PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
