#!/usr/bin/env python3
"""Subprocess invoke cognitive reuse guards."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_invoke import invoke_function  # noqa: E402
from sdlc_ref_resolver import RunContext  # noqa: E402


class InvokeStaleCognitiveTests(unittest.TestCase):
    def test_subprocess_pass_ignores_stale_fail_cognitive(self) -> None:
        output_dir = REPO_ROOT / ".sdlc" / "workflow-runs" / "output" / "invoke-test-stale"
        cognitive_dir = output_dir / "cognitive"
        cognitive_dir.mkdir(parents=True, exist_ok=True)
        stale = {
            "nodeId": "validate-local",
            "structured": {"gateOutcome": "FAIL", "detail": "prior retry"},
        }
        (cognitive_dir / "validate-local.json").write_text(json.dumps(stale), encoding="utf-8")

        ctx = RunContext(
            run_id="invoke-test-stale",
            intent="test",
            manifest={},
            node_id="validate-local",
            execution_mode="agent",
            prior_outputs={},
            output_dir=output_dir,
        )
        invoke = {"type": "subprocess", "ref": "validate-local", "command": "echo", "args": ["ok"]}

        with patch("sdlc_invoke.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="ok", stderr="")
            result = invoke_function(invoke, ctx, "agent")

        structured = result.get("structured") if isinstance(result.get("structured"), dict) else {}
        self.assertEqual(str(structured.get("gateOutcome") or ""), "PASS")

    def test_subprocess_pass_reuses_non_fail_cognitive(self) -> None:
        output_dir = REPO_ROOT / ".sdlc" / "workflow-runs" / "output" / "invoke-test-pass"
        cognitive_dir = output_dir / "cognitive"
        cognitive_dir.mkdir(parents=True, exist_ok=True)
        good = {
            "nodeId": "validate-local",
            "structured": {"gateOutcome": "PASS", "detail": "fresh"},
        }
        (cognitive_dir / "validate-local.json").write_text(json.dumps(good), encoding="utf-8")

        ctx = RunContext(
            run_id="invoke-test-pass",
            intent="test",
            manifest={},
            node_id="validate-local",
            execution_mode="agent",
            prior_outputs={},
            output_dir=output_dir,
        )
        invoke = {"type": "subprocess", "ref": "validate-local", "command": "echo", "args": ["ok"]}

        with patch("sdlc_invoke.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="ok", stderr="")
            result = invoke_function(invoke, ctx, "agent")

        structured = result.get("structured") if isinstance(result.get("structured"), dict) else {}
        self.assertEqual(structured.get("detail"), "fresh")


if __name__ == "__main__":
    unittest.main()
