#!/usr/bin/env python3
"""Publish harness staging artifacts to operator deliverables root (ADR-040 Phase 2)."""
from __future__ import annotations

import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from sdlc_dsl_bindings import deliverables_dsl, deliverables_root_path, work_items_provider


def _repo_root(repo_root: Path | None = None) -> Path:
    if repo_root is not None:
        return repo_root
    from _sdlc_paths import REPO_ROOT

    return REPO_ROOT


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass(frozen=True)
class PublishResult:
    ok: bool
    message: str
    published_tickets: tuple[str, ...] = ()
    skipped: bool = False


def _manifest_output_dir(manifest: dict[str, Any], repo_root: Path | None = None) -> Path:
    rel = str((manifest.get("paths") or {}).get("output_dir") or "").strip()
    if not rel:
        raise ValueError("manifest paths.output_dir required for publish")
    return (_repo_root(repo_root) / rel).resolve()


def _relative_under_deliverables_root(path: Path, deliverables_root: Path) -> Path:
    return path.resolve().relative_to(deliverables_root.resolve())


def _update_latest_symlink(run_output: Path, cfg: dict[str, Any], repo_root: Path | None = None) -> None:
    if not cfg["publish"].get("symlink_latest"):
        return
    deliverables_root = deliverables_root_path(repo_root)
    rel_target = _relative_under_deliverables_root(run_output, deliverables_root)
    latest_path = _repo_root(repo_root) / cfg["latest_pointer"]
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    if latest_path.is_symlink() or latest_path.exists():
        latest_path.unlink()
    latest_path.symlink_to(rel_target)


def _copy_evidence_assets(
    ticket_id: str,
    assets_dir: Path,
    cfg: dict[str, Any],
    repo_root: Path | None = None,
) -> list[str]:
    if not cfg["publish"].get("copy_evidence"):
        return []
    staging_rel = cfg["evidence_staging"].strip("/")
    staging = (_repo_root(repo_root) / staging_rel / ticket_id).resolve()
    if not staging.is_dir():
        return []
    assets_dir.mkdir(parents=True, exist_ok=True)
    published: list[str] = []
    for item in sorted(staging.iterdir()):
        dest = assets_dir / item.name
        if item.is_file():
            shutil.copy2(item, dest)
            published.append(str(dest.relative_to(_repo_root(repo_root))))
        elif item.is_dir():
            shutil.copytree(item, dest, dirs_exist_ok=True)
            published.append(str(dest.relative_to(_repo_root(repo_root))))
    return published


def _write_by_ticket_manifest(
    ticket_id: str,
    ticket_meta: dict[str, Any],
    run_id: str,
    manifest: dict[str, Any],
    ticket_dir: Path,
    run_output: Path,
    repo_root: Path | None = None,
) -> None:
    import yaml

    meta = manifest.get("metadata") if isinstance(manifest.get("metadata"), dict) else {}
    payload = {
        "apiVersion": "sdlc.jambu/v1",
        "kind": "TicketDeliverables",
        "metadata": {
            "ticketId": ticket_id,
            "runId": run_id,
            "workflowId": meta.get("workflow_id"),
            "recordedAt": _utc_now(),
        },
        "refs": {
            "runOutputDir": str(run_output.relative_to(_repo_root(repo_root))),
            "worktree": ticket_meta.get("worktree"),
            "branch": ticket_meta.get("branch"),
            "verdict": manifest.get("status"),
        },
        "outputs": {
            "consolidated": "consolidated.md",
            "assetsDir": "assets/",
        },
    }
    ticket_dir.mkdir(parents=True, exist_ok=True)
    consolidated_src = run_output / "consolidated.md"
    consolidated_dest = ticket_dir / "consolidated.md"
    if consolidated_src.is_file():
        shutil.copy2(consolidated_src, consolidated_dest)
    with (ticket_dir / "manifest.yaml").open("w", encoding="utf-8") as handle:
        yaml.safe_dump(payload, handle, sort_keys=False)


def publish_deliverables(
    run_id: str,
    manifest: dict[str, Any],
    *,
    trigger: Literal["workflow", "qa"] = "workflow",
    repo_root: Path | None = None,
) -> PublishResult:
    """Publish run output and ticket evidence to deliverables.root."""
    cfg = deliverables_dsl(repo_root)
    publish_cfg = cfg["publish"]
    if trigger == "workflow" and not publish_cfg.get("on_workflow_complete"):
        return PublishResult(True, "publish skipped (on_workflow_complete=false)", skipped=True)
    if trigger == "qa" and not publish_cfg.get("on_qa_complete"):
        return PublishResult(True, "publish skipped (on_qa_complete=false)", skipped=True)

    try:
        run_output = _manifest_output_dir(manifest, repo_root)
    except ValueError as exc:
        return PublishResult(False, str(exc))

    deliverables_root = deliverables_root_path(repo_root)
    try:
        _relative_under_deliverables_root(run_output, deliverables_root)
    except ValueError:
        return PublishResult(
            False,
            f"output_dir {run_output} is not under deliverables root {deliverables_root}",
        )

    _update_latest_symlink(run_output, cfg, repo_root)

    by_ticket_rel = cfg["by_ticket_index"].strip("/")
    by_ticket_root = _repo_root(repo_root) / by_ticket_rel
    tickets = manifest.get("tickets") if isinstance(manifest.get("tickets"), dict) else {}
    published_tickets: list[str] = []

    provider_id, _, _ = work_items_provider(_repo_root(repo_root))

    for ticket_id, ticket_meta in tickets.items():
        if not isinstance(ticket_meta, dict):
            continue
        ticket_dir = by_ticket_root / ticket_id
        assets_dir = ticket_dir / "assets"
        published_paths = _copy_evidence_assets(ticket_id, assets_dir, cfg, repo_root)
        _write_by_ticket_manifest(
            ticket_id, ticket_meta, run_id, manifest, ticket_dir, run_output, repo_root
        )
        published_tickets.append(ticket_id)

        if provider_id == "local-work-items" and published_paths:
            from local_ticket_state import append_published_evidence_paths  # noqa: WPS433

            append_published_evidence_paths(ticket_id, published_paths, dry_run=False)

    return PublishResult(
        True,
        f"published deliverables for run {run_id} ({len(published_tickets)} ticket(s))",
        published_tickets=tuple(published_tickets),
    )
