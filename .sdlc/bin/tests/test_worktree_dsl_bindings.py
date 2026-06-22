"""ADR-037 — workspace.worktrees DSL binding tests."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BIN_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BIN_DIR.parents[1]
sys.path.insert(0, str(BIN_DIR))

from sdlc_dsl_bindings import (  # noqa: E402
    path_under_worktrees_root,
    resolve_worktree_branch,
    resolve_worktree_dir,
    worktrees_dsl,
    worktrees_root_path,
)


@pytest.fixture()
def dsl_worktrees_block(tmp_path, monkeypatch):
    sdlc = {
        "workspace": {
            "target_root": "app",
            "worktrees": {
                "root": "var/wt",
                "dir_template": "{ticket_id}__{slug}",
                "branch_templates": {
                    "feat": "feature/{ticket_id}/{slug}",
                    "fix": "hotfix/{ticket_id}-{slug}",
                },
            },
        }
    }
    monkeypatch.setattr("sdlc_dsl_bindings.load_sdlc_yaml", lambda: sdlc)
    monkeypatch.setattr("sdlc_dsl_bindings.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_dsl_bindings.main_worktree_root", lambda _r=None: tmp_path)
    return tmp_path


def test_worktrees_dsl_reads_config(dsl_worktrees_block) -> None:
    cfg = worktrees_dsl(dsl_worktrees_block)
    assert cfg["root"] == "var/wt"
    assert cfg["dir_template"] == "{ticket_id}__{slug}"
    assert cfg["branch_templates"]["feat"] == "feature/{ticket_id}/{slug}"


def test_resolve_worktree_dir_and_branch(dsl_worktrees_block) -> None:
    path = resolve_worktree_dir("JAMBU-9", "Blog Identity", dsl_worktrees_block)
    assert path == (dsl_worktrees_block / "var/wt/JAMBU-9__blog-identity").resolve()
    assert resolve_worktree_branch("JAMBU-9", "Blog Identity", "feat", dsl_worktrees_block) == (
        "feature/JAMBU-9/blog-identity"
    )
    assert resolve_worktree_branch("JAMBU-9", "Blog Identity", "fix", dsl_worktrees_block) == (
        "hotfix/JAMBU-9-blog-identity"
    )


def test_path_under_worktrees_root(dsl_worktrees_block) -> None:
    inside = str(resolve_worktree_dir("T-1", "slice", dsl_worktrees_block))
    outside = str(dsl_worktrees_block / "elsewhere/foo")
    assert path_under_worktrees_root(inside, dsl_worktrees_block) is True
    assert path_under_worktrees_root(outside, dsl_worktrees_block) is False


def test_defaults_when_workspace_worktrees_missing(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr("sdlc_dsl_bindings.load_sdlc_yaml", lambda: {"workspace": {"target_root": "app"}})
    monkeypatch.setattr("sdlc_dsl_bindings.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_dsl_bindings.main_worktree_root", lambda _r=None: tmp_path)
    cfg = worktrees_dsl(tmp_path)
    assert cfg["root"] == "../worktrees"
    assert cfg["dir_template"] == "{ticket_id}-{slug}"
    root = worktrees_root_path(tmp_path)
    assert root == (tmp_path / "../worktrees").resolve()


def test_worktrees_root_anchors_to_main_worktree_not_linked_checkout(
    monkeypatch, tmp_path
) -> None:
    main = tmp_path / "ai-native-sdlc"
    linked = tmp_path / "worktrees" / "feat-a"
    main.mkdir(parents=True)
    linked.mkdir(parents=True)
    monkeypatch.setattr(
        "sdlc_dsl_bindings.load_sdlc_yaml",
        lambda: {"workspace": {"worktrees": {"root": "../worktrees"}}},
    )
    monkeypatch.setattr("sdlc_dsl_bindings.REPO_ROOT", linked)
    monkeypatch.setattr("sdlc_dsl_bindings.main_worktree_root", lambda _r=None: main)
    assert worktrees_root_path(linked) == (tmp_path / "worktrees").resolve()
