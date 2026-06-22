#!/usr/bin/env python3
"""Delivery closure tiers and surface configuration (ADR-028)."""
from __future__ import annotations

from typing import Any

from _sdlc_paths import REPO_ROOT, load_sdlc_yaml

CLOSURE_TIERS: tuple[str, ...] = (
    "local-validated",
    "preview-validated",
    "staging-validated",
    "production-validated",
)

CLOSURE_RANK: dict[str, int] = {tier: index for index, tier in enumerate(CLOSURE_TIERS)}

DEPLOY_TARGETS: frozenset[str] = frozenset(
    {"local-only", "local-node", "vm", "serverless", "waived-local-only"},
)

LOCAL_DEPLOY_TARGETS: frozenset[str] = frozenset({"local-only", "local-node", "waived-local-only"})

DEFAULT_DELIVERY: dict[str, Any] = {
    "default_closure": "local-validated",
    "worktree_editable_specs": ["."],
    "surfaces": {
        "local": {
            "enabled": True,
            "evidence": ["build", "typecheck", "playwright", "qa-manifest"],
        },
        "preview": {"enabled": False},
        "staging": {"enabled": False},
        "production": {"enabled": False},
    },
}


def delivery_config(sdlc: dict[str, Any] | None = None) -> dict[str, Any]:
    """Merged delivery block from sdlc.yaml with distributable defaults."""
    source = load_sdlc_yaml() if sdlc is None else sdlc
    raw = source.get("delivery") or {}
    if not isinstance(raw, dict):
        return dict(DEFAULT_DELIVERY)
    surfaces = dict(DEFAULT_DELIVERY["surfaces"])
    raw_surfaces = raw.get("surfaces")
    if isinstance(raw_surfaces, dict):
        for name, cfg in raw_surfaces.items():
            if isinstance(cfg, dict):
                base = surfaces.get(name, {})
                merged = dict(base) if isinstance(base, dict) else {}
                merged.update(cfg)
                surfaces[name] = merged
            elif isinstance(cfg, bool):
                surfaces[name] = {"enabled": cfg}
    default_closure = raw.get("default_closure")
    if not isinstance(default_closure, str) or default_closure not in CLOSURE_RANK:
        default_closure = DEFAULT_DELIVERY["default_closure"]
    worktree_editable_specs = raw.get("worktree_editable_specs")
    if not isinstance(worktree_editable_specs, list) or not worktree_editable_specs:
        worktree_editable_specs = list(DEFAULT_DELIVERY["worktree_editable_specs"])
    return {
        "default_closure": default_closure,
        "worktree_editable_specs": worktree_editable_specs,
        "surfaces": surfaces,
    }


def default_deploy_target() -> str:
    return "local-only"


def normalize_deploy_target(value: str | None) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip()
    if normalized == "waived-local-only":
        return "local-only"
    return normalized


def closure_rank(tier: str | None) -> int:
    if isinstance(tier, str) and tier in CLOSURE_RANK:
        return CLOSURE_RANK[tier]
    return -1


def required_closure(manifest: dict[str, Any] | None = None, sdlc: dict[str, Any] | None = None) -> str:
    if manifest:
        target = manifest.get("target") or {}
        explicit = target.get("closure") or target.get("closure_tier")
        if isinstance(explicit, str) and explicit in CLOSURE_RANK:
            return explicit
    return str(delivery_config(sdlc).get("default_closure", "local-validated"))


def achieved_closure(manifest: dict[str, Any]) -> str | None:
    closure = manifest.get("closure") or {}
    if isinstance(closure, dict):
        tier = closure.get("tier")
        if isinstance(tier, str) and tier in CLOSURE_RANK:
            return tier
    deployment = manifest.get("deployment") or {}
    if isinstance(deployment, dict):
        if deployment.get("post_deploy_smoke_pass") is True:
            return "production-validated"
        if any(
            isinstance(deployment.get(key), str) and str(deployment[key]).startswith("http")
            for key in ("production_url", "ci_run_url", "deploy_run_url")
        ):
            return "staging-validated"
    return None


