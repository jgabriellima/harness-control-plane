#!/usr/bin/env python3
"""Protocol guard — workflow-runs ACTIVE + worktree_gate (ADR-022)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
MAIN_WORKSPACE = Path("/home/administrator/workspaces/jambu/ai-native-sdlc")
BUSIN_35_WT = Path("/home/administrator/workspaces/jambu/worktrees/BUSIN-35-composer-write-path")
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

import sdlc_protocol_guard as pg  # noqa: E402
from _sdlc_paths import ACTIVE_WORKFLOW_RUN_POINTER, WORKFLOW_RUNS_DIR  # noqa: E402


def _execution_manifest(worktree: Path) -> dict[str, object]:
    return {
        "status": "in_progress",
        "metadata": {"run_id": "test-run"},
        "nodes": {"execution": {"status": "running"}},
        "tickets": {
            "BUSIN-35": {
                "worktree": str(worktree),
                "branch": "feat/BUSIN-35-composer-write-path",
            },
        },
    }


class ProtocolGuardWorkflowTests(unittest.TestCase):
    def test_goal_invoke_context_detects_slash_command(self) -> None:
        ctx = pg.goal_invoke_prompt_context("/sdlc:goal Build homepage")
        self.assertIsNotNone(ctx)
        self.assertIn("runner authority", ctx or "")
        self.assertIn("Forbidden", ctx or "")

    def test_goal_invoke_context_ignores_unrelated_prompt(self) -> None:
        self.assertIsNone(pg.goal_invoke_prompt_context("fix typo in readme"))

    def test_blocks_main_workspace_app_edit_when_no_active_run(self) -> None:
        app_file = str(MAIN_WORKSPACE / "app" / "src" / "components" / "probe-guard.ts")
        with patch.object(pg, "workspace_target_root", return_value=MAIN_WORKSPACE / "app"):
            with patch.object(pg, "_active_workflow_run", return_value=(None, None)):
                with patch.object(pg, "_active_legacy_run", return_value=(None, None)):
                    result = pg.check_file_edit(app_file)
        if pg._qa_worktree_gate_enabled():
            self.assertFalse(result["allowed"])
            self.assertIn("ADR-021", result.get("message", ""))

    def test_shell_git_commit_in_write_path_worktree_not_blocked(self) -> None:
        """Regression: APP_WRITE_SHELL_PATTERNS[0] must not match 'write' in path segments."""
        cmd = (
            "cd /home/administrator/workspaces/jambu/worktrees/BUSIN-35-composer-write-path "
            "&& git add app/src/components/react/MessageComposer.tsx "
            "&& git commit -m 'feat: message composer'"
        )
        result = pg.check_shell_command(cmd)
        self.assertTrue(result["allowed"], result.get("message", ""))

    def test_shell_cp_between_write_path_worktrees_not_blocked(self) -> None:
        cmd = (
            "cp /home/administrator/workspaces/jambu/worktrees/BUSIN-35-composer-write-path/app/foo.ts "
            "/home/administrator/workspaces/jambu/worktrees/BUSIN-36-other/app/foo.ts"
        )
        result = pg.check_shell_command(cmd)
        self.assertTrue(result["allowed"], result.get("message", ""))

    def test_shell_rsync_between_worktrees_without_write_in_path_allowed(self) -> None:
        cmd = (
            "rsync -a /home/administrator/workspaces/jambu/worktrees/BUSIN-36-other/ "
            "/home/administrator/workspaces/jambu/worktrees/BUSIN-37-target/"
        )
        result = pg.check_shell_command(cmd)
        self.assertTrue(result["allowed"], result.get("message", ""))

    def test_shell_cd_write_path_alone_not_blocked(self) -> None:
        cmd = "cd /home/administrator/workspaces/jambu/worktrees/BUSIN-35-composer-write-path &"
        result = pg.check_shell_command(cmd)
        self.assertTrue(result["allowed"], result.get("message", ""))

    def test_shell_cursor_write_tool_still_matches_app_pattern(self) -> None:
        """Cursor Write/StrReplace tool invocations must still trigger app/ guard."""
        pattern = pg.APP_WRITE_SHELL_PATTERNS[0]
        self.assertIsNotNone(pattern.search("Write path=app/src/foo.ts"))
        self.assertIsNotNone(pattern.search("StrReplace path=app/src/foo.ts old= new="))
        self.assertIsNone(pattern.search("cd .../composer-write-path && git add app/src/foo.ts"))

    def test_effective_cwd_uses_last_cd_in_chain(self) -> None:
        cmd = "cd /tmp/first && cd /tmp/second && git status"
        self.assertEqual(pg._effective_cwd(cmd, ""), Path("/tmp/second"))

    def test_extract_shell_probe_paths_resolves_app_relative_to_cd(self) -> None:
        cmd = (
            f"cd {BUSIN_35_WT} && git add app/src/components/react/MessageComposer.tsx"
        )
        probes = pg._extract_shell_probe_paths(cmd, "")
        expected = str((BUSIN_35_WT / "app/src/components/react/MessageComposer.tsx").resolve())
        self.assertIn(expected, probes)

    def test_shell_write_in_registered_worktree_allowed_during_execution(self) -> None:
        cmd = "Write path=app/src/foo.ts content=hello"
        manifest = _execution_manifest(BUSIN_35_WT)
        with patch.object(pg, "workspace_target_root", return_value=MAIN_WORKSPACE / "app"):
            with patch.object(pg, "_active_workflow_run", return_value=("test-run", manifest)):
                with patch.object(pg, "_active_legacy_run", return_value=(None, None)):
                    result = pg.check_shell_command(cmd, cwd=str(BUSIN_35_WT))
        self.assertTrue(result["allowed"], result.get("message", ""))

    def test_shell_write_on_main_app_blocked_with_worktree_gate(self) -> None:
        cmd = "Write path=app/src/foo.ts content=hello"
        with patch.object(pg, "workspace_target_root", return_value=MAIN_WORKSPACE / "app"):
            with patch.object(pg, "_active_workflow_run", return_value=("test-run", _execution_manifest(BUSIN_35_WT))):
                with patch.object(pg, "_active_legacy_run", return_value=(None, None)):
                    result = pg.check_shell_command(cmd, cwd=str(MAIN_WORKSPACE))
        if pg._qa_worktree_gate_enabled():
            self.assertFalse(result["allowed"])
            self.assertIn("ADR-021", result.get("message", ""))

    def test_shell_npm_dev_in_registered_worktree_allowed(self) -> None:
        cmd = "npm run dev"
        manifest = _execution_manifest(BUSIN_35_WT)
        with patch.object(pg, "workspace_target_root", return_value=MAIN_WORKSPACE / "app"):
            with patch.object(pg, "_active_workflow_run", return_value=("test-run", manifest)):
                with patch.object(pg, "_active_legacy_run", return_value=(None, None)):
                    result = pg.check_shell_command(cmd, cwd=str(BUSIN_35_WT))
        self.assertTrue(result["allowed"], result.get("message", ""))

    def test_shell_npm_dev_on_main_app_blocked_with_worktree_gate(self) -> None:
        cmd = "npm run dev"
        with patch.object(pg, "workspace_target_root", return_value=MAIN_WORKSPACE / "app"):
            with patch.object(pg, "_active_workflow_run", return_value=("test-run", _execution_manifest(BUSIN_35_WT))):
                with patch.object(pg, "_active_legacy_run", return_value=(None, None)):
                    result = pg.check_shell_command(cmd, cwd=str(MAIN_WORKSPACE / "app"))
        if pg._qa_worktree_gate_enabled():
            self.assertFalse(result["allowed"])
            self.assertIn("ADR-021", result.get("message", ""))


if __name__ == "__main__":
    unittest.main()
