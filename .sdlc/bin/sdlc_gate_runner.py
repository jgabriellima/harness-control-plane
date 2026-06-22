#!/usr/bin/env python3
"""
Slot-driven gate contract executor (ADR-013).

Framework code ONLY implements check/patch types. Provider paths and patterns
live in integration gate_contract blocks. Agents validate new integrations via
validate-contract before materialization.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

BIN_DIR = Path(__file__).resolve().parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from _sdlc_paths import REPO_ROOT, load_sdlc_yaml  # noqa: E402
from sdlc_dsl_bindings import (  # noqa: E402
    _active_integrations,
    _load_integration_yaml,
    _resolve_dsl_path,
    architecture_memory_patterns,
    load_target_root,
    patch_yaml_dot_path,
)

GATE_INVARIANT_CI = "ci-target-aligned"
REQUIRED_SLOTS_FOR_GATE: dict[str, str] = {
    GATE_INVARIANT_CI: "ci",
}


def _expand(template: str, *, target_root: str, old_target_root: str = "") -> str:
    return (
        template.replace("{target_root}", target_root)
        .replace("{old_target_root}", old_target_root)
    )


def _integration_serves_slot(entry: dict[str, Any], integration_data: dict[str, Any], slot: str) -> bool:
    slots = entry.get("serves_slots")
    if isinstance(slots, list) and slot in slots:
        return True
    contract = integration_data.get("gate_contract") or {}
    if isinstance(contract, dict):
        serves = contract.get("serves_slots")
        if isinstance(serves, list) and slot in serves:
            return True
    return False


def iter_integration_contracts(
    repo_root: Path,
    *,
    gate_id: str | None = None,
) -> list[tuple[str, Path, dict[str, Any], dict[str, Any]]]:
    """Yield (provider_id, config_path, index_entry, integration_yaml) for active integrations."""
    sdlc = load_sdlc_yaml()
    results: list[tuple[str, Path, dict[str, Any], dict[str, Any]]] = []
    for provider_id, entry, config_path in _active_integrations(repo_root, sdlc):
        data = _load_integration_yaml(config_path)
        contract = data.get("gate_contract")
        if not isinstance(contract, dict):
            continue
        if gate_id:
            gates = contract.get("gates") or {}
            if gate_id not in (gates if isinstance(gates, dict) else {}):
                continue
            required_slot = REQUIRED_SLOTS_FOR_GATE.get(gate_id)
            if required_slot and not _integration_serves_slot(entry, data, required_slot):
                continue
        results.append((provider_id, config_path, entry, data))
    return results


def run_check(
    repo_root: Path,
    check: dict[str, Any],
    *,
    provider_id: str,
    target_root: str,
) -> list[str]:
    ctype = check.get("type")
    errors: list[str] = []

    if ctype == "file_must_contain":
        paths = check.get("paths") or []
        needle = _expand(str(check.get("must_contain") or ""), target_root=target_root)
        if not needle:
            return [f"{provider_id}: file_must_contain missing must_contain"]
        for rel in paths:
            rel_str = str(rel).strip().lstrip("/")
            full = repo_root / rel_str
            if not full.is_file():
                errors.append(f"ci-target-aligned[{provider_id}]: missing {rel_str}")
                continue
            content = full.read_text(encoding="utf-8")
            if needle not in content:
                errors.append(
                    f"ci-target-aligned[{provider_id}]: {rel_str} missing {needle!r}"
                )
        return errors

    if ctype == "file_missing_fail":
        for rel in check.get("paths") or []:
            rel_str = str(rel).strip().lstrip("/")
            if not (repo_root / rel_str).is_file():
                errors.append(f"{provider_id}: required file missing {rel_str}")
        return errors

    return [f"{provider_id}: unsupported gate check type {ctype!r}"]


def run_gate_invariant(
    repo_root: Path,
    gate_id: str,
    target_root: str | None = None,
) -> tuple[list[str], list[str]]:
    """Execute gate invariant across active integration contracts. Returns (errors, warnings)."""
    target = target_root or load_target_root(repo_root)
    errors: list[str] = []
    warnings: list[str] = []

    contracts = iter_integration_contracts(repo_root, gate_id=gate_id)
    if not contracts:
        required_slot = REQUIRED_SLOTS_FOR_GATE.get(gate_id)
        if required_slot:
            warnings.append(
                f"{gate_id}: no active integration with gate_contract serves slot {required_slot!r}"
            )
        return errors, warnings

    for provider_id, _config_path, _entry, data in contracts:
        contract = data.get("gate_contract") or {}
        gates = contract.get("gates") or {}
        gate_def = gates.get(gate_id) if isinstance(gates, dict) else None
        if not isinstance(gate_def, dict):
            continue
        for check in gate_def.get("checks") or []:
            if isinstance(check, dict):
                errors.extend(run_check(repo_root, check, provider_id=provider_id, target_root=target))
    return errors, warnings


def apply_rebind_patch(
    repo_root: Path,
    patch: dict[str, Any],
    *,
    provider_id: str,
    config_path: Path,
    target_root: str,
    old_target_root: str,
) -> list[tuple[str, str]]:
    """Return list of (relative_path, description) patched."""
    ptype = patch.get("type")
    applied: list[tuple[str, str]] = []

    if ptype == "regex_replace":
        paths = patch.get("paths") or []
        search = _expand(str(patch.get("search") or ""), target_root=target_root, old_target_root=old_target_root)
        replace = _expand(str(patch.get("replace") or ""), target_root=target_root, old_target_root=old_target_root)
        for rel in paths:
            rel_str = str(rel).strip().lstrip("/")
            full = repo_root / rel_str
            if not full.is_file():
                continue
            content = full.read_text(encoding="utf-8")
            new_content = content.replace(search, replace)
            if new_content != content:
                full.write_text(new_content, encoding="utf-8")
                applied.append((rel_str, f"regex_replace -> {target_root}"))
        return applied

    if ptype == "yaml_scalar":
        rel_path = patch.get("path")
        if rel_path:
            full = repo_root / str(rel_path).strip().lstrip("/")
        else:
            full = config_path
        yaml_key = str(patch.get("yaml_key") or "").strip()
        if not full.is_file() or not yaml_key:
            return applied
        content = full.read_text(encoding="utf-8")
        new_content = patch_yaml_dot_path(content, yaml_key, target_root)
        if new_content != content:
            full.write_text(new_content, encoding="utf-8")
            rel = full.relative_to(repo_root).as_posix()
            applied.append((rel, f"{yaml_key} -> {target_root}"))
        return applied

    if ptype == "memory_regex_replace":
        mem_ref = patch.get("source_of_truth_ref") or "source_of_truth.architecture"
        mem_path = _resolve_dsl_path(repo_root, str(mem_ref))
        if mem_path is None or not mem_path.is_file():
            return applied
        content = mem_path.read_text(encoding="utf-8")
        updated = content
        for pattern in architecture_memory_patterns():
            updated = re.sub(
                pattern,
                rf"\g<1>{target_root}\2",
                updated,
            )
        if updated != content:
            mem_path.write_text(updated, encoding="utf-8")
            applied.append((mem_path.relative_to(repo_root).as_posix(), "memory target_root"))
        return applied

    return applied


def collect_rebind_patches(repo_root: Path) -> list[tuple[str, Path, dict[str, Any]]]:
    """All workspace_rebind patches from active integrations."""
    sdlc = load_sdlc_yaml()
    out: list[tuple[str, Path, dict[str, Any]]] = []
    for provider_id, entry, config_path in _active_integrations(repo_root, sdlc):
        data = _load_integration_yaml(config_path)
        contract = data.get("gate_contract") or {}
        if not isinstance(contract, dict):
            continue
        rebind = contract.get("workspace_rebind") or {}
        for patch in rebind.get("patches") or []:
            if isinstance(patch, dict):
                out.append((provider_id, config_path, patch))
    return out


def collect_protocol_static_paths(repo_root: Path) -> tuple[str, ...]:
    """Union deploy-stage static paths from integration contracts."""
    sdlc = load_sdlc_yaml()
    paths: list[str] = []
    for provider_id, entry, config_path in _active_integrations(repo_root, sdlc):
        data = _load_integration_yaml(config_path)
        contract = data.get("gate_contract") or {}
        if not isinstance(contract, dict):
            continue
        pg = contract.get("protocol_guard") or {}
        deploy = pg.get("deploy_stage") if isinstance(pg, dict) else None
        if not isinstance(deploy, dict):
            continue
        for rel in deploy.get("static_paths") or []:
            rel_str = str(rel).strip().lstrip("/")
            if rel_str and rel_str not in paths:
                paths.append(rel_str)
        config_rel = entry.get("config")
        if isinstance(config_rel, str):
            rel = config_rel.strip().lstrip("/")
            if rel and rel not in paths:
                paths.append(rel)
    return tuple(paths)


def collect_ci_check_paths(repo_root: Path) -> tuple[str, ...]:
    """Paths referenced by ci-target-aligned checks (for doctor/rebind discovery)."""
    paths: list[str] = []
    for provider_id, _cp, _e, data in iter_integration_contracts(repo_root, gate_id=GATE_INVARIANT_CI):
        contract = data.get("gate_contract") or {}
        gates = contract.get("gates") or {}
        gate_def = gates.get(GATE_INVARIANT_CI) if isinstance(gates, dict) else None
        if not isinstance(gate_def, dict):
            continue
        for check in gate_def.get("checks") or []:
            if isinstance(check, dict):
                for rel in check.get("paths") or []:
                    rel_str = str(rel).strip().lstrip("/")
                    if rel_str and rel_str not in paths:
                        paths.append(rel_str)
    return tuple(paths)


def validate_contract_file(config_path: Path, repo_root: Path | None = None) -> list[str]:
    """Validate integration YAML gate_contract for authoring (meta-cognition exit gate)."""
    root = repo_root or REPO_ROOT
    errors: list[str] = []
    if not config_path.is_file():
        return [f"config not found: {config_path}"]

    data = _load_integration_yaml(config_path)
    contract = data.get("gate_contract")
    if not isinstance(contract, dict):
        return ["gate_contract section missing — required per ADR-013 and pb.sdlc.integration-authoring"]

    version = contract.get("version")
    if version != "1.0":
        errors.append(f"gate_contract.version must be '1.0' (got {version!r})")

    serves = data.get("serves_slots") or contract.get("serves_slots") or []
    gates = contract.get("gates") or {}
    if not isinstance(serves, list) or not serves:
        if not (isinstance(gates, dict) and gates):
            errors.append("serves_slots must be declared on integration or gate_contract")

    if "ci" in serves:
        ci_gate = gates.get(GATE_INVARIANT_CI) if isinstance(gates, dict) else None
        if not isinstance(ci_gate, dict) or not ci_gate.get("checks"):
            errors.append(
                f"integrations serving ci MUST declare gate_contract.gates.{GATE_INVARIANT_CI}.checks"
            )

    rebind = contract.get("workspace_rebind") or {}
    if "ci" in serves and not rebind.get("patches"):
        errors.append("integrations serving ci SHOULD declare workspace_rebind.patches")

    pg = contract.get("protocol_guard") or {}
    deploy = pg.get("deploy_stage") if isinstance(pg, dict) else None
    if isinstance(deploy, dict) and serves:
        if not deploy.get("static_paths"):
            errors.append("protocol_guard.deploy_stage.static_paths recommended for deploy/ci slots")

    # Dry-run checks against current target_root
    target = load_target_root(root)
    provider_id = str(data.get("integration") or config_path.parent.name)
    if isinstance(gates, dict):
        for gate_id, gate_def in gates.items():
            if not isinstance(gate_def, dict):
                continue
            for check in gate_def.get("checks") or []:
                if isinstance(check, dict):
                    ctype = check.get("type")
                    if ctype not in ("file_must_contain", "file_missing_fail"):
                        errors.append(f"unsupported check type {ctype!r} in gate {gate_id}")

    return errors


def cmd_validate(args: argparse.Namespace) -> int:
    path = Path(args.config)
    if not path.is_absolute():
        path = REPO_ROOT / path
    errors = validate_contract_file(path, REPO_ROOT)
    if errors:
        print("CONTRACT VALIDATION FAIL", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print(f"CONTRACT VALIDATION PASS: {path.relative_to(REPO_ROOT)}")
    return 0


def cmd_run_gate(args: argparse.Namespace) -> int:
    errors, warnings = run_gate_invariant(REPO_ROOT, args.gate_id, args.target)
    for w in warnings:
        print(f"WARN: {w}")
    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print(f"PASS: {args.gate_id}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Gate contract runner (ADR-013)")
    sub = parser.add_subparsers(dest="command")

    val = sub.add_parser("validate-contract", help="Validate integration gate_contract (authoring gate)")
    val.add_argument("--config", required=True, help="Path to integration YAML")
    val.set_defaults(func=cmd_validate)

    run = sub.add_parser("run-gate", help="Run invariant across active integrations")
    run.add_argument("--gate-id", default=GATE_INVARIANT_CI)
    run.add_argument("--target", help="target_root override")
    run.set_defaults(func=cmd_run_gate)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if not hasattr(args, "func"):
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
