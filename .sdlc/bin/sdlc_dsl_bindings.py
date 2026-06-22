#!/usr/bin/env python3
"""
Resolve workspace bindings from sdlc.yaml DSL and materialized integration configs.

Gate scripts MUST import paths from here — never hardcode runtime or integration paths.
"""
from __future__ import annotations

import fnmatch
import subprocess
from pathlib import Path
from typing import Any

from _sdlc_paths import REPO_ROOT, SDLC_ROOT, integrations_dir, load_sdlc_yaml, workspace_target_rel

DEFAULT_DEPLOY_TARGET_FILES = (
    "e2e/smoke.spec.ts",
    "CHANGELOG.md",
    "package.json",
)

ARCHITECTURE_MEMORY_PATTERNS = (
    r"(Target root:\s*`)[^`]+(`)",
    r"(target_root:\s*`)[^`]+(`)",
)


def _load_integration_yaml(config_path: Path) -> dict[str, Any]:
    if not config_path.is_file():
        return {}
    try:
        import yaml
    except ImportError:
        return {}
    data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _resolve_dsl_path(repo_root: Path, dotted: str) -> Path | None:
    """Resolve dotted ref like source_of_truth.architecture to repo-relative path."""
    sdlc = load_sdlc_yaml()
    node: Any = sdlc
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    if isinstance(node, str) and node.strip():
        return repo_root / node.strip().lstrip("/")
    return None


def _active_integrations(
    repo_root: Path, sdlc: dict[str, Any]
) -> list[tuple[str, dict[str, Any], Path]]:
    """Return (provider_id, index_entry, config_path) for active integrations."""
    entries: list[tuple[str, dict[str, Any], Path]] = []
    integrations = sdlc.get("integrations") or {}
    if not isinstance(integrations, dict):
        return entries
    for provider_id, entry in integrations.items():
        if not isinstance(entry, dict):
            continue
        if entry.get("status") not in (None, "active"):
            continue
        config_rel = entry.get("config")
        if not isinstance(config_rel, str) or not config_rel.strip():
            continue
        config_path = repo_root / config_rel.strip().lstrip("/")
        entries.append((str(provider_id), entry, config_path))
    return entries


def load_target_root(repo_root: Path | None = None) -> str:
    del repo_root
    return workspace_target_rel()


def _contract_block(config_path: Path) -> dict[str, Any]:
    data = _load_integration_yaml(config_path)
    contract = data.get("gate_contract")
    return contract if isinstance(contract, dict) else {}


def protocol_static_paths_from_contracts(repo_root: Path | None = None) -> tuple[str, ...]:
    """Deploy-stage static paths from integration gate_contract.protocol_guard."""
    root = repo_root or REPO_ROOT
    sdlc = load_sdlc_yaml()
    paths: list[str] = []
    for _provider_id, entry, config_path in _active_integrations(root, sdlc):
        contract = _contract_block(config_path)
        pg = contract.get("protocol_guard") or {}
        deploy = pg.get("deploy_stage") if isinstance(pg, dict) else None
        if isinstance(deploy, dict):
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


def ci_check_paths_from_contracts(repo_root: Path | None = None) -> tuple[str, ...]:
    """Paths from gate_contract.gates.ci-target-aligned checks."""
    root = repo_root or REPO_ROOT
    sdlc = load_sdlc_yaml()
    paths: list[str] = []
    for provider_id, entry, config_path in _active_integrations(root, sdlc):
        if not _integration_serves_ci(entry, config_path):
            continue
        contract = _contract_block(config_path)
        gates = contract.get("gates") or {}
        ci_gate = gates.get("ci-target-aligned") if isinstance(gates, dict) else None
        if not isinstance(ci_gate, dict):
            continue
        for check in ci_gate.get("checks") or []:
            if isinstance(check, dict):
                for rel in check.get("paths") or []:
                    rel_str = str(rel).strip().lstrip("/")
                    if rel_str and rel_str not in paths:
                        paths.append(rel_str)
    return tuple(paths)