def closure_satisfied(manifest: dict[str, Any], sdlc: dict[str, Any] | None = None) -> bool:
    required = required_closure(manifest, sdlc)
    achieved = achieved_closure(manifest)
    if achieved is None:
        return False
    return closure_rank(achieved) >= closure_rank(required)


def surface_enabled(surface: str, sdlc: dict[str, Any] | None = None) -> bool:
    cfg = delivery_config(sdlc)
    surfaces = cfg.get("surfaces") or {}
    entry = surfaces.get(surface) if isinstance(surfaces, dict) else None
    if isinstance(entry, dict):
        return entry.get("enabled") is True
    return False


def any_surface_enabled(names: tuple[str, ...], sdlc: dict[str, Any] | None = None) -> bool:
    return any(surface_enabled(name, sdlc) for name in names)


def _python_executable(cwd: Any) -> str:
    import sys
    from pathlib import Path

    root = Path(cwd)
    venv_py = root / ".venv" / "bin" / "python"
    if venv_py.is_file():
        return str(venv_py)
    repo_venv = REPO_ROOT / ".venv" / "bin" / "python"
    if repo_venv.is_file():
        return str(repo_venv)
    return sys.executable


def local_evidence_commands(
    cwd: Any,
    sdlc: dict[str, Any] | None = None,
    *,
    qa_surface: str | None = None,
) -> list[tuple[str, list[str]]]:
    """Build validation commands from delivery.surfaces.local.evidence."""
    from pathlib import Path

    cfg = delivery_config(sdlc)
    local_surface = (cfg.get("surfaces") or {}).get("local") or {}
    if not isinstance(local_surface, dict):
        return []
    raw_evidence = local_surface.get("evidence")
    if not isinstance(raw_evidence, list):
        return []

    headless_keys = frozenset({"pytest", "typecheck", "lint", "mypy", "ruff"})
    browser_keys = frozenset({"build", "typecheck", "playwright", "qa-manifest"})

    py = _python_executable(Path(cwd))
    builders: dict[str, tuple[str, list[str]]] = {
        "pytest": ("pytest", [py, "-m", "pytest", "-q"]),
        "typecheck": ("typecheck", [py, "-m", "mypy", "."]),
        "lint": ("lint", [py, "-m", "ruff", "check", "."]),
        "mypy": ("typecheck", [py, "-m", "mypy", "."]),
        "ruff": ("lint", [py, "-m", "ruff", "check", "."]),
        "build": ("build", ["npm", "run", "build"]),
        "playwright": ("playwright", ["npx", "playwright", "test", "--reporter=list"]),
    }

    resolved: list[tuple[str, list[str]]] = []
    seen: set[str] = set()
    for item in raw_evidence:
        key = str(item).strip().lower()
        if qa_surface == "headless" and key not in headless_keys:
            continue
        if qa_surface == "browser" and key not in browser_keys:
            continue
        if key in builders and builders[key][0] not in seen:
            name, cmd = builders[key]
            resolved.append((name, cmd))
            seen.add(name)
    return resolved


def merge_validation_checks(
    primary: list[tuple[str, list[str]]],
    supplemental: list[tuple[str, list[str]]],
) -> list[tuple[str, list[str]]]:
    """Append supplemental checks whose names are not already present."""
    names = {name for name, _cmd in primary}
    merged = list(primary)
    for name, cmd in supplemental:
        if name not in names:
            merged.append((name, cmd))
            names.add(name)
    return merged


def ticket_has_validation_checks(ticket: dict[str, Any] | None) -> bool:
    return (
        isinstance(ticket, dict)
        and isinstance(ticket.get("validation_checks"), list)
        and bool(ticket.get("validation_checks"))
    )


