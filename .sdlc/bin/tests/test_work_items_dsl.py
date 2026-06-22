#!/usr/bin/env python3
"""Tests for work_items DSL bindings and sync contract."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BIN_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from sdlc_dsl_bindings import (  # noqa: E402
    gate_for_review_manifest_statuses,
    manifest_status_to_provider_state,
    syncable_manifest_statuses,
    ticket_boolean_field_value,
    work_items_board_surface,
    work_items_provider,
    work_items_runtime_bindings,
    work_items_ticket_skill_ref,
)


@pytest.fixture()
def plane_project(tmp_path: Path) -> Path:
    sdlc = tmp_path / ".sdlc"
    integrations = sdlc / "integrations" / "plane"
    integrations.mkdir(parents=True)
    plane_src = REPO_ROOT / ".sdlc" / "integrations" / "plane" / "plane.yaml"
    (integrations / "plane.yaml").write_text(
        plane_src.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (sdlc / "sdlc.yaml").write_text(
        "\n".join(
            [
                "source_of_truth:",
                "  work_items: plane",
                "integrations:",
                "  plane:",
                "    config: .sdlc/integrations/plane/plane.yaml",
                "    status: active",
                "    serves_slots:",
                "    - work_items",
            ],
        )
        + "\n",
        encoding="utf-8",
    )
    return tmp_path


def test_work_items_provider_resolves_local_for_authoring_repo() -> None:
    provider_id, _entry, config_path = work_items_provider(REPO_ROOT)
    assert provider_id == "local-work-items"
    assert config_path.name == "local-work-items.yaml"
    assert config_path.is_file()


def test_work_items_provider_resolves_plane(plane_project: Path) -> None:
    provider_id, _entry, config_path = work_items_provider(plane_project)
    assert provider_id == "plane"
    assert config_path.name == "plane.yaml"
    assert config_path.is_file()


def test_syncable_statuses_from_plane_manifest_sync(plane_project: Path) -> None:
    syncable = syncable_manifest_statuses(plane_project)
    assert syncable == frozenset(
        {"in_progress", "in_review", "ready_for_review", "completed", "done"},
    )


def test_syncable_statuses_from_local_manifest_sync() -> None:
    syncable = syncable_manifest_statuses(REPO_ROOT)
    assert syncable == frozenset(
        {"in_progress", "in_review", "ready_for_review", "completed", "done"},
    )


def test_manifest_status_maps_to_plane_state(plane_project: Path) -> None:
    assert manifest_status_to_provider_state("ready_for_review", plane_project) == "in_review"
    assert manifest_status_to_provider_state("in_review", plane_project) == "in_review"
    assert manifest_status_to_provider_state("completed", plane_project) == "done"
    assert manifest_status_to_provider_state("in_progress", plane_project) == "in_progress"
    assert manifest_status_to_provider_state("done", plane_project) == "done"


def test_gate_for_review_statuses_from_dsl() -> None:
    assert gate_for_review_manifest_statuses() == frozenset({"done", "ready_for_review"})


def test_ticket_boolean_field_accepts_legacy_alias() -> None:
    ticket = {"plane_state_synced": True}
    assert ticket_boolean_field_value(ticket, "work_items_state_synced") is True


def test_manifest_status_unknown_raises(plane_project: Path) -> None:
    with pytest.raises(ValueError, match="No work_items sync mapping"):
        manifest_status_to_provider_state("pending", plane_project)


def test_work_items_runtime_bindings_from_plane_yaml(plane_project: Path) -> None:
    bindings = work_items_runtime_bindings(plane_project)
    assert bindings["provider_id"] == "plane"
    assert bindings["ticket_skill_ref"].endswith("plane-ticket/SKILL.md")
    assert bindings["board_surface"] == "provider_api"
    assert work_items_ticket_skill_ref(plane_project) == bindings["ticket_skill_ref"]
    assert work_items_board_surface(plane_project) == "provider_api"


def test_work_items_runtime_bindings_from_local_yaml() -> None:
    bindings = work_items_runtime_bindings(REPO_ROOT)
    assert bindings["provider_id"] == "local-work-items"
    assert bindings["ticket_skill_ref"].endswith("local-ticket/SKILL.md")
    assert bindings["board_surface"] == "provider_filesystem_mirror"
    assert work_items_ticket_skill_ref(REPO_ROOT) == bindings["ticket_skill_ref"]
    assert work_items_board_surface(REPO_ROOT) == "provider_filesystem_mirror"
