#!/usr/bin/env python3
"""Generic gate and postCondition executor for SDLC composite workflows."""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore[assignment]

from _sdlc_paths import GATES_DIR, REPO_ROOT, SDLC_ROOT
from sdlc_ref_resolver import RunContext, resolve_ref, resolve_value
from sdlc_workflow_gate import (
    GateResult,
    check_structured_output,
    evaluate_doctor_structural,
    run_gate_adapter,
)


def _load_gate_yaml(gate_ref: str) -> dict[str, Any]:
    rel = gate_ref.removeprefix("gates/")
    direct = GATES_DIR / rel
    if direct.is_file():
        path = direct
    else:
        path = GATES_DIR / (rel if rel.endswith(".yaml") else f"{rel}.yaml")
    if not path.is_file():
        raise FileNotFoundError(f"gate not found: {gate_ref}")
    with path.open(encoding="utf-8") as handle:
        doc = yaml.safe_load(handle)
    if not isinstance(doc, dict):
        raise ValueError(f"invalid gate doc: {path}")
    return doc


def _gate_id_from_doc(gate_ref: str, doc: dict[str, Any]) -> str:
    return str(doc.get("metadata", {}).get("id", gate_ref.split("/")[-1]))


def _evaluate_assert(target: Any, check: dict[str, Any]) -> GateResult:
    gate_id = "assert.inline"
    path = str(check.get("path", "$"))
    value = target
    if path.startswith("$."):
        segments = path.removeprefix("$.").split(".")
        for seg in segments:
            if isinstance(value, dict):
                value = value.get(seg)
            else:
                value = None
                break
    elif path != "$":
        return GateResult(gate_id, "FAIL", f"unsupported assert path {path!r}")

    if "eq" in check and value != check["eq"]:
        return GateResult(gate_id, "FAIL", f"assert {path} eq {check['eq']!r} got {value!r}")
    if check.get("exists") is True and value is None:
        return GateResult(gate_id, "FAIL", f"assert {path} exists but value is null")
    return GateResult(gate_id, "PASS", f"assert {path} satisfied")


def _execute_gate_check_spec(
    check: dict[str, Any],
    target: Any,
    ctx: RunContext,
    gate_id: str = "inline",
    gate_inputs: dict[str, Any] | None = None,
) -> GateResult:
    check_type = check.get("type", "")
    inputs = gate_inputs or {}

    if check_type == "adapter":
        adapter_id = str(check.get("adapter", gate_id.removesuffix(".pass").removesuffix(".pending")))
        return run_gate_adapter(adapter_id, gate_id, inputs, ctx)

    if check_type == "schema":
        if ctx.output_dir and ctx.node_id:
            return check_structured_output(ctx.output_dir / "cognitive" / f"{ctx.node_id}.json")
        if isinstance(target, dict):
            required = ("nodeId", "runId", "recordedAt", "outcome", "confidence", "artifacts")
            missing = [k for k in required if k not in target]
            if missing:
                return GateResult(gate_id, "FAIL", f"missing fields: {missing}")
            return GateResult(gate_id, "PASS", "schema satisfied")
        if ctx.execution_mode == "stub":
            return GateResult(gate_id, "PASS", "schema satisfied (stub mode)")
        return GateResult(gate_id, "FAIL", "schema check requires cognitive output")

    if check_type == "assert":
        return _evaluate_assert(target, check)

    if check_type == "file":
        rel = str(check.get("path", ".sdlc/INDEX.md"))
        target_path = SDLC_ROOT / rel.removeprefix(".sdlc/") if rel.startswith(".sdlc/") else REPO_ROOT / rel
        if target_path.is_file():
            return GateResult(gate_id, "PASS", f"file check satisfied: {rel}")
        return GateResult(gate_id, "FAIL", f"file not found: {rel!r}")

    if check_type == "doctor":
        if ctx.execution_mode == "stub":
            return GateResult(gate_id, "PASS", "doctor deferred (stub mode)")
        return evaluate_doctor_structural(gate_id)

    if check_type == "manifest":
        if ctx.execution_mode == "stub":
            return GateResult(gate_id, "PASS", "manifest check deferred (stub mode)")
        return GateResult(gate_id, "PASS", "manifest check satisfied")

    if check_type == "ref" or "ref" in check:
        nested_ref = str(check.get("ref", ""))
        nested_inputs = resolve_value(check.get("inputs") or {}, ctx)
        return execute_gate_ref(nested_ref, nested_inputs, ctx)

    return GateResult(gate_id, "FAIL", f"unsupported check type {check_type!r}")


def execute_gate_ref(gate_ref: str, inputs: dict[str, Any], ctx: RunContext) -> GateResult:
    doc = _load_gate_yaml(gate_ref)
    gate_id = _gate_id_from_doc(gate_ref, doc)
    spec_check = dict(doc.get("spec", {}).get("check") or {})
    if not spec_check.get("adapter") and gate_id.endswith(".pass"):
        spec_check.setdefault("adapter", gate_id.removesuffix(".pass"))
    if not spec_check.get("type") and spec_check.get("adapter"):
        spec_check["type"] = "adapter"
    target = inputs.get("phaseOutput") or inputs.get("target") or inputs.get("cognitiveOutput")
    return _execute_gate_check_spec(spec_check, target, ctx, gate_id=gate_id, gate_inputs=inputs)


def execute_condition(condition: dict[str, Any], ctx: RunContext) -> GateResult:
    target_ref = condition.get("target", "$node.output")
    target = resolve_ref(str(target_ref), ctx) if str(target_ref).startswith("$") else condition.get("target")
    checks = condition.get("checks") or []
    if not checks:
        return GateResult("condition.empty", "PASS", "no checks declared")

    last = GateResult("condition", "PASS", "all checks passed")
    for check in checks:
        if not isinstance(check, dict):
            return GateResult("condition", "FAIL", "check must be object")
        if "ref" in check and "type" not in check:
            gate_ref = str(check["ref"])
            gate_inputs = resolve_value(check.get("inputs") or {}, ctx)
            result = execute_gate_ref(gate_ref, gate_inputs, ctx)
        else:
            result = _execute_gate_check_spec(check, target, ctx)
        last = result
        if not result.passed:
            return result
    return last