def merge_delivery_evidence_if_allowed(
    checks: list[tuple[str, list[str]]],
    ticket: dict[str, Any] | None,
    cwd: Any,
    sdlc: dict[str, Any] | None,
    *,
    qa_surface: str | None,
) -> list[tuple[str, list[str]]]:
    """ADR-029: ticket.validation_checks is authoritative for headless slices."""
    if ticket_has_validation_checks(ticket):
        return checks
    return merge_validation_checks(
        checks,
        local_evidence_commands(cwd, sdlc, qa_surface=qa_surface),
    )


def rebind_worktree_editable_install(
    worktree: Any,
    sdlc: dict[str, Any] | None = None,
) -> None:
    """Point shared repo venv editable install at worktree (multi-slice goal-flow)."""
    import subprocess
    from pathlib import Path

    wt = Path(worktree)
    venv_pip = REPO_ROOT / ".venv" / "bin" / "pip"
    if not venv_pip.is_file():
        return
    if not (wt / "pyproject.toml").is_file() and not (wt / "setup.py").is_file():
        return

    cfg = delivery_config(sdlc)
    specs = cfg.get("worktree_editable_specs")
    if not isinstance(specs, list) or not specs:
        specs = list(DEFAULT_DELIVERY["worktree_editable_specs"])

    for spec in specs:
        if not isinstance(spec, str) or not spec.strip():
            continue
        proc = subprocess.run(
            [str(venv_pip), "install", "-e", spec.strip(), "-q"],
            cwd=wt,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode == 0:
            return


def integration_serves_slot(slot: str, repo_root: Any | None = None) -> bool:
    from sdlc_dsl_bindings import _active_integrations  # noqa: WPS433

    root = repo_root or REPO_ROOT
    sdlc = load_sdlc_yaml()
    for _provider_id, entry, _config_path in _active_integrations(root, sdlc):
        slots = entry.get("serves_slots") or []
        if isinstance(slots, list) and slot in slots:
            return True
    return False


def seed_manifest_target(manifest: dict[str, Any], sdlc: dict[str, Any] | None = None) -> None:
    target = manifest.setdefault("target", {})
    if not target.get("deploy_target"):
        target["deploy_target"] = default_deploy_target()
    else:
        normalized = normalize_deploy_target(str(target.get("deploy_target")))
        if normalized:
            target["deploy_target"] = normalized
    if not target.get("closure"):
        target["closure"] = required_closure(manifest, sdlc)


def node_skip_for_delivery(
    node_spec: dict[str, Any],
    manifest: dict[str, Any],
    sdlc: dict[str, Any] | None = None,
) -> tuple[bool, str]:
    """Return (should_skip, reason) for closure/surface-gated nodes."""
    control = node_spec.get("control") or {}
    min_closure = control.get("skipUnlessClosureAtLeast")
    if isinstance(min_closure, str) and min_closure in CLOSURE_RANK:
        required = required_closure(manifest, sdlc)
        if closure_rank(required) < closure_rank(min_closure):
            return True, f"closure {required!r} below skipUnlessClosureAtLeast={min_closure!r}"

    surfaces = control.get("skipUnlessSurfacesEnabled")
    if isinstance(surfaces, list) and surfaces:
        enabled = [name for name in surfaces if isinstance(name, str) and surface_enabled(name, sdlc)]
        if not enabled:
            return True, f"no enabled surfaces among {surfaces!r}"

    if control.get("skipUnlessSourceControl") is True:
        if not integration_serves_slot("source_control"):
            return True, "source_control integration slot not active"

    if control.get("skipUnlessCiSlot") is True:
        if not integration_serves_slot("ci"):
            return True, "ci integration slot not active"

    return False, ""


def record_closure(manifest: dict[str, Any], tier: str, **extra: Any) -> None:
    from datetime import datetime, timezone

    if tier not in CLOSURE_RANK:
        raise ValueError(f"invalid closure tier: {tier!r}")
    closure = manifest.setdefault("closure", {})
    closure["tier"] = tier
    closure["recorded_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for key, value in extra.items():
        closure[key] = value


def sync_definition_of_done(manifest: dict[str, Any], sdlc: dict[str, Any] | None = None) -> None:
    """Sync goal-flow DoD flags from manifest state (ADR-028)."""
    dod = manifest.setdefault("definition_of_done", {})
    required = required_closure(manifest, sdlc)
    dod["closure_satisfied"] = closure_satisfied(manifest, sdlc)
    dod["deployed_to_production"] = closure_rank(achieved_closure(manifest) or "") >= CLOSURE_RANK[
        "production-validated"
    ]
    dod["implementation_working"] = (manifest.get("nodes") or {}).get("execution", {}).get("status") == "completed"

    if closure_rank(required) >= CLOSURE_RANK["preview-validated"] and integration_serves_slot(
        "source_control"
    ):
        tickets = manifest.get("tickets") or {}
        pr_urls = [
            ticket.get("pr_url")
            for ticket in tickets.values()
            if isinstance(ticket, dict) and ticket.get("role") not in ("epic", "content-post")
        ]
        pr_urls = [url for url in pr_urls if isinstance(url, str) and url.startswith("http")]
        deploy_node = (manifest.get("nodes") or {}).get("deploy") or {}
        pr_node = (manifest.get("nodes") or {}).get("pr-creation") or {}
        pr_skipped = pr_node.get("status") == "skipped"
        if pr_skipped or not pr_urls:
            dod["all_prs_merged"] = pr_skipped or deploy_node.get("status") in ("skipped", None)
        else:
            dod["all_prs_merged"] = pr_node.get("status") == "completed" and pr_node.get("gate_outcome") == "PASS"
    else:
        dod["all_prs_merged"] = True


GOAL_FLOW_REMOTE_NODES: tuple[str, ...] = (
    "pr-creation",
    "integration",
    "deploy",
    "post-deploy",
)


def goal_flow_node_matrix(
    sdlc: dict[str, Any] | None = None,
    manifest: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Predict RUN vs SKIP for remote goal-flow nodes (operator diagnostics)."""
    from sdlc_workflow_manifest import load_workflow_dsl  # noqa: WPS433

    sdlc_doc = load_sdlc_yaml() if sdlc is None else sdlc
    manifest_doc = manifest if manifest is not None else {"target": {}}
    seed_manifest_target(manifest_doc, sdlc_doc)

    dsl = load_workflow_dsl("goal-flow")
    nodes = dsl.get("spec", {}).get("nodes") or []
    by_id = {n["id"]: n for n in nodes if isinstance(n, dict) and n.get("id")}

    rows: list[dict[str, Any]] = []
    for node_id in GOAL_FLOW_REMOTE_NODES:
        spec = by_id.get(node_id)
        if not spec:
            continue
        skip, reason = node_skip_for_delivery(spec, manifest_doc, sdlc_doc)
        rows.append(
            {
                "node": node_id,
                "mode": "SKIP" if skip else "RUN",
                "reason": reason or "closure, surfaces, and integration slots satisfied",
            }
        )
    return rows


def validate_delivery_config(sdlc: dict[str, Any] | None = None) -> list[str]:
    """Return human-readable misconfiguration warnings."""
    sdlc_doc = load_sdlc_yaml() if sdlc is None else sdlc
    cfg = delivery_config(sdlc_doc)
    required = str(cfg.get("default_closure", "local-validated"))
    warnings: list[str] = []

    if closure_rank(required) >= CLOSURE_RANK["preview-validated"] and not integration_serves_slot(
        "source_control"
    ):
        warnings.append(
            f"default_closure={required!r} requires source_control integration (e.g. github) — "
            "pr-creation and integration nodes will always SKIP"
        )
    if closure_rank(required) >= CLOSURE_RANK["staging-validated"] and not any_surface_enabled(
        ("staging", "production"), sdlc_doc
    ):
        warnings.append(
            f"default_closure={required!r} requires delivery.surfaces.staging or production enabled — "
            "deploy node will always SKIP"
        )
    if closure_rank(required) >= CLOSURE_RANK["staging-validated"] and not integration_serves_slot("deploy"):
        warnings.append(
            f"default_closure={required!r} expects deploy integration for remote delivery — "
            "materialize via /sdlc:config or use /sdlc:deploy manually after goal"
        )
    if closure_rank(required) >= CLOSURE_RANK["production-validated"] and not surface_enabled(
        "production", sdlc_doc
    ):
        warnings.append(
            f"default_closure={required!r} requires delivery.surfaces.production.enabled: true — "
            "post-deploy node will always SKIP"
        )
    if surface_enabled("staging", sdlc_doc) or surface_enabled("production", sdlc_doc):
        if closure_rank(required) < CLOSURE_RANK["staging-validated"]:
            warnings.append(
                "staging/production surfaces are enabled but default_closure is below staging-validated — "
                "remote surfaces are available for /sdlc:deploy only, not goal-flow auto path"
            )
    return warnings


def build_explain_payload(sdlc: dict[str, Any] | None = None) -> dict[str, Any]:
    sdlc_doc = load_sdlc_yaml() if sdlc is None else sdlc
    cfg = delivery_config(sdlc_doc)
    manifest = {"target": {}}
    seed_manifest_target(manifest, sdlc_doc)
    slots = {
        slot: integration_serves_slot(slot)
        for slot in ("work_items", "source_control", "ci", "deploy")
    }
    return {
        "default_closure": cfg.get("default_closure"),
        "surfaces": {
            name: (entry.get("enabled") is True if isinstance(entry, dict) else False)
            for name, entry in (cfg.get("surfaces") or {}).items()
        },
        "manifest_target": manifest.get("target"),
        "integration_slots": slots,
        "goal_flow_nodes": goal_flow_node_matrix(sdlc_doc, manifest),
        "warnings": validate_delivery_config(sdlc_doc),
        "doc": "docs/engineering/delivery-closure.md",
        "adr": ".sdlc/context/decisions/ADR-028-delivery-closure-tiers.md",
    }


def cmd_explain(*, as_json: bool = False) -> int:
    import json

    payload = build_explain_payload()
    if as_json:
        print(json.dumps(payload, indent=2))
        return 0

    print("Delivery closure configuration (ADR-028)")
    print(f"  default_closure: {payload['default_closure']}")
    print(f"  manifest seed:   {payload['manifest_target']}")
    print("  surfaces:")
    for name, enabled in payload["surfaces"].items():
        print(f"    {name}: {'enabled' if enabled else 'disabled'}")
    print("  integration slots:")
    for slot, active in payload["integration_slots"].items():
        print(f"    {slot}: {'active' if active else 'none'}")
    print("  goal-flow remote nodes (new runs):")
    for row in payload["goal_flow_nodes"]:
        print(f"    {row['node']}: {row['mode']} — {row['reason']}")
    if payload["warnings"]:
        print("  warnings:")
        for warning in payload["warnings"]:
            print(f"    - {warning}")
    print(f"  guide: {payload['doc']}")
    return 0


def cmd_validate() -> int:
    warnings = validate_delivery_config()
    if not warnings:
        print("DELIVERY CONFIG OK")
        return 0
    print("DELIVERY CONFIG WARNINGS:")
    for warning in warnings:
        print(f"  - {warning}")
    print("See docs/engineering/delivery-closure.md")
    return 1


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="Delivery closure diagnostics — explain goal-flow path from sdlc.yaml",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    explain = sub.add_parser("explain", help="Show effective closure, surfaces, and goal-flow node matrix")
    explain.add_argument("--json", action="store_true", help="Machine-readable output")
    sub.add_parser("validate", help="Warn on delivery misconfiguration")
    args = parser.parse_args()
    if args.command == "explain":
        return cmd_explain(as_json=args.json)
    if args.command == "validate":
        return cmd_validate()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
