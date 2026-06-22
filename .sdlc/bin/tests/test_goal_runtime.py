#!/usr/bin/env python3
"""Goal runtime guard unit tests (ADR-022)."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
# Canonical main workspace path (tests must not use /worktrees/ paths for deny gates).
MAIN_WORKSPACE = Path("/home/administrator/workspaces/jambu/ai-native-sdlc")
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

import sdlc_goal_runtime as gr  # noqa: E402

TEST_CONV = "test-conversation-id"
OTHER_CONV = "other-conversation-id"


class GoalRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        gr._clear_goal_session()

    def tearDown(self) -> None:
        gr._clear_goal_session()

    def _seed_owned_session(self, run_id: str = "test-run-20260604", **extra: object) -> None:
        state = {
            "goal_active": True,
            "runner_engaged": True,
            "run_id": run_id,
            "conversation_id": TEST_CONV,
            **extra,
        }
        gr._save_state(state, TEST_CONV)

    def test_non_goal_prompt_passes(self) -> None:
        r = gr.evaluate_prompt_submit("fix typo in readme", TEST_CONV)
        self.assertTrue(r.continue_submit)

    def test_non_goal_prompt_clears_goal_active_for_owner_only(self) -> None:
        self._seed_owned_session("goal-parent-20260608")
        gr.evaluate_prompt_submit("what is the architecture?", TEST_CONV)
        state = gr._load_state(TEST_CONV)
        self.assertFalse(state.get("goal_active"))
        self.assertFalse(state.get("runner_engaged"))

    def test_non_goal_prompt_does_not_clear_other_session(self) -> None:
        self._seed_owned_session("goal-parent-20260608")
        gr.evaluate_prompt_submit("what is the architecture?", OTHER_CONV)
        owner_state = gr._load_state(TEST_CONV)
        self.assertTrue(owner_state.get("goal_active"))
        self.assertTrue(owner_state.get("runner_engaged"))

    def test_pasted_goal_mention_does_not_propagate(self) -> None:
        pasted = (
            "olha o que aconteceu no outro projeto\n"
            "```text\n/sdlc:goal Portar modulos do gateway\n```\n"
            "ou seja, o harness foi ignorado."
        )
        self._seed_owned_session("test-exit42-20260604")
        with patch.object(gr, "_run_cmd") as run_cmd:
            r = gr.evaluate_prompt_submit(pasted, TEST_CONV)
        run_cmd.assert_not_called()
        self.assertTrue(r.continue_submit)
        state = gr._load_state(TEST_CONV)
        self.assertFalse(state.get("goal_active"))
        self.assertFalse(state.get("runner_engaged"))
        self.assertNotIn("run_id", state)

    def test_stop_skips_without_runner_engaged(self) -> None:
        gr._save_state(
            {
                "goal_active": True,
                "run_id": "goal-parent-20260608",
                "conversation_id": TEST_CONV,
            },
            TEST_CONV,
        )
        with patch.object(gr, "_manifest_status", return_value={"status": "in_progress"}):
            with patch.object(gr, "_session_owns_run", return_value=True):
                r = gr.evaluate_stop("completed", 0, TEST_CONV)
        self.assertIsNone(r.followup_message)
        state = gr._load_state(TEST_CONV)
        self.assertFalse(state.get("goal_active"))

    def test_stop_skips_foreign_session(self) -> None:
        self._seed_owned_session("goal-parent-20260608")
        with patch.object(gr, "_manifest_status", return_value={"status": "in_progress"}):
            r = gr.evaluate_stop("completed", 0, OTHER_CONV)
        self.assertIsNone(r.followup_message)
        owner_state = gr._load_state(TEST_CONV)
        self.assertTrue(owner_state.get("goal_active"))

    def test_stop_skips_completed_child_prescriptive_command(self) -> None:
        completed_child = (
            "python3 .sdlc/bin/sdlc_workflow_run.py step "
            "--run-id goal-parent-ff-proj-1 --mode agent"
        )
        parent_step = (
            "python3 .sdlc/bin/sdlc_workflow_run.py step "
            "--run-id goal-parent-20260608 --mode agent"
        )
        self._seed_owned_session("goal-parent-20260608")
        manifest = {
            "status": "in_progress",
            "continuity": {
                "required_actions": [
                    {"id": "child-done", "type": "command", "command": completed_child},
                    {"id": "parent-step", "type": "command", "command": parent_step},
                ],
            },
        }

        def fake_child_status(command: str) -> str | None:
            if "ff-proj-1" in command:
                return "goal-parent-ff-proj-1"
            return None

        with patch.object(gr, "_manifest_status", return_value=manifest):
            with patch.object(gr, "_child_run_id_from_step_command", side_effect=fake_child_status):
                with patch.object(gr, "_session_owns_run", return_value=True):
                    r = gr.evaluate_stop("completed", 0, TEST_CONV)
        self.assertIsNotNone(r.followup_message)
        assert r.followup_message is not None
        self.assertIn("goal-parent-20260608", r.followup_message)
        self.assertNotIn("ff-proj-1", r.followup_message)

    def test_pre_tool_denies_app_write_when_goal_active(self) -> None:
        self._seed_owned_session("test-run-20260604")
        main_app = MAIN_WORKSPACE / "app"
        with patch.object(gr, "workspace_target_root", return_value=main_app):
            with patch.object(gr, "_session_owns_run", return_value=True):
                r = gr.evaluate_pre_tool_use(
                    "Write",
                    {"path": str(main_app / "src" / "x.ts")},
                    TEST_CONV,
                )
        self.assertIsNotNone(r)
        assert r is not None
        self.assertEqual(r.permission, "deny")
        self.assertIn("GOAL_RUNNER_AUTHORITY", r.agent_message)

    def test_pre_tool_allows_foreign_session(self) -> None:
        self._seed_owned_session("test-run-20260604")
        main_app = MAIN_WORKSPACE / "app"
        with patch.object(gr, "workspace_target_root", return_value=main_app):
            r = gr.evaluate_pre_tool_use(
                "Write",
                {"path": str(main_app / "src" / "x.ts")},
                OTHER_CONV,
            )
        self.assertIsNone(r)

    def test_stop_followup_emits_runner_command(self) -> None:
        self._seed_owned_session("test-run-20260604")
        with patch.object(gr, "_manifest_status", return_value={"status": "in_progress"}):
            with patch.object(gr, "_session_owns_run", return_value=True):
                r = gr.evaluate_stop("completed", 0, TEST_CONV)
        self.assertIsNotNone(r.followup_message)
        assert r.followup_message is not None
        self.assertIn("sdlc_workflow_run.py step", r.followup_message)

    def test_stop_followup_prefers_required_actions(self) -> None:
        child_cmd = (
            "python3 .sdlc/bin/sdlc_workflow_run.py step "
            "--run-id goal-parent-ff-proj-1 --mode agent"
        )
        self._seed_owned_session("goal-parent-20260608")
        manifest = {
            "status": "in_progress",
            "continuity": {
                "required_actions": [
                    {
                        "id": "child-step",
                        "type": "command",
                        "command": child_cmd,
                    },
                ],
            },
        }
        with patch.object(gr, "_manifest_status", return_value=manifest):
            with patch.object(gr, "_session_owns_run", return_value=True):
                r = gr.evaluate_stop("completed", 0, TEST_CONV)
        self.assertIsNotNone(r.followup_message)
        assert r.followup_message is not None
        self.assertIn("SDLC_GOAL_DELEGATE", r.followup_message)
        self.assertIn("ff-proj-1", r.followup_message)
        self.assertNotIn("step --run-id goal-parent-20260608", r.followup_message)

    def test_goal_init_exit_42_is_success_not_blocked(self) -> None:
        dispatch = {
            "action": "AGENT_DISPATCH",
            "run_id": "goal-exit42-20260604",
            "node_id": "hydrate",
            "objective": "Load INDEX",
            "submit_command": "python3 .sdlc/bin/sdlc_workflow_run.py submit --run-id goal-exit42-20260604 --node hydrate --cognitive x.json",
        }
        stdout = (
            "INIT run_id=goal-exit42-20260604 workflow=goal-flow nodes=16\n"
            "NODE_START hydrate\n"
            + json.dumps(dispatch)
        )
        empty_runs = REPO_ROOT / ".sdlc" / "workflow-runs-empty-test"
        empty_runs.mkdir(exist_ok=True)
        with patch.object(gr, "_run_cmd", return_value=(42, stdout, stdout)):
            with patch.object(gr, "_bind_orchestrator_session", return_value=(True, None)):
                with patch.object(gr, "WORKFLOW_RUNS_DIR", empty_runs):
                    with patch.object(gr, "ACTIVE_WORKFLOW_RUN_POINTER") as ptr:
                        ptr.is_file.return_value = False
                        r = gr.evaluate_prompt_submit("/sdlc:goal test exit 42 handling", TEST_CONV)
        self.assertTrue(r.continue_submit)
        self.assertIn("SDLC_GOAL_STARTED", r.agent_note)
        self.assertIn("AGENT_DISPATCH", r.agent_note)
        state = gr._load_state(TEST_CONV)
        self.assertEqual(state.get("run_id"), "goal-exit42-20260604")
        self.assertEqual(state.get("last_dispatch", {}).get("node_id"), "hydrate")
        self.assertFalse(state.get("dispatch_required"))
        self.assertTrue(state.get("runner_engaged"))

    def test_decision_yes_no_gate(self) -> None:
        gr._save_state(
            {
                "awaiting_decision": {
                    "question": "merge?",
                    "on_yes": "echo yes",
                    "on_no": "echo no",
                },
                "conversation_id": TEST_CONV,
            },
            TEST_CONV,
        )
        r = gr.evaluate_prompt_submit("/yes", TEST_CONV)
        self.assertTrue(r.continue_submit)
        state = gr._load_state(TEST_CONV)
        self.assertEqual(state.get("pending_shell"), "echo yes")

    def test_before_shell_blocks_parent_step_after_delegate(self) -> None:
        parent = "goal-parent-20260608"
        child_cmd = f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {parent}-ff-proj-1 --mode agent"
        parent_cmd = f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {parent} --mode agent"
        gr._save_state(
            {
                "goal_active": True,
                "run_id": parent,
                "conversation_id": TEST_CONV,
                "delegate_emitted_at": "2026-06-08T19:00:00Z",
                "last_prescribed_command": child_cmd,
            },
            TEST_CONV,
        )
        with patch.object(gr, "_session_owns_run", return_value=True):
            r = gr.evaluate_before_shell(parent_cmd, TEST_CONV)
        self.assertIsNotNone(r)
        assert r is not None
        self.assertEqual(r.permission, "deny")
        self.assertIn("PARENT_STEP_VIOLATION", r.agent_message)
        state = gr._load_state(TEST_CONV)
        self.assertEqual(state.get("parent_step_violations"), 1)

    def test_resolve_conversation_id_from_session_start_env(self) -> None:
        event = {"generation_id": "gen-1", "hook_event_name": "stop"}
        with patch.dict("os.environ", {gr.SDLC_CONVERSATION_ENV: TEST_CONV}, clear=False):
            self.assertEqual(gr.resolve_conversation_id(event), TEST_CONV)

    def test_resolve_conversation_id_from_generation_cache(self) -> None:
        gr.register_hook_event(
            {
                "conversation_id": TEST_CONV,
                "generation_id": "gen-cache",
                "hook_event_name": "beforeSubmitPrompt",
            },
        )
        cached = gr.resolve_conversation_id({"generation_id": "gen-cache", "hook_event_name": "stop"})
        self.assertEqual(cached, TEST_CONV)

    def test_evaluate_session_start_sets_env(self) -> None:
        result = gr.evaluate_session_start({"session_id": TEST_CONV, "hook_event_name": "sessionStart"})
        self.assertEqual(result.get("env", {}).get(gr.SDLC_CONVERSATION_ENV), TEST_CONV)

    def test_ecosystem_nl_redirect(self) -> None:
        r = gr.evaluate_prompt_submit("criar projeto tce-whatsapp no ecossistema", TEST_CONV)
        self.assertTrue(r.continue_submit)
        self.assertIn("SDLC_ECOSYSTEM_REDIRECT", r.agent_note)
        self.assertIn("/sdlc:ecosystem", r.agent_note)

    def test_ecosystem_explicit_command_not_redirected(self) -> None:
        r = gr.evaluate_prompt_submit("/sdlc:ecosystem criar sibling repo demo", TEST_CONV)
        self.assertTrue(r.continue_submit)
        self.assertNotIn("SDLC_ECOSYSTEM_REDIRECT", r.agent_note)

    def test_ecosystem_enforce_blocks_submit(self) -> None:
        with patch.dict("os.environ", {"SDL_ECOSYSTEM_ENFORCE": "true"}, clear=False):
            r = gr.evaluate_prompt_submit("novo repo sibling demo-harness", TEST_CONV)
        self.assertFalse(r.continue_submit)
        self.assertIn("SDLC_ECOSYSTEM_REQUIRED", r.user_message)
        self.assertIn("/sdlc:ecosystem", r.user_message)

    def test_ecosystem_english_pattern_redirect(self) -> None:
        r = gr.evaluate_prompt_submit("create project my-service in the jambu ecosystem", TEST_CONV)
        self.assertTrue(r.continue_submit)
        self.assertIn("SDLC_ECOSYSTEM_REDIRECT", r.agent_note)


if __name__ == "__main__":
    unittest.main()
