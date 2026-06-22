"""Tests for DSL-driven workspace bindings (ADR-012/013)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BIN_DIR = Path(__file__).resolve().parent.parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from sdlc_dsl_bindings import (  # noqa: E402
    architecture_memory_path,
    ci_check_paths_from_contracts,
    cognitive_state_paths,
    deploy_allowlist_target_files,
    deploy_integration_rebind_specs,
    deploy_stage_allowlist_match,
    protocol_static_paths_from_contracts,
)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    sdlc = tmp_path / ".sdlc"
    sdlc.mkdir()
    (sdlc / "sdlc.yaml").write_text(
        """
workspace:
  target_root: app
source_of_truth:
  architecture: .claude/memories/architecture.md
runtime:
  specialization_layer: .claude/
integrations:
  vercel:
    config: .sdlc/integrations/vercel/vercel.yaml
    status: active
    serves_slots: [deploy]
  github:
    config: .sdlc/integrations/github/github.yaml
    status: active
    serves_slots: [ci]
workspace_bindings:
  cognitive_state:
    paths:
      - .sdlc/sdlc.yaml
  protocol:
    deploy_stage:
      target_files:
        - netlify.toml
""",
        encoding="utf-8",
    )
    github_dir = sdlc / "integrations" / "github"
    github_dir.mkdir(parents=True)
    (github_dir / "github.yaml").write_text(
        """
gate_contract:
  version: "1.0"
  gates:
    ci-target-aligned:
      checks:
        - type: file_must_contain
          paths:
            - .github/workflows/custom-deploy.yaml
          must_contain: "{target_root}"
  protocol_guard:
    deploy_stage:
      static_paths:
        - .github/workflows/custom-deploy.yaml
""",
        encoding="utf-8",
    )
    vercel_dir = sdlc / "integrations" / "vercel"
    vercel_dir.mkdir(parents=True)
    (vercel_dir / "vercel.yaml").write_text(
        """
gate_contract:
  version: "1.0"
  workspace_rebind:
    patches:
      - type: yaml_scalar
        yaml_key: project.root_directory
project:
  root_directory: examples/old
""",
        encoding="utf-8",
    )
    mem_dir = tmp_path / ".claude" / "memories"
    mem_dir.mkdir(parents=True)
    (mem_dir / "architecture.md").write_text("Target root: `examples/old`\n", encoding="utf-8")
    return tmp_path


def _patch_paths(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import _sdlc_paths

    monkeypatch.setattr(_sdlc_paths, "REPO_ROOT", repo)
    monkeypatch.setattr(_sdlc_paths, "SDLC_ROOT", repo / ".sdlc")
    monkeypatch.setattr(_sdlc_paths, "SDLC_YAML", repo / ".sdlc" / "sdlc.yaml")
    _sdlc_paths.load_sdlc_yaml.cache_clear()


def test_ci_paths_from_gate_contract(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_paths(repo, monkeypatch)
    paths = ci_check_paths_from_contracts(repo)
    assert paths == (".github/workflows/custom-deploy.yaml",)


def test_protocol_static_from_gate_contract(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_paths(repo, monkeypatch)
    paths = protocol_static_paths_from_contracts(repo)
    assert ".github/workflows/custom-deploy.yaml" in paths
    assert ".sdlc/integrations/vercel/vercel.yaml" in paths


def test_architecture_memory_from_source_of_truth(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_paths(repo, monkeypatch)
    path = architecture_memory_path(repo)
    assert path is not None
    assert path.as_posix().endswith(".claude/memories/architecture.md")


def test_deploy_integration_yaml_scalar_specs(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_paths(repo, monkeypatch)
    specs = deploy_integration_rebind_specs(repo)
    assert len(specs) == 1
    assert specs[0][1] == "project.root_directory"


def test_deploy_allowlist_target_files_from_dsl(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_paths(repo, monkeypatch)
    files = deploy_allowlist_target_files(repo)
    assert "netlify.toml" in files
    assert deploy_stage_allowlist_match(repo, "app/netlify.toml", "app")
