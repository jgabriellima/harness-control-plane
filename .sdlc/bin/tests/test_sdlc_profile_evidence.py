#!/usr/bin/env python3
"""Unit tests for ADR-029 ticket-scoped QA evidence mode."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_profile import (  # noqa: E402
    QA_SURFACE_BROWSER,
    QA_SURFACE_HEADLESS,
    active_ticket_from_manifest,
    gate_deferred_for_surface,
    gate_required_surface,
    local_validation_checks,
    resolve_qa_surface,
    resolve_qa_surface_from_ticket,
    validate_ticket_qa_contract,
)
from sdlc_ref_resolver import RunContext  # noqa: E402
from sdlc_workflow_gate import (  # noqa: E402
    check_library_evidence,
    check_ticket_qa_contract,
    check_visual_evidence,
    run_gate_adapter,
)


class ProfileEvidenceTests(unittest.TestCase):
    def test_missing_qa_surface_fails(self) -> None:
        surface, err = resolve_qa_surface_from_ticket({"id": "PROJ-9"})
        self.assertIsNone(surface)
        self.assertIn("qa_surface missing", err or "")

    def test_ticket_browser_surface(self) -> None:
        surface, err = resolve_qa_surface_from_ticket(
            {"id": "UI-1", "qa_surface": "browser"},
            ticket_id="UI-1",
        )
        self.assertEqual(surface, QA_SURFACE_BROWSER)
        self.assertIsNone(err)

    def test_ticket_headless_surface(self) -> None:
        manifest = {
            "tickets": {
                "API-1": {
                    "qa_surface": "headless",
                    "validation_checks": [
                        {"name": "pytest", "cmd": ["python3", "-m", "pytest", "-q"]},
                    ],
                },
            },
        }
        self.assertEqual(resolve_qa_surface(manifest=manifest), QA_SURFACE_HEADLESS)

    def test_monorepo_different_tickets(self) -> None:
        ui_manifest = {"tickets": {"UI-1": {"qa_surface": "browser"}}}
        api_manifest = {"tickets": {"API-1": {"qa_surface": "headless"}}}
        self.assertEqual(resolve_qa_surface(manifest=ui_manifest), QA_SURFACE_BROWSER)
        self.assertEqual(resolve_qa_surface(manifest=api_manifest), QA_SURFACE_HEADLESS)

    def test_active_ticket_from_manifest_single(self) -> None:
        manifest = {"tickets": {"PROJ-1": {"qa_surface": "headless"}}}
        found = active_ticket_from_manifest(manifest)
        self.assertIsNotNone(found)
        ticket_id, _ticket = found or ("", {})
        self.assertEqual(ticket_id, "PROJ-1")

    def test_manifest_gate_mapping(self) -> None:
        self.assertEqual(gate_required_surface("visual-evidence"), QA_SURFACE_BROWSER)
        self.assertEqual(gate_required_surface("library-evidence"), QA_SURFACE_HEADLESS)
        self.assertTrue(gate_deferred_for_surface("visual-evidence", QA_SURFACE_HEADLESS))

    def test_headless_validation_checks_from_ticket(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ticket = {
                "qa_surface": "headless",
                "validation_checks": [
                    {"name": "pytest", "cmd": ["python3", "-m", "pytest", "-q"]},
                ],
            }
            checks = local_validation_checks(root, ticket=ticket)
            self.assertEqual([name for name, _ in checks], ["pytest"])

    def test_visual_evidence_deferred_for_headless_ticket(self) -> None:
        import sdlc_workflow_gate as gate_module

        ctx = RunContext(
            run_id="api-run",
            intent="",
            manifest={"tickets": {"API-1": {"qa_surface": "headless"}}},
            node_id="qa",
            execution_mode="agent",
        )
        result = run_gate_adapter("visual-evidence", "visual-evidence.pass", {}, ctx)
        self.assertEqual(result.outcome, "PASS")
        self.assertIn("N/A", result.message)

    def test_visual_evidence_fails_without_ticket(self) -> None:
        ctx = RunContext(
            run_id="orphan-run",
            intent="",
            manifest={"tickets": {}},
            node_id="qa",
            execution_mode="agent",
        )
        result = run_gate_adapter("visual-evidence", "visual-evidence.pass", {}, ctx)
        self.assertEqual(result.outcome, "FAIL")
        self.assertIn("no ticket", result.message)

    def test_library_evidence_passes_from_manifest_pytest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            evidence = Path(tmp)
            (evidence / "manifest.md").write_text(
                "# QA Evidence\n\npytest: 8 passed, 0 failed\n",
                encoding="utf-8",
            )
            result = check_library_evidence(evidence)
            self.assertEqual(result.outcome, "PASS")

    def test_visual_evidence_still_requires_pngs_for_browser(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            evidence = Path(tmp)
            (evidence / "manifest.md").write_text("# QA\n", encoding="utf-8")
            result = check_visual_evidence(evidence)
            self.assertEqual(result.outcome, "FAIL")
            self.assertIn("viewport PNG", result.message)

    def test_validate_ticket_qa_contract_browser_ok(self) -> None:
        errors = validate_ticket_qa_contract({"qa_surface": "browser"}, "UI-1")
        self.assertEqual(errors, [])

    def test_validate_ticket_qa_contract_missing_surface(self) -> None:
        errors = validate_ticket_qa_contract({"id": "X-1"}, "X-1")
        self.assertTrue(errors)
        self.assertIn("qa_surface missing", errors[0])

    def test_validate_ticket_qa_contract_headless_requires_checks(self) -> None:
        errors = validate_ticket_qa_contract({"qa_surface": "headless"}, "API-1")
        self.assertTrue(errors)
        self.assertIn("validation_checks", errors[0])

    def test_validate_ticket_qa_contract_headless_ok(self) -> None:
        ticket = {
            "qa_surface": "headless",
            "validation_checks": [{"name": "pytest", "cmd": ["python3", "-m", "pytest", "-q"]}],
        }
        self.assertEqual(validate_ticket_qa_contract(ticket, "API-1"), [])

    def test_ticket_qa_contract_gate_reads_manifest_ticket(self) -> None:
        ctx = RunContext(
            run_id="spec-run",
            intent="",
            manifest={
                "tickets": {
                    "PROJ-9": {
                        "qa_surface": "browser",
                    },
                },
            },
            node_id="work-item-ticket-creation",
            execution_mode="agent",
        )
        result = check_ticket_qa_contract(ctx)
        self.assertEqual(result.outcome, "PASS")
        self.assertIn("PROJ-9", result.message)

    def test_ticket_qa_contract_gate_fails_headless_without_checks(self) -> None:
        ctx = RunContext(
            run_id="spec-run",
            intent="",
            manifest={"tickets": {"API-2": {"qa_surface": "headless"}}},
            node_id="work-item-ticket-creation",
            execution_mode="agent",
        )
        result = run_gate_adapter("ticket-qa-contract", "ticket-qa-contract.pass", {}, ctx)
        self.assertEqual(result.outcome, "FAIL")
        self.assertIn("validation_checks", result.message)


if __name__ == "__main__":
    unittest.main()