def _integration_serves_ci(entry: dict[str, Any], config_path: Path) -> bool:
    slots = entry.get("serves_slots")
    if isinstance(slots, list) and "ci" in slots:
        return True
    data = _load_integration_yaml(config_path)
    contract = data.get("gate_contract") or {}
    serves = contract.get("serves_slots")
    return isinstance(serves, list) and "ci" in serves


def specialization_layer_rel() -> str:
    sdlc = load_sdlc_yaml()
    runtime = sdlc.get("runtime") or {}
    layer = runtime.get("specialization_layer") if isinstance(runtime, dict) else None
    if isinstance(layer, str) and layer.strip():
        return layer.strip().rstrip("/")
    return ".cursor"


def deploy_integration_rebind_specs(
    repo_root: Path | None = None,
) -> list[tuple[Path, str]]:
    """Legacy yaml_scalar specs — prefer gate_runner collect_rebind_patches."""
    root = repo_root or REPO_ROOT
    sdlc = load_sdlc_yaml()
    specs: list[tuple[Path, str]] = []

    for _provider_id, _entry, config_path in _active_integrations(root, sdlc):
        contract = _contract_block(config_path)
        rebind = contract.get("workspace_rebind") or {}
        if isinstance(rebind, dict):
            for patch in rebind.get("patches") or []:
                if isinstance(patch, dict) and patch.get("type") == "yaml_scalar":
                    yaml_key = patch.get("yaml_key")
                    if isinstance(yaml_key, str) and yaml_key.strip():
                        specs.append((config_path, yaml_key.strip()))
                        continue
        data = _load_integration_yaml(config_path)
        legacy = data.get("workspace_rebind") or {}
        if isinstance(legacy, dict):
            yaml_path = legacy.get("yaml_path")
            if isinstance(yaml_path, str) and yaml_path.strip():
                specs.append((config_path, yaml_path.strip()))
    return specs


def architecture_memory_path(repo_root: Path | None = None) -> Path | None:
    """Resolve architecture memory from source_of_truth.architecture in DSL."""
    root = repo_root or REPO_ROOT
    resolved = _resolve_dsl_path(root, "source_of_truth.architecture")
    if resolved and resolved.is_file():
        return resolved
    # Fallback: glob under specialization layer
    layer = specialization_layer_rel()
    candidate = root / layer / "memories" / "architecture.md"
    return candidate if candidate.is_file() else None


def architecture_memory_patterns() -> tuple[str, ...]:
    sdlc = load_sdlc_yaml()
    bindings = sdlc.get("workspace_bindings") or {}
    if isinstance(bindings, dict):
        rebind = bindings.get("rebind") or {}
        if isinstance(rebind, dict):
            patterns = rebind.get("architecture_memory_patterns")
            if isinstance(patterns, list) and patterns:
                return tuple(str(p) for p in patterns)
    return ARCHITECTURE_MEMORY_PATTERNS


def cognitive_state_paths(repo_root: Path | None = None) -> tuple[str, ...]:
    """
    Repo-relative paths checked for mark-done durable cognitive state.

    Combines workspace_bindings.cognitive_state.paths, source_of_truth memory refs,
    and memory_glob under runtime.specialization_layer.
    """
    root = repo_root or REPO_ROOT
    sdlc = load_sdlc_yaml()
    paths: list[str] = []

    bindings = sdlc.get("workspace_bindings") or {}
    if isinstance(bindings, dict):
        cognitive = bindings.get("cognitive_state") or {}
        if isinstance(cognitive, dict):
            fixed = cognitive.get("paths")
            if isinstance(fixed, list):
                paths.extend(str(p).strip().lstrip("/") for p in fixed if str(p).strip())

    source = sdlc.get("source_of_truth") or {}
    if isinstance(source, dict):
        for value in source.values():
            if isinstance(value, str) and value.endswith(".md"):
                rel = value.strip().lstrip("/")
                if rel and rel not in paths:
                    paths.append(rel)

    layer = specialization_layer_rel()
    mem_dir = root / layer / "memories"
    if mem_dir.is_dir():
        for mem_file in sorted(mem_dir.glob("*.md")):
            rel = mem_file.relative_to(root).as_posix()
            if rel not in paths:
                paths.append(rel)

    if not paths:
        return (
            ".sdlc/sdlc.yaml",
            ".sdlc/INDEX.md",
            f"{layer}/memories/architecture.md",
            f"{layer}/memories/operational-context.md",
            f"{layer}/memories/business-rules.md",
            f"{layer}/memories/incidents.md",
        )
    return tuple(paths)


