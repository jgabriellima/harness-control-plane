#!/usr/bin/env python3
"""
SDLC workflow DSL validator — schema + semantic contract review.

Composite nodes only: function.invoke + postCondition.checks[]

Usage (from repo root):
  python3 .sdlc/bin/sdlc_workflow_validate.py validate --file .sdlc/workflows/bootstrap-flow.yaml
  python3 .sdlc/bin/sdlc_workflow_validate.py review [--dir .sdlc/workflows] [--strict]
  python3 .sdlc/bin/sdlc_workflow_validate.py gates [--dir .sdlc/gates]
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required. pip install pyyaml", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parents[2]
BIN_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BIN_DIR))
SDLC_ROOT = REPO_ROOT / ".sdlc"
GATES_DIR = SDLC_ROOT / "gates"
WORKFLOWS_DIR = SDLC_ROOT / "workflows"

API_VERSION = "sdlc.jambu/v1"
NODE_ID_RE = re.compile(r"^[a-z0-9-]+$")
GATE_REF_RE = re.compile(r"^gates/[a-z0-9-]+\.(pass|pending|check)$")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
TRIGGER_RE = re.compile(r"^/[a-z0-9:-]+$")
FORBIDDEN_INVOKE_TYPES = frozenset({"playbook"})
DELEGATION_GATE_REFS = frozenset({"gates/feature-flow-complete.pass"})


@dataclass
class Finding:
    severity: str
    rule_id: str
    message: str
    path: str = ""


@dataclass
class ReviewResult:
    file: str
    findings: list[Finding] = field(default_factory=list)

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "error"]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "warn"]


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping in {path}")
    return data


def _is_legacy_workflow(doc: dict[str, Any]) -> bool:
    if doc.get("apiVersion") == API_VERSION and doc.get("kind") == "Workflow":
        return False
    return "stages" in doc or "phases" in doc


def _resolve_sdlc_path(rel: str) -> Path:
    return SDLC_ROOT / rel.removeprefix(".sdlc/")


def _resolve_gate_path(gate_ref: str) -> Path:
    rel = gate_ref.removeprefix("gates/").removeprefix(".sdlc/gates/")
    direct = GATES_DIR / rel
    if direct.exists():
        return direct
    return GATES_DIR / f"{rel}.yaml"


def _gate_requires_delegation(gate_ref: str) -> bool:
    if gate_ref in DELEGATION_GATE_REFS:
        return True
    gate_path = _resolve_gate_path(gate_ref)
    if not gate_path.is_file():
        return False
    doc = _load_yaml(gate_path)
    spec = doc.get("spec") if isinstance(doc.get("spec"), dict) else {}
    return bool(spec.get("requires_delegation"))


def _resolve_invoke_ref(invoke_type: str, ref: str) -> Path | None:
    if invoke_type == "agent":
        path = REPO_ROOT / ref
        return path if path.exists() else None
    if invoke_type == "skill":
        path = REPO_ROOT / ref
        return path if path.exists() else None
    if invoke_type == "command":
        from sdlc_command_dispatch import ref_to_command_path

        if ref.startswith("/"):
            candidate = ref_to_command_path(ref)
            return candidate if candidate.is_file() else None
        path = REPO_ROOT / ref
        return path if path.is_file() else None
    return None


def _validate_gate_doc(gate: dict[str, Any], path: Path) -> list[Finding]:
    findings: list[Finding] = []
    prefix = str(path.relative_to(REPO_ROOT))

    if gate.get("apiVersion") != API_VERSION:
        findings.append(Finding("error", "gate-api-version", f"{prefix}: apiVersion must be {API_VERSION}", prefix))
    if gate.get("kind") != "Gate":
        findings.append(Finding("error", "gate-kind", f"{prefix}: kind must be Gate", prefix))

    meta = gate.get("metadata") or {}
    gate_id = meta.get("id", "")
    if not re.match(r"^[a-z0-9-]+\.(pass|pending|check)$", gate_id or ""):
        findings.append(Finding("error", "gate-id", f"{prefix}: metadata.id invalid: {gate_id!r}", prefix))

    version = meta.get("version", "")
    if not SEMVER_RE.match(version or ""):
        findings.append(Finding("error", "gate-version", f"{prefix}: metadata.version invalid: {version!r}", prefix))

    spec = gate.get("spec") or {}
    for req in ("description", "outcomes", "check"):
        if req not in spec:
            findings.append(Finding("error", "gate-spec", f"{prefix}: spec.{req} required", prefix))

    check = spec.get("check") or {}
    allowed = (
        "schema",
        "script",
        "doctor",
        "manifest",
        "file",
        "http",
        "resolve",
        "filesystem",
        "adapter",
        "assert",
        "ref",
    )
    if check and check.get("type") not in allowed:
        findings.append(Finding("error", "gate-check-type", f"{prefix}: spec.check.type invalid", prefix))

    return findings


def _check_dag_acyclic(node_ids: set[str], depends: dict[str, list[str]]) -> bool:
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(nid: str) -> bool:
        if nid in visiting:
            return False
        if nid in visited:
            return True
        visiting.add(nid)
        for dep in depends.get(nid, []):
            if dep not in node_ids:
                continue
            if not visit(dep):
                return False
        visiting.remove(nid)
        visited.add(nid)
        return True

    return all(visit(nid) for nid in node_ids)


def review_workflow(path: Path, strict: bool = False) -> ReviewResult:
    try:
        rel = str(path.relative_to(REPO_ROOT))
    except ValueError:
        rel = str(path)
    result = ReviewResult(file=rel)
    doc = _load_yaml(path)

    if _is_legacy_workflow(doc):
        result.findings.append(
            Finding(
                "error",
                "legacy-format-rejected",
                f"{rel}: legacy format (stages/phases) — migrate to apiVersion {API_VERSION}",
                rel,
            )
        )
        return result

    if doc.get("apiVersion") != API_VERSION:
        result.findings.append(
            Finding("error", "api-version-required", f"{rel}: apiVersion must be {API_VERSION}", rel)
        )
    if doc.get("kind") != "Workflow":
        result.findings.append(Finding("error", "kind-required", f"{rel}: kind must be Workflow", rel))

    meta = doc.get("metadata") or {}
    for field_name, pattern, label in (
        ("id", re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$"), "metadata.id"),
        ("version", SEMVER_RE, "metadata.version"),
        ("trigger", TRIGGER_RE, "metadata.trigger"),
    ):
        value = meta.get(field_name, "")
        if field_name in ("id", "name", "version", "trigger") and field_name not in meta:
            result.findings.append(Finding("error", "metadata-required", f"{rel}: {label} required", rel))
        elif value and not pattern.match(str(value)):
            result.findings.append(Finding("error", "metadata-format", f"{rel}: {label} invalid: {value!r}", rel))

    if not meta.get("name"):
        result.findings.append(Finding("error", "metadata-required", f"{rel}: metadata.name required", rel))

    spec = doc.get("spec") or {}
    if not spec.get("triggers"):
        result.findings.append(Finding("error", "triggers-required", f"{rel}: spec.triggers required", rel))
    if not spec.get("stateContract"):
        result.findings.append(Finding("error", "state-contract", f"{rel}: spec.stateContract required", rel))
    elif not _resolve_sdlc_path(spec["stateContract"]).exists():
        result.findings.append(
            Finding("error", "state-contract-exists", f"{rel}: stateContract not found: {spec['stateContract']}", rel)
        )

    trigger_cmds = {
        t.get("command")
        for t in (spec.get("triggers") or [])
        if isinstance(t, dict) and t.get("type") == "command"
    }
    for trigger_cmd in trigger_cmds:
        if isinstance(trigger_cmd, str) and trigger_cmd.startswith("/"):
            if _resolve_invoke_ref("command", trigger_cmd) is None:
                result.findings.append(
                    Finding(
                        "error",
                        "trigger-command-exists",
                        f"{rel}: trigger command not found: {trigger_cmd!r}",
                        rel,
                    )
                )
    meta_trigger = meta.get("trigger")
    if meta_trigger and trigger_cmds and meta_trigger not in trigger_cmds:
        result.findings.append(
            Finding(
                "error",
                "trigger-command-alignment",
                f"{rel}: metadata.trigger {meta_trigger!r} not in spec.triggers commands",
                rel,
            )
        )

    command_ref = meta.get("command")
    if command_ref:
        cmd_path = REPO_ROOT / command_ref
        if not cmd_path.exists():
            result.findings.append(
                Finding(
                    "warn",
                    "command-file-hint",
                    f"{rel}: metadata.command not found on disk: {command_ref}",
                    rel,
                )
            )

    nodes = spec.get("nodes") or []
    if not nodes:
        result.findings.append(Finding("error", "nodes-required", f"{rel}: spec.nodes must not be empty", rel))

    node_ids: set[str] = set()
    depends: dict[str, list[str]] = {}
    pending_ids = {n.get("id") for n in nodes if isinstance(n, dict) and n.get("id")}

    for idx, node in enumerate(nodes):
        if not isinstance(node, dict):
            result.findings.append(Finding("error", "node-shape", f"{rel}: nodes[{idx}] must be mapping", rel))
            continue

        nid = node.get("id", "")
        node_path = f"{rel}:nodes[{nid or idx}]"
        is_composite = isinstance(node.get("function"), dict) and isinstance(
            (node.get("function") or {}).get("invoke"), dict
        )

        if not NODE_ID_RE.match(nid or ""):
            result.findings.append(Finding("error", "node-id", f"{node_path}: invalid id {nid!r}", node_path))
        elif nid in node_ids:
            result.findings.append(Finding("error", "unique-node-ids", f"{node_path}: duplicate id {nid!r}", node_path))
        else:
            node_ids.add(nid)

        if is_composite:
            if nid.startswith("gate-"):
                result.findings.append(
                    Finding("error", "gate-node-forbidden", f"{node_path}: separate gate-* nodes forbidden", node_path)
                )
            invoke = (node.get("function") or {}).get("invoke") or {}
            invoke_type = str(invoke.get("type", ""))
            invoke_ref = str(invoke.get("ref", ""))
            if invoke_type in FORBIDDEN_INVOKE_TYPES:
                result.findings.append(
                    Finding(
                        "error",
                        "invoke-playbook-forbidden",
                        f"{node_path}: invoke type {invoke_type!r} forbidden",
                        node_path,
                    )
                )
            if not invoke_type or not invoke_ref:
                result.findings.append(
                    Finding("error", "function-invoke-required", f"{node_path}: function.invoke type and ref required", node_path)
                )
            if invoke_type == "subprocess" and not invoke.get("command"):
                result.findings.append(
                    Finding("error", "subprocess-command-required", f"{node_path}: subprocess invoke requires command", node_path)
                )
            post = node.get("postCondition") or {}
            post_checks = post.get("checks") or []
            delegation_gates = [
                str(check.get("ref"))
                for check in post_checks
                if isinstance(check, dict) and check.get("ref") and _gate_requires_delegation(str(check["ref"]))
            ]
            if invoke_type == "subprocess" and delegation_gates:
                control = node.get("control") if isinstance(node.get("control"), dict) else {}
                if not control.get("onFailure"):
                    severity = "error" if strict else "warn"
                    result.findings.append(
                        Finding(
                            severity,
                            "delegation-onFailure-required",
                            (
                                f"{node_path}: subprocess node with delegation gates {delegation_gates} "
                                "requires control.onFailure (RUN DELEGATE contract)"
                            ),
                            node_path,
                        )
                    )
            if invoke_type in ("agent", "skill", "command"):
                resolved = _resolve_invoke_ref(invoke_type, invoke_ref)
                if resolved is None:
                    result.findings.append(
                        Finding(
                            "error",
                            "invoke-ref-exists",
                            f"{node_path}: {invoke_type} ref not found: {invoke_ref!r}",
                            node_path,
                        )
                    )
            output_schema = (node.get("function") or {}).get("outputSchema")
            if output_schema and not _resolve_sdlc_path(str(output_schema)).exists():
                result.findings.append(
                    Finding("error", "output-schema-exists", f"{node_path}: outputSchema not found", node_path)
                )
            post = node.get("postCondition") or {}
            if not post.get("target") or not post.get("checks"):
                result.findings.append(
                    Finding(
                        "error",
                        "post-condition-target-required",
                        f"{node_path}: postCondition target and checks required",
                        node_path,
                    )
                )
            for check in post.get("checks") or []:
                if isinstance(check, dict) and check.get("ref"):
                    gate_ref = str(check["ref"])
                    if not GATE_REF_RE.match(gate_ref):
                        result.findings.append(
                            Finding("error", "node-gate-format", f"{node_path}: invalid gate ref {gate_ref!r}", node_path)
                        )
                    else:
                        gate_path = _resolve_gate_path(gate_ref)
                        if not gate_path.exists():
                            result.findings.append(
                                Finding("error", "gate-file-exists", f"{node_path}: gate missing: {gate_ref}", node_path)
                            )
                        else:
                            gate_doc = _load_yaml(gate_path)
                            for gf in _validate_gate_doc(gate_doc, gate_path):
                                result.findings.append(
                                    Finding(gf.severity, gf.rule_id, f"{node_path}: {gf.message}", node_path)
                                )
            deps = node.get("dependsOn") or []
            if deps:
                depends[nid] = [d for d in deps if isinstance(d, str)]
                for dep in depends[nid]:
                    if dep not in pending_ids:
                        result.findings.append(
                            Finding(
                                "error",
                                "depends-on-resolvable",
                                f"{node_path}: dependsOn references unknown node {dep!r}",
                                node_path,
                            )
                        )
            continue

        if node.get("type") or node.get("gate"):
            result.findings.append(
                Finding(
                    "error",
                    "composite-node-required",
                    f"{node_path}: legacy type/gate shape invalid — use function.invoke + postCondition",
                    node_path,
                )
            )
        else:
            result.findings.append(
                Finding(
                    "error",
                    "composite-node-required",
                    f"{node_path}: node must declare function.invoke and postCondition",
                    node_path,
                )
            )

    if node_ids and not _check_dag_acyclic(node_ids, depends):
        result.findings.append(Finding("error", "dag-acyclic", f"{rel}: dependency cycle detected", rel))

    orchestration = spec.get("orchestration")
    if orchestration:
        manifest = orchestration.get("manifest") or {}
        if not manifest.get("control_script"):
            result.findings.append(
                Finding(
                    "error",
                    "e2e-manifest-script",
                    f"{rel}: orchestration.manifest.control_script required",
                    rel,
                )
            )
        else:
            script = str(manifest["control_script"])
            script_path = REPO_ROOT / script.removeprefix("./")
            if not script_path.exists() and not _resolve_sdlc_path(script).exists():
                result.findings.append(
                    Finding("error", "e2e-manifest-script", f"{rel}: control_script not found: {script}", rel)
                )

    if strict and result.warnings:
        for w in list(result.warnings):
            result.findings.append(Finding("error", w.rule_id, w.message, w.path))

    return result


def collect_gate_refs(workflow_path: Path) -> set[str]:
    doc = _load_yaml(workflow_path)
    if _is_legacy_workflow(doc):
        return set()
    refs: set[str] = set()
    for node in (doc.get("spec") or {}).get("nodes") or []:
        if not isinstance(node, dict):
            continue
        post = node.get("postCondition") or {}
        for check in post.get("checks") or []:
            if isinstance(check, dict) and check.get("ref"):
                refs.add(str(check["ref"]))
    return refs


def cmd_validate(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.is_absolute():
        path = REPO_ROOT / path
    if not path.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 1
    result = review_workflow(path, strict=getattr(args, "strict", False))
    _print_result(result)
    return 1 if result.errors else 0


def cmd_review(args: argparse.Namespace) -> int:
    paths: list[Path] = []
    if args.file:
        p = Path(args.file)
        paths.append(p if p.is_absolute() else REPO_ROOT / p)
    else:
        directory = Path(args.dir) if args.dir else WORKFLOWS_DIR
        if not directory.is_absolute():
            directory = REPO_ROOT / directory
        paths = sorted(directory.glob("*.yaml"))

    if not paths:
        print("ERROR: no workflow files to review", file=sys.stderr)
        return 1

    exit_code = 0
    total_errors = 0
    total_warnings = 0

    print("\n=== SDLC Workflow Contract Review ===\n")
    for path in paths:
        result = review_workflow(path, strict=getattr(args, "strict", False))
        _print_result(result)
        total_errors += len(result.errors)
        total_warnings += len(result.warnings)
        if result.errors:
            exit_code = 1

    print(f"\nReview complete: {len(paths)} workflow(s), {total_errors} error(s), {total_warnings} warning(s)")
    if exit_code == 0:
        print("PASS — all workflows conform to sdlc.jambu/v1 composite contract")
    else:
        print("FAIL — fix generator output or migrate legacy workflows before shipping")
    return exit_code


def cmd_gates(args: argparse.Namespace) -> int:
    directory = Path(args.dir) if args.dir else GATES_DIR
    if not directory.is_absolute():
        directory = REPO_ROOT / directory

    errors = 0
    print("\n=== SDLC Gate Registry Review ===\n")
    for path in sorted(directory.glob("*.yaml")):
        doc = _load_yaml(path)
        rel = path.relative_to(REPO_ROOT)
        kind = doc.get("kind")
        if kind != "Gate":
            if kind == "HarnessParityContract":
                print(f"SKIP {rel} (HarnessParityContract — validated by sdlc_harness_parity.py)")
                continue
            findings = _validate_gate_doc(doc, path)
        else:
            findings = _validate_gate_doc(doc, path)
        if findings:
            errors += len(findings)
            print(f"FAIL {rel}")
            for f in findings:
                print(f"  → [{f.rule_id}] {f.message}")
        else:
            print(f"PASS {rel}")
    return 1 if errors else 0


def _print_result(result: ReviewResult) -> None:
    if not result.findings:
        print(f"PASS {result.file}")
        return
    status = "FAIL" if result.errors else "WARN"
    print(f"{status} {result.file}")
    for f in result.findings:
        icon = "error" if f.severity == "error" else "warn"
        loc = f" [{f.rule_id}]" if f.rule_id else ""
        print(f"  → ({icon}){loc} {f.message}")


def main() -> int:
    parser = argparse.ArgumentParser(description="SDLC workflow DSL validator")
    sub = parser.add_subparsers(dest="command", required=True)

    p_val = sub.add_parser("validate", help="Validate single workflow file")
    p_val.add_argument("--file", required=True)
    p_val.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    p_val.set_defaults(func=cmd_validate)

    p_rev = sub.add_parser("review", help="Final contract review — all rules")
    p_rev.add_argument("--file", help="Single workflow file")
    p_rev.add_argument("--dir", help="Workflow directory (default .sdlc/workflows)")
    p_rev.add_argument("--strict", action="store_true")
    p_rev.set_defaults(func=cmd_review)

    p_gates = sub.add_parser("gates", help="Validate gate registry")
    p_gates.add_argument("--dir", help="Gate directory (default .sdlc/gates)")
    p_gates.set_defaults(func=cmd_gates)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
