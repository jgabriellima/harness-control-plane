#!/usr/bin/env python3
"""Unit tests for validate-local harness fixes (ADR-029 ticket-scoped checks)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_delivery import (  # noqa: E402
    _python_executable,
    local_evidence_commands,
    merge_delivery_evidence_if_allowed,
    ticket_has_validation_checks,
)
from sdlc_profile import QA_SURFACE_HEADLESS, local_validation_checks  # noqa: E402


class ValidateLocalHarnessTests(unittest.TestCase):
    def test_ticket_has_validation_checks(self) -> None:
        self.assertFalse(ticket_has_validation_checks(None))
        self.assertFalse(ticket_has_validation_checks({"validation_checks": []}))
        self.assertTrue(
            ticket_has_validation_checks(
                {"validation_checks": [{"name": "pytest", "cmd": ["python3", "-m", "pytest"]}]},
            ),
        )

    def test_validate_local_ticket_checks_authoritative(self) -> None:
        """Ticket validation_checks must not merge delivery lint/typecheck (ADR-029)."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ticket = {
                "qa_surface": "headless",
                "validation_checks": [
                    {"name": "pytest", "cmd": ["/venv/bin/python", "-m", "pytest", "-q", "tests/"]},
                ],
            }
            sdlc = {
                "delivery": {
                    "surfaces": {
                        "local": {
                            "enabled": True,
                            "evidence": ["lint", "typecheck", "pytest"],
                        },
                    },
                },
            }
            checks = local_validation_checks(root, sdlc, ticket=ticket)
            self.assertEqual([name for name, _ in checks], ["pytest"])

            merged = merge_delivery_evidence_if_allowed(
                checks,
                ticket,
                root,
                sdlc,
                qa_surface=QA_SURFACE_HEADLESS,
            )
            self.assertEqual([name for name, _ in merged], ["pytest"])
            self.assertNotIn("lint", {name for name, _ in merged})
            self.assertNotIn("typecheck", {name for name, _ in merged})

    def test_validate_local_merges_delivery_when_ticket_has_no_checks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sdlc = {
                "delivery": {
                    "surfaces": {
                        "local": {
                            "enabled": True,
                            "evidence": ["build", "typecheck"],
                        },
                    },
                },
            }
            checks = local_validation_checks(root, sdlc, ticket={"qa_surface": "browser"})
            merged = merge_delivery_evidence_if_allowed(
                checks,
                {"qa_surface": "browser"},
                root,
                sdlc,
                qa_surface="browser",
            )
            names = {name for name, _ in merged}
            self.assertIn("build", names)
            self.assertIn("typecheck", names)

    def test_python_executable_falls_back_to_repo_venv(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            worktree = repo / "wt"
            worktree.mkdir()
            venv_bin = repo / ".venv" / "bin"
            venv_bin.mkdir(parents=True)
            venv_py = venv_bin / "python"
            venv_py.write_text("#!/bin/sh\n", encoding="utf-8")

            with patch("sdlc_delivery.REPO_ROOT", repo):
                resolved = _python_executable(worktree)
                self.assertEqual(resolved, str(venv_py))

                cmd = local_evidence_commands(worktree, {"delivery": {"surfaces": {"local": {"evidence": ["lint"]}}}})
                self.assertTrue(cmd)
                self.assertEqual(cmd[0][1][0], str(venv_py))


if __name__ == "__main__":
    unittest.main()