def deploy_allowlist_static_paths(repo_root: Path | None = None) -> tuple[str, ...]:
    """Static repo-relative paths allowed during deploy stage — from integration contracts."""
    root = repo_root or REPO_ROOT
    paths: list[str] = list(protocol_static_paths_from_contracts(root))
    bindings = load_sdlc_yaml().get("workspace_bindings") or {}
    if isinstance(bindings, dict):
        protocol = bindings.get("protocol") or {}
        if isinstance(protocol, dict):
            deploy = protocol.get("deploy_stage") or {}
            if isinstance(deploy, dict):
                extra = deploy.get("static_paths")
                if isinstance(extra, list):
                    for item in extra:
                        rel = str(item).strip().lstrip("/")
                        if rel and rel not in paths:
                            paths.append(rel)

    return tuple(paths)


def deploy_allowlist_target_files(repo_root: Path | None = None) -> tuple[str, ...]:
    """Target-root-relative files allowed during deploy stage."""
    sdlc = load_sdlc_yaml()
    bindings = sdlc.get("workspace_bindings") or {}
    if isinstance(bindings, dict):
        protocol = bindings.get("protocol") or {}
        if isinstance(protocol, dict):
            deploy = protocol.get("deploy_stage") or {}
            if isinstance(deploy, dict):
                files = deploy.get("target_files")
                if isinstance(files, list) and files:
                    return tuple(str(f).strip().lstrip("/") for f in files if str(f).strip())
    return DEFAULT_DEPLOY_TARGET_FILES


def deploy_stage_allowlist_match(repo_root: Path, rel_path: str, target_root: str) -> bool:
    """True when repo-relative path is on deploy-stage allowlist."""
    rel = rel_path.replace("\\", "/").lstrip("./")
    for pattern in deploy_allowlist_static_paths(repo_root):
        if rel == pattern or fnmatch.fnmatch(rel, pattern):
            return True
    allowlisted_target = tuple(
        f"{target_root}/{name}" for name in deploy_allowlist_target_files(repo_root)
    )
    return rel in allowlisted_target


def patch_yaml_dot_path(content: str, dot_path: str, new_value: str) -> str:
    """Patch a single YAML scalar at dot_path (e.g. project.root_directory)."""
    import re

    parts = dot_path.split(".")
    if len(parts) == 1:
        return re.sub(
            rf"({re.escape(parts[0])}:\s*).+",
            rf"\g<1>{new_value}",
            content,
            count=1,
        )
    # Nested: match last segment with indentation heuristic
    leaf = parts[-1]
    return re.sub(
        rf"({re.escape(leaf)}:\s*).+",
        rf"\g<1>{new_value}",
        content,
        count=1,
    )


# ── Work-items integration (manifest ticket contract) ─────────────────────────

DEFAULT_MANIFEST_TICKET_STATUSES = (
    "pending",
    "in_progress",
    "ready_for_review",
    "done",
    "blocked",
)

DEFAULT_GATE_FOR_REVIEW_STATUSES = ("done", "ready_for_review")

DEFAULT_MANIFEST_TICKET_BOOLEAN_FIELDS = frozenset(
    {
        "subagent_dispatched",
        "feature_flow_complete",
        "work_items_evidence_uploaded",
        "work_items_state_synced",
    }
)

