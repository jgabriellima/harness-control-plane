#!/usr/bin/env python3
"""
Workspace rebind — patch via integration gate_contract.workspace_rebind (ADR-013).

Subcommands:
  verify  — align integrations/memories to current sdlc.yaml target_root (workflow default)
  rebind  — change target_root/profile and apply patches
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required. Install: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

BIN_DIR = Path(__file__).resolve().parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from _sdlc_paths import REPO_ROOT, SDLC_ROOT, SDLC_YAML  # noqa: E402
from sdlc_dsl_bindings import load_target_root  # noqa: E402
from sdlc_gate_check import gate_ci_target_aligned  # noqa: E402
from sdlc_gate_runner import apply_rebind_patch, collect_rebind_patches  # noqa: E402

RUNS_DIR = SDLC_ROOT / "runs"
WORKFLOW_RUNS_DIR = SDLC_ROOT / "workflow-runs"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_yaml(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def save_yaml(path: Path, data: dict[str, Any]) -> None:
    path.write_text(
        yaml.dump(data, default_flow_style=False, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def _framework_memory_patches(
    repo_root: Path,
    sdlc_data: dict[str, Any],
    target: str,
    old_target: str,
) -> list[str]:
    """Framework-level memory patches from workspace_bindings.rebind."""
    bindings = sdlc_data.get("workspace_bindings") or {}
    rebind = bindings.get("rebind") if isinstance(bindings, dict) else None
    if not isinstance(rebind, dict):
        return []
    patches_log: list[str] = []
    for mem_patch in rebind.get("memory_patches") or []:
        if not isinstance(mem_patch, dict):
            continue
        applied = apply_rebind_patch(
            repo_root,
            {"type": "memory_regex_replace", **mem_patch},
            provider_id="framework",
            config_path=SDLC_YAML,
            target_root=target,
            old_target_root=old_target,
        )
        patches_log.extend(f"{rel}: {desc}" for rel, desc in applied)
    return patches_log


def resolve_legacy_run_dir(run_id: str | None) -> Path | None:
    if run_id:
        return RUNS_DIR / run_id
    active = RUNS_DIR / "ACTIVE"
    if active.is_file():
        rid = active.read_text(encoding="utf-8").strip()
        if rid:
            return RUNS_DIR / rid
    return None


def resolve_workflow_output_dir(workflow_run_id: str | None) -> Path | None:
    if not workflow_run_id:
        return None
    manifest_path = WORKFLOW_RUNS_DIR / workflow_run_id / "manifest.yaml"
    if not manifest_path.is_file():
        return None
    data = load_yaml(manifest_path)
    rel = (data.get("paths") or {}).get("output_dir")
    if isinstance(rel, str) and rel.strip():
        return REPO_ROOT / rel.strip()
    return None


def write_rebind_report(
    run_dir: Path,
    *,
    target: str,
    profile: str,
    old_target: str,
    patches: list[str],
    dry_run: bool,
    alignment_errors: list[str],
    mode: str,
) -> Path:
    run_dir.mkdir(parents=True, exist_ok=True)
    report_path = run_dir / "rebind-report.md"
    status = "PASS" if not alignment_errors else "FAIL"
    lines = [
        "# Workspace Rebind Report",
        "",
        f"- Timestamp: {utc_now()}",
        f"- Mode: `{mode}`",
        f"- Target: `{target}`",
        f"- Profile: `{profile}`",
        f"- Previous target_root: `{old_target}`",
        f"- Dry run: `{dry_run}`",
        f"- Verdict: {status}",
        "",
        "## Patches Applied",
        "",
    ]
    if patches:
        lines.extend(f"- {p}" for p in patches)
    else:
        lines.append("- (none — already aligned)")
    lines.extend(["", "## CI Alignment", ""])
    if alignment_errors:
        lines.extend(f"- FAIL: {e}" for e in alignment_errors)
    else:
        lines.append("- PASS: workspace:ci-target-aligned")
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report_path


def _apply_alignment_patches(
    repo_root: Path,
    sdlc_data: dict[str, Any],
    target: str,
    old_target: str,
    dry_run: bool,
) -> list[str]:
    patches: list[str] = []
    if dry_run:
        patches.append("(dry-run) would apply integration gate_contract.workspace_rebind patches")
        return patches
    for provider_id, config_path, patch in collect_rebind_patches(repo_root):
        applied = apply_rebind_patch(
            repo_root,
            patch,
            provider_id=provider_id,
            config_path=config_path,
            target_root=target,
            old_target_root=old_target,
        )
        for rel, desc in applied:
            patches.append(f"{provider_id}/{rel}: {desc}")
    patches.extend(_framework_memory_patches(repo_root, sdlc_data, target, old_target))
    if not patches:
        patches.append("(none — already aligned)")
    return patches


def _write_reports(
    args: argparse.Namespace,
    *,
    target: str,
    profile: str,
    old_target: str,
    patches: list[str],
    dry_run: bool,
    alignment_errors: list[str],
    mode: str,
) -> list[Path]:
    written: list[Path] = []
    dirs: list[Path] = []
    workflow_dir = resolve_workflow_output_dir(args.workflow_run_id)
    if workflow_dir is not None:
        dirs.append(workflow_dir)
    legacy_dir = resolve_legacy_run_dir(args.run_id)
    if legacy_dir is not None and legacy_dir not in dirs:
        dirs.append(legacy_dir)
    for run_dir in dirs:
        written.append(
            write_rebind_report(
                run_dir,
                target=target,
                profile=profile,
                old_target=old_target,
                patches=patches,
                dry_run=dry_run,
                alignment_errors=alignment_errors,
                mode=mode,
            )
        )
    return written


def cmd_verify(args: argparse.Namespace) -> int:
    if not SDLC_YAML.is_file():
        print(f"ERROR: {SDLC_YAML} not found", file=sys.stderr)
        return 1

    sdlc_data = load_yaml(SDLC_YAML)
    workspace = sdlc_data.get("workspace") or {}
    target = load_target_root(REPO_ROOT).strip().lstrip("/")
    profile = str(workspace.get("profile") or "starlight").strip()
    old_target = target

    patches = _apply_alignment_patches(REPO_ROOT, sdlc_data, target, old_target, args.dry_run)
    alignment_errors = [] if args.dry_run else gate_ci_target_aligned(REPO_ROOT, target)

    reports = _write_reports(
        args,
        target=target,
        profile=profile,
        old_target=old_target,
        patches=patches,
        dry_run=args.dry_run,
        alignment_errors=alignment_errors,
        mode="verify",
    )

    print(f"Verify: target_root={target} profile={profile}")
    for p in patches:
        print(f"  {p}")
    for report in reports:
        print(f"Report: {report}")

    if alignment_errors:
        print("CI alignment FAIL:", file=sys.stderr)
        for e in alignment_errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print("CI alignment: PASS")
    return 0


def cmd_rebind(args: argparse.Namespace) -> int:
    target = args.target.strip().lstrip("/")
    profile = args.profile.strip()
    dry_run = args.dry_run

    if not SDLC_YAML.is_file():
        print(f"ERROR: {SDLC_YAML} not found", file=sys.stderr)
        return 1

    sdlc_data = load_yaml(SDLC_YAML)
    workspace = sdlc_data.setdefault("workspace", {})
    old_target = str(workspace.get("target_root") or "app").strip().lstrip("/")

    patches: list[str] = []

    if old_target != target:
        patches.append(f"sdlc.yaml workspace.target_root: {old_target} -> {target}")
        if not dry_run:
            workspace["target_root"] = target
            workspace["profile"] = profile
            save_yaml(SDLC_YAML, sdlc_data)
    elif workspace.get("profile") != profile:
        patches.append(f"sdlc.yaml workspace.profile: {workspace.get('profile')} -> {profile}")
        if not dry_run:
            workspace["profile"] = profile
            save_yaml(SDLC_YAML, sdlc_data)

    patches.extend(_apply_alignment_patches(REPO_ROOT, sdlc_data, target, old_target, dry_run))
    alignment_errors = gate_ci_target_aligned(REPO_ROOT, target)

    reports = _write_reports(
        args,
        target=target,
        profile=profile,
        old_target=old_target,
        patches=patches,
        dry_run=dry_run,
        alignment_errors=alignment_errors if not dry_run else [],
        mode="rebind",
    )

    if dry_run:
        print(f"DRY RUN: would rebind target_root -> {target} (profile={profile})")
    else:
        print(f"Rebind complete: target_root={target} profile={profile}")

    for p in patches:
        print(f"  patched: {p}")
    for report in reports:
        print(f"Report: {report}")

    if alignment_errors:
        print("CI alignment FAIL:", file=sys.stderr)
        for e in alignment_errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print("CI alignment: PASS")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Workspace target_root rebind (ADR-012/013)")
    parser.add_argument("--run-id", help="Legacy E2E run id for rebind-report.md under .sdlc/runs/")
    parser.add_argument(
        "--workflow-run-id",
        help="Workflow run id — writes rebind-report.md to workflow output_dir",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report patches without writing")

    sub = parser.add_subparsers(dest="command", required=True)

    verify = sub.add_parser(
        "verify",
        help="Align integrations to current sdlc.yaml target_root (e2e-orchestration workspace-rebind node)",
    )
    verify.set_defaults(func=cmd_verify)

    rebind = sub.add_parser("rebind", help="Change target_root/profile and apply patches")
    rebind.add_argument("--target", required=True, help="New workspace.target_root path")
    rebind.add_argument("--profile", default="starlight", help="Workspace profile")
    rebind.set_defaults(func=cmd_rebind)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
