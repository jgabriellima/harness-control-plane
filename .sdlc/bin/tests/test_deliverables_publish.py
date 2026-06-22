"""Tests for ADR-040 deliverables publish pipeline."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BIN))

import _sdlc_paths  # noqa: E402
import sdlc_dsl_bindings  # noqa: E402
from local_ticket_state import load_ticket, save_ticket  # noqa: E402
from sdlc_deliverables_publish import publish_deliverables  # noqa: E402
from sdlc_workflow_gate import check_delivery_complete  # noqa: E402


@pytest.fixture()
def repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    sdlc_root = tmp_path / ".sdlc"
    monkeypatch.setattr(_sdlc_paths, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(_sdlc_paths, "SDLC_ROOT", sdlc_root)
    monkeypatch.setattr(_sdlc_paths, "SDLC_YAML", sdlc_root / "sdlc.yaml")
    monkeypatch.setattr(sdlc_dsl_bindings, "REPO_ROOT", tmp_path)
    _sdlc_paths.load_sdlc_yaml.cache_clear()
    sdlc_root.mkdir()
    (tmp_path / ".sdlc" / "integrations" / "local-work-items").mkdir(parents=True)
    (tmp_path / ".sdlc" / "integrations" / "local-work-items" / "local-work-items.yaml").write_text(
        "storage:\n  root: work-items\n  tickets_subdir: tickets\nconnection:\n  id_prefix: PROJ\n",
        encoding="utf-8",
    )
    (tmp_path / ".sdlc" / "sdlc.yaml").write_text(
        """
source_of_truth:
  work_items: local-work-items
integrations:
  local-work-items:
    status: active
    serves_slots: [work_items]
    config: integrations/local-work-items/local-work-items.yaml
deliverables:
  root: output/
  latest_pointer: output/LATEST
  by_ticket_index: output/by-ticket/
  evidence_staging: .sdlc/evidence/
  publish:
    on_workflow_complete: true
    on_qa_complete: true
    copy_evidence: true
    symlink_latest: true
qa:
  evidence_publish_to_deliverables: true
""".strip()
        + "\n",
        encoding="utf-8",
    )
    return tmp_path


def _write_run_output(repo: Path, rel: str) -> Path:
    out = repo / rel
    (out / "cognitive").mkdir(parents=True)
    (out / "assets").mkdir()
    (out / "manifest.yaml").write_text("kind: RunOutput\n", encoding="utf-8")
    (out / "consolidated.md").write_text("# run\n", encoding="utf-8")
    return out


def test_publish_deliverables_symlink_latest_and_by_ticket(repo: Path) -> None:
    run_rel = "output/goal-flow/run-test-001"
    _write_run_output(repo, run_rel)
    (repo / ".sdlc" / "evidence" / "PROJ-9").mkdir(parents=True)
    (repo / ".sdlc" / "evidence" / "PROJ-9" / "log.txt").write_text("ok\n", encoding="utf-8")

    save_ticket(
        "PROJ-9",
        {
            "uuid": "11111111-1111-1111-1111-111111111111",
            "title": "Test",
            "state": "todo",
            "qa_surface": "headless",
            "validation_checks": [],
            "evidence": [],
        },
    )

    manifest = {
        "status": "completed",
        "metadata": {"workflow_id": "goal-flow"},
        "paths": {"output_dir": run_rel},
        "tickets": {
            "PROJ-9": {
                "worktree": "/tmp/wt",
                "branch": "feat/PROJ-9-test",
            }
        },
        "nodes": {},
    }

    result = publish_deliverables("run-test-001", manifest, trigger="workflow")
    assert result.ok is True
    assert result.skipped is False
    assert result.published_tickets == ("PROJ-9",)

    latest = repo / "output" / "LATEST"
    assert latest.is_symlink()
    assert latest.resolve() == (repo / run_rel).resolve()

    ticket_manifest = repo / "output" / "by-ticket" / "PROJ-9" / "manifest.yaml"
    assert ticket_manifest.is_file()
    assert (repo / "output" / "by-ticket" / "PROJ-9" / "assets" / "log.txt").is_file()

    ticket = load_ticket("PROJ-9")
    assert ticket is not None
    assert any("output/by-ticket/PROJ-9/assets/log.txt" == p for p in ticket.get("evidence", []))


def test_check_delivery_complete_rejects_harness_internal_output(repo: Path) -> None:
    legacy = repo / ".sdlc" / "workflow-runs" / "output" / "goal-flow" / "run-legacy"
    _write_run_output(repo, legacy.relative_to(repo))
    gate = check_delivery_complete(legacy, {})
    assert gate.outcome == "FAIL"
    assert "deliverables root" in gate.message


def test_publish_skipped_when_flag_disabled(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    sdlc_path = repo / ".sdlc" / "sdlc.yaml"
    text = sdlc_path.read_text(encoding="utf-8").replace(
        "on_workflow_complete: true", "on_workflow_complete: false"
    )
    sdlc_path.write_text(text, encoding="utf-8")
    _sdlc_paths.load_sdlc_yaml.cache_clear()

    run_rel = "output/goal-flow/run-skip"
    _write_run_output(repo, run_rel)
    manifest = {
        "status": "completed",
        "metadata": {"workflow_id": "goal-flow"},
        "paths": {"output_dir": run_rel},
        "tickets": {},
        "nodes": {},
    }
    result = publish_deliverables("run-skip", manifest, trigger="workflow")
    assert result.skipped is True
    assert not (repo / "output" / "LATEST").exists()