DEFAULT_LEGACY_BOOLEAN_ALIASES: dict[str, str] = {
    "work_items_evidence_uploaded": "plane_evidence_uploaded",
    "work_items_state_synced": "plane_state_synced",
}


def _manifest_tickets_config(sdlc: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = (sdlc or load_sdlc_yaml()).get("manifest_tickets") or {}
    return cfg if isinstance(cfg, dict) else {}


def manifest_ticket_statuses() -> tuple[str, ...]:
    """Canonical E2E manifest ticket statuses from sdlc.yaml."""
    cfg = _manifest_tickets_config()
    statuses = cfg.get("statuses")
    if isinstance(statuses, list) and statuses:
        return tuple(str(s).strip() for s in statuses if str(s).strip())
    return DEFAULT_MANIFEST_TICKET_STATUSES


def gate_for_review_manifest_statuses() -> frozenset[str]:
    """Manifest statuses that trigger gate_ticket_for_review."""
    cfg = _manifest_tickets_config()
    values = cfg.get("gate_for_review")
    if isinstance(values, list) and values:
        return frozenset(str(v).strip() for v in values if str(v).strip())
    return frozenset(DEFAULT_GATE_FOR_REVIEW_STATUSES)


def manifest_ticket_boolean_fields() -> frozenset[str]:
    """Boolean ticket fields including legacy aliases for coercion."""
    cfg = _manifest_tickets_config()
    fields: set[str] = set(DEFAULT_MANIFEST_TICKET_BOOLEAN_FIELDS)
    raw = cfg.get("boolean_fields")
    if isinstance(raw, list) and raw:
        fields = {str(f).strip() for f in raw if str(f).strip()}
    aliases = legacy_boolean_field_aliases()
    fields.update(aliases.values())
    return frozenset(fields)


def legacy_boolean_field_aliases() -> dict[str, str]:
    """Canonical field → legacy manifest field name (e.g. plane_state_synced)."""
    cfg = _manifest_tickets_config()
    raw = cfg.get("legacy_boolean_aliases")
    if isinstance(raw, dict) and raw:
        return {str(k): str(v) for k, v in raw.items()}
    return dict(DEFAULT_LEGACY_BOOLEAN_ALIASES)


def ticket_boolean_field_value(ticket: dict[str, Any], canonical_field: str) -> Any:
    """Read boolean ticket field accepting legacy alias names."""
    if ticket.get(canonical_field) is True:
        return True
    legacy = legacy_boolean_field_aliases().get(canonical_field)
    if legacy and ticket.get(legacy) is True:
        return True
    return ticket.get(canonical_field)


def _load_sdlc_for_root(root: Path) -> dict[str, Any]:
    """Load sdlc.yaml from a specific repo root (avoids global path cache in tests)."""
    return _load_integration_yaml(root / ".sdlc" / "sdlc.yaml")


def work_items_provider(
    repo_root: Path | None = None,
) -> tuple[str, dict[str, Any], Path]:
    """
    Resolve active work_items integration: (provider_id, sdlc_index_entry, config_path).

    Uses source_of_truth.work_items slot → integrations index → materialized config.
    """
    root = repo_root or REPO_ROOT
    sdlc = _load_sdlc_for_root(root) if repo_root is not None else load_sdlc_yaml()
    slot_value = (sdlc.get("source_of_truth") or {}).get("work_items")
    if not isinstance(slot_value, str) or not slot_value.strip():
        raise RuntimeError("source_of_truth.work_items not configured in sdlc.yaml")
    provider_id = slot_value.strip()

    integrations = sdlc.get("integrations") or {}
    if not isinstance(integrations, dict):
        raise RuntimeError("integrations index missing in sdlc.yaml")
    entry = integrations.get(provider_id)
    if not isinstance(entry, dict):
        raise RuntimeError(
            f"work_items provider {provider_id!r} not in integrations index"
        )
    if entry.get("status") not in (None, "active"):
        raise RuntimeError(f"work_items provider {provider_id!r} is not active")
    serves = entry.get("serves_slots") or []
    if "work_items" not in serves:
        raise RuntimeError(
            f"integration {provider_id!r} does not serve work_items slot"
        )
    config_rel = entry.get("config")
    if not isinstance(config_rel, str) or not config_rel.strip():
        raise RuntimeError(f"integration {provider_id!r} missing config path")
    config_path = root / config_rel.strip().lstrip("/")
    return provider_id, entry, config_path


def work_items_integration_config(repo_root: Path | None = None) -> dict[str, Any]:
    """Load materialized YAML for the active work_items provider."""
    _provider_id, _entry, config_path = work_items_provider(repo_root)
    return _load_integration_yaml(config_path)


def syncable_manifest_statuses(repo_root: Path | None = None) -> frozenset[str]:
    """
    Manifest statuses that trigger work_items state sync.

    Derived from active integration manifest_sync.status_map keys.
    """
    config = work_items_integration_config(repo_root)
    sync = config.get("manifest_sync") or {}
    if not isinstance(sync, dict):
        return frozenset()
    status_map = sync.get("status_map")
    if isinstance(status_map, dict) and status_map:
        return frozenset(str(k) for k in status_map.keys())
    return frozenset()


def manifest_sync_harness_fields(repo_root: Path | None = None) -> tuple[str, ...]:
    """Field names pushed to work_items provider on harness sync (plane.yaml manifest_sync.harness_fields)."""
    config = work_items_integration_config(repo_root)
    sync = config.get("manifest_sync") or {}
    if not isinstance(sync, dict):
        return ()
    raw = sync.get("harness_fields")
    if isinstance(raw, list) and raw:
        return tuple(str(f).strip() for f in raw if str(f).strip())
    return ()


def harness_comment_marker(repo_root: Path | None = None) -> str:
    """HTML marker identifying harness index comments on Plane issues."""
    config = work_items_integration_config(repo_root)
    sync = config.get("manifest_sync") or {}
    if isinstance(sync, dict):
        marker = sync.get("harness_comment_marker")
        if isinstance(marker, str) and marker.strip():
            return marker.strip()
    return "<!-- sdlc-harness-index -->"


def manifest_status_post_comment(
    manifest_status: str, repo_root: Path | None = None
) -> bool:
    """True when provider config requests a comment on this manifest status transition."""
    config = work_items_integration_config(repo_root)
    sync = config.get("manifest_sync") or {}
    if not isinstance(sync, dict):
        return False
    triggers = sync.get("post_comment_on")
    if isinstance(triggers, list):
        return manifest_status in triggers
    return manifest_status == "ready_for_review"


def manifest_status_to_provider_state(
    manifest_status: str, repo_root: Path | None = None
) -> str:
    """Map manifest ticket status to provider state key via integration config."""
    config = work_items_integration_config(repo_root)
    sync = config.get("manifest_sync") or {}
    if not isinstance(sync, dict):
        raise ValueError(f"No manifest_sync config for manifest status {manifest_status!r}")
    status_map = sync.get("status_map") or {}
    if not isinstance(status_map, dict):
        raise ValueError(f"manifest_sync.status_map missing for status {manifest_status!r}")
    provider_state = status_map.get(manifest_status)
    if not isinstance(provider_state, str) or not provider_state.strip():
        raise ValueError(
            f"No work_items sync mapping for manifest status: {manifest_status!r}"
        )
    return provider_state.strip()


def work_items_runtime_bindings(repo_root: Path | None = None) -> dict[str, str]:
    """
    Provider runtime bindings from active work_items integration YAML.

    Used by workflows and skills to resolve ticket_skill_ref and board_surface
    without hardcoding vendor paths (ADR-025).
    """
    config = work_items_integration_config(repo_root)
    runtime = config.get("runtime")
    if not isinstance(runtime, dict):
        runtime = {}
    provider_id, _entry, _config_path = work_items_provider(repo_root)
    ticket_skill = runtime.get("ticket_skill_ref")
    board_surface = runtime.get("board_surface")
    id_prefix = ""
    conn = config.get("connection")
    if isinstance(conn, dict) and conn.get("id_prefix"):
        id_prefix = str(conn["id_prefix"]).strip()
    return {
        "provider_id": provider_id,
        "ticket_skill_ref": str(ticket_skill).strip() if ticket_skill else "",
        "board_surface": str(board_surface).strip() if board_surface else "",
        "id_prefix": id_prefix,
    }


def work_items_ticket_skill_ref(repo_root: Path | None = None) -> str:
    """Absolute skill path for ticket creation — from integration runtime DSL."""
    ref = work_items_runtime_bindings(repo_root)["ticket_skill_ref"]
    if not ref:
        raise RuntimeError(
            "work_items integration missing runtime.ticket_skill_ref — "
            "set in provider YAML (e.g. plane.yaml, local-work-items.yaml)"
        )
    return ref


def work_items_board_surface(repo_root: Path | None = None) -> str:
    """
    Abstract board surface id for UI layers (trace-ui, dashboards).

    MUST NOT be a filesystem path. Consumers resolve via provider adapter.
    """
    surface = work_items_runtime_bindings(repo_root)["board_surface"]
    if not surface:
        raise RuntimeError(
            "work_items integration missing runtime.board_surface — "
            "set in provider YAML"
        )
    return surface


DEFAULT_WORKTREES_ROOT = "../worktrees"
DEFAULT_WORKTREE_DIR_TEMPLATE = "{ticket_id}-{slug}"
DEFAULT_WORKTREE_BRANCH_TEMPLATES: dict[str, str] = {
    "feat": "feat/{ticket_id}-{slug}",
    "fix": "fix/{ticket_id}-{slug}",
    "chore": "chore/{ticket_id}-{slug}",
}


def _slugify_worktree_segment(text: str) -> str:
    import re

    normalized = text.strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    return normalized.strip("-") or "work"


def worktrees_dsl(repo_root: Path | None = None) -> dict[str, Any]:
    """Normalized ``workspace.worktrees`` contract from sdlc.yaml (ADR-037)."""
    del repo_root  # reserved for future per-repo overrides
    workspace = load_sdlc_yaml().get("workspace") or {}
    block = workspace.get("worktrees") if isinstance(workspace, dict) else {}
    if not isinstance(block, dict):
        block = {}

    root = block.get("root")
    root_str = root.strip() if isinstance(root, str) and root.strip() else DEFAULT_WORKTREES_ROOT

    dir_template = block.get("dir_template")
    dir_str = (
        dir_template.strip()
        if isinstance(dir_template, str) and dir_template.strip()
        else DEFAULT_WORKTREE_DIR_TEMPLATE
    )

    branch_templates = block.get("branch_templates")
    merged_branches = dict(DEFAULT_WORKTREE_BRANCH_TEMPLATES)
    if isinstance(branch_templates, dict):
        for key, value in branch_templates.items():
            if isinstance(key, str) and isinstance(value, str) and value.strip():
                merged_branches[key] = value.strip()

    return {
        "root": root_str,
        "dir_template": dir_str,
        "branch_templates": merged_branches,
    }


def main_worktree_root(repo_root: Path | None = None) -> Path:
    """
    Primary checkout root for path resolution.

    ``workspace.worktrees.root`` is relative to the main worktree, not a linked
    feature worktree (ADR-037).
    """
    start = repo_root or REPO_ROOT
    proc = subprocess.run(
        ["git", "-C", str(start), "worktree", "list", "--porcelain"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode == 0:
        for line in proc.stdout.splitlines():
            if line.startswith("worktree "):
                return Path(line.split(" ", 1)[1].strip()).resolve()
    return start.resolve()


def worktrees_root_path(repo_root: Path | None = None) -> Path:
    """Absolute path to configured worktrees root directory."""
    anchor = main_worktree_root(repo_root)
    rel = worktrees_dsl(repo_root or REPO_ROOT)["root"].lstrip("/")
    return (anchor / rel).resolve()


def _format_worktree_template(template: str, ticket_id: str, slug: str) -> str:
    return template.format(ticket_id=ticket_id, slug=_slugify_worktree_segment(slug))


def resolve_worktree_dir(ticket_id: str, slug: str, repo_root: Path | None = None) -> Path:
    """Resolve absolute worktree directory from DSL templates."""
    root = repo_root or REPO_ROOT
    cfg = worktrees_dsl(root)
    dirname = _format_worktree_template(cfg["dir_template"], ticket_id, slug)
    return (worktrees_root_path(root) / dirname).resolve()


def resolve_worktree_branch(
    ticket_id: str,
    slug: str,
    kind: str = "feat",
    repo_root: Path | None = None,
) -> str:
    """Resolve git branch name from DSL branch_templates."""
    cfg = worktrees_dsl(repo_root or REPO_ROOT)
    templates = cfg["branch_templates"]
    template = templates.get(kind) or templates.get("feat") or DEFAULT_WORKTREE_BRANCH_TEMPLATES["feat"]
    return _format_worktree_template(template, ticket_id, slug)


def deliverables_dsl(repo_root: Path | None = None) -> dict[str, Any]:
    """Normalized deliverables block from sdlc.yaml (ADR-040)."""
    root = repo_root or REPO_ROOT
    raw = load_sdlc_yaml()
    if repo_root and repo_root != REPO_ROOT:
        yaml_path = root / ".sdlc" / "sdlc.yaml"
        if yaml_path.is_file():
            import yaml

            loaded = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
            raw = loaded if isinstance(loaded, dict) else {}
    block = raw.get("deliverables") if isinstance(raw.get("deliverables"), dict) else {}
    publish = block.get("publish") if isinstance(block.get("publish"), dict) else {}
    root_rel = str(block.get("root") or "output/").strip() or "output/"
    if not root_rel.endswith("/"):
        root_rel += "/"
    latest = str(block.get("latest_pointer") or f"{root_rel.rstrip('/')}/LATEST").strip()
    by_ticket = str(block.get("by_ticket_index") or f"{root_rel.rstrip('/')}/by-ticket/").strip()
    evidence_staging = str(block.get("evidence_staging") or ".sdlc/evidence/").strip()
    return {
        "root": root_rel,
        "latest_pointer": latest,
        "by_ticket_index": by_ticket,
        "evidence_staging": evidence_staging,
        "publish": {
            "on_workflow_complete": bool(publish.get("on_workflow_complete", False)),
            "on_qa_complete": bool(publish.get("on_qa_complete", False)),
            "copy_evidence": bool(publish.get("copy_evidence", True)),
            "symlink_latest": bool(publish.get("symlink_latest", True)),
        },
    }


def deliverables_root_path(repo_root: Path | None = None) -> Path:
    """Absolute path to operator deliverables root."""
    cfg = deliverables_dsl(repo_root)
    rel = cfg["root"].lstrip("/")
    anchor = repo_root or REPO_ROOT
    return (anchor / rel).resolve()


def path_under_worktrees_root(file_path: str, repo_root: Path | None = None) -> bool:
    """True when path resolves under workspace.worktrees.root."""
    try:
        resolved = Path(file_path).resolve()
        wt_root = worktrees_root_path(repo_root)
        return resolved == wt_root or wt_root in resolved.parents
    except (OSError, ValueError):
        norm = file_path.replace("\\", "/")
        rel = worktrees_dsl(repo_root or REPO_ROOT)["root"].strip("/")
        return f"/{rel}/" in norm or norm.rstrip("/").endswith(f"/{rel}")

