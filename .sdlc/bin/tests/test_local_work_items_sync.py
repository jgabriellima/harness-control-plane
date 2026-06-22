#!/usr/bin/env python3
"""Tests for local-work-items provider (ADR-025)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

BIN_DIR = Path(__file__).resolve().parent.parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

import local_ticket_state  # noqa: E402
from work_items_sync import sync_manifest_ticket, sync_ticket_harness  # noqa: E402


@pytest.fixture()
def local_project(tmp_path: Path) -> Path:
    sdlc = tmp_path / ".sdlc"
    sdlc.mkdir()
    integrations = sdlc / "integrations" / "local-work-items"
    integrations.mkdir(parents=True)
    template = (
        Path(__file__).resolve().parents[2]
        / "templates/integrations/local-work-items/local-work-items.yaml"
    )
    (integrations / "local-work-items.yaml").write_text(
        template.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (sdlc / "sdlc.yaml").write_text(
        "\n".join(
            [
                "source_of_truth:",
                "  work_items: local-work-items",
                "integrations:",
                "  local-work-items:",
                "    config: .sdlc/integrations/local-work-items/local-work-items.yaml",
                "    status: active",
                "    serves_slots:",
                "    - work_items",
                "manifest_tickets:",
                "  statuses:",
                "  - pending",
                "  - in_progress",
                "  - ready_for_review",
                "  - done",
                "  gate_for_review:",
                "  - ready_for_review",
                "  - done",
            ],
        )
        + "\n",
        encoding="utf-8",
    )
    return tmp_path


def test_ensure_local_ticket_creates_uuid_and_board(local_project: Path) -> None:
    with patch.object(local_ticket_state, "SDLC_ROOT", local_project / ".sdlc"):
        local_ticket_state.load_local_config.cache_clear()  # type: ignore[attr-defined]
        issue_uuid = local_ticket_state.ensure_local_ticket(
            "PROJ-1",
            title="Test ticket",
            qa_surface="browser",
        )
        assert issue_uuid
        ticket = local_ticket_state.load_ticket("PROJ-1")
        assert ticket is not None
        assert ticket["uuid"] == issue_uuid
        assert ticket["status"] == "todo"
        board = local_project / ".sdlc" / "work-items" / "INDEX.md"
        assert board.is_file()
        assert "PROJ-1" in board.read_text(encoding="utf-8")


def test_sync_manifest_ticket_updates_local_state(local_project: Path) -> None:
    with (
        patch.object(local_ticket_state, "SDLC_ROOT", local_project / ".sdlc"),
        patch("work_items_sync._repo_root", return_value=local_project),
    ):
        local_ticket_state.load_local_config.cache_clear()  # type: ignore[attr-defined]
        issue_uuid = local_ticket_state.ensure_local_ticket(
            "PROJ-2",
            title="Sync me",
            qa_surface="browser",
        )
        ticket: dict = {"uuid": issue_uuid, "status": "in_progress", "role": "vertical-slice"}
        provider_state = sync_manifest_ticket(
            "PROJ-2",
            ticket,
            "ready_for_review",
            dry_run=False,
        )
        assert provider_state == "in_review"
        assert ticket["work_items_state_synced"] is True
        stored = local_ticket_state.load_ticket("PROJ-2")
        assert stored is not None
        assert stored["status"] == "in_review"


def test_local_runtime_bindings_from_integration_yaml(local_project: Path) -> None:
    with patch.object(local_ticket_state, "SDLC_ROOT", local_project / ".sdlc"):
        local_ticket_state.load_local_config.cache_clear()  # type: ignore[attr-defined]
        from sdlc_dsl_bindings import work_items_runtime_bindings, work_items_ticket_skill_ref

        bindings = work_items_runtime_bindings(local_project)
        assert bindings["provider_id"] == "local-work-items"
        assert bindings["ticket_skill_ref"].endswith("local-ticket/SKILL.md")
        assert bindings["board_surface"] == "provider_filesystem_mirror"
        assert work_items_ticket_skill_ref(local_project) == bindings["ticket_skill_ref"]


def test_sync_ticket_harness_writes_local_yaml(local_project: Path) -> None:
    with (
        patch.object(local_ticket_state, "SDLC_ROOT", local_project / ".sdlc"),
        patch("work_items_sync._repo_root", return_value=local_project),
    ):
        local_ticket_state.load_local_config.cache_clear()  # type: ignore[attr-defined]
        issue_uuid = local_ticket_state.ensure_local_ticket(
            "PROJ-3",
            title="Harness",
            qa_surface="browser",
        )
        manifest = {
            "metadata": {"workflow_id": "goal-flow"},
            "status": "in_progress",
            "continuity": {"awaiting": "none", "blocked_by_node": "spec-phase"},
            "nodes": {"spec-phase": {"status": "running"}},
        }
        ticket = {"uuid": issue_uuid, "role": "vertical-slice"}
        fields = sync_ticket_harness(
            "PROJ-3",
            ticket,
            manifest,
            "goal-run-1",
            dry_run=False,
        )
        assert fields["harness_run_id"] == "goal-run-1"
        stored = local_ticket_state.load_ticket("PROJ-3")
        assert stored is not None
        assert stored["harness"]["harness_run_id"] == "goal-run-1"


def test_create_ticket_cli_requires_qa_surface(local_project: Path) -> None:
    with patch.object(local_ticket_state, "SDLC_ROOT", local_project / ".sdlc"):
        local_ticket_state.load_local_config.cache_clear()  # type: ignore[attr-defined]
        with pytest.raises(ValueError, match="validation_checks"):
            local_ticket_state.create_ticket_cli(
                "PROJ-4",
                "Headless slice",
                qa_surface="headless",
            )
        local_ticket_state.create_ticket_cli(
            "PROJ-5",
            "Browser slice",
            qa_surface="browser",
        )
        ticket = local_ticket_state.load_ticket("PROJ-5")
        assert ticket is not None
        assert ticket["qa_surface"] == "browser"
