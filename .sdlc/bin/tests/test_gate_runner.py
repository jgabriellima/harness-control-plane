"""Tests for slot-driven gate contract runner (ADR-013)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BIN_DIR = Path(__file__).resolve().parent.parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from sdlc_gate_runner import run_gate_invariant, validate_contract_file  # noqa: E402


@pytest.fixture
def repo_with_github_contract(tmp_path: Path) -> Path:
    sdlc = tmp_path / ".sdlc"
    sdlc.mkdir()
    (sdlc / "sdlc.yaml").write_text(
        """
workspace:
  target_root: app
integrations:
  github:
    config: .sdlc/integrations/github/github.yaml
    status: active
    serves_slots: [ci]
""",
        encoding="utf-8",
    )
    gh_dir = sdlc / "integrations" / "github"
    gh_dir.mkdir(parents=True)
    (gh_dir / "github.yaml").write_text(
        """
integration: github
serves_slots: [ci]
gate_contract:
  version: "1.0"
  gates:
    ci-target-aligned:
      checks:
        - type: file_must_contain
          paths:
            - .github/workflows/deploy.yaml
          must_contain: "working-directory: {target_root}"
""",
        encoding="utf-8",
    )
    wf_dir = tmp_path / ".github" / "workflows"
    wf_dir.mkdir(parents=True)
    (wf_dir / "deploy.yaml").write_text("working-directory: app\n", encoding="utf-8")
    return tmp_path


def test_ci_gate_passes_when_contract_aligned(
    repo_with_github_contract: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import _sdlc_paths

    monkeypatch.setattr(_sdlc_paths, "REPO_ROOT", repo_with_github_contract)
    monkeypatch.setattr(_sdlc_paths, "SDLC_ROOT", repo_with_github_contract / ".sdlc")
    monkeypatch.setattr(_sdlc_paths, "SDLC_YAML", repo_with_github_contract / ".sdlc" / "sdlc.yaml")
    _sdlc_paths.load_sdlc_yaml.cache_clear()

    errors, _ = run_gate_invariant(repo_with_github_contract, "ci-target-aligned", "app")
    assert errors == []


def test_validate_contract_requires_ci_checks(tmp_path: Path) -> None:
    cfg = tmp_path / "bitbucket.yaml"
    cfg.write_text(
        """
integration: bitbucket
serves_slots: [ci]
gate_contract:
  version: "1.0"
""",
        encoding="utf-8",
    )
    errors = validate_contract_file(cfg, tmp_path)
    assert any("ci-target-aligned" in e for e in errors)


def test_validate_contract_passes_complete(tmp_path: Path) -> None:
    cfg = tmp_path / "bitbucket.yaml"
    cfg.write_text(
        """
integration: bitbucket
serves_slots: [ci]
gate_contract:
  version: "1.0"
  gates:
    ci-target-aligned:
      checks:
        - type: file_must_contain
          paths: [bitbucket-pipelines.yml]
          must_contain: "{target_root}"
  workspace_rebind:
    patches:
      - type: regex_replace
        paths: [bitbucket-pipelines.yml]
        search: "cd {old_target_root}"
        replace: "cd {target_root}"
  protocol_guard:
    deploy_stage:
      static_paths: [bitbucket-pipelines.yml]
""",
        encoding="utf-8",
    )
    errors = validate_contract_file(cfg, tmp_path)
    assert errors == []
