#!/usr/bin/env python3
"""Create Plane epic + child ticket for E2E plane-hierarchy stage."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BIN_DIR = Path(__file__).resolve().parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from plane_ticket_state import _plane_connection, _plane_states, plane_api  # noqa: E402


def _issue_url(issue_uuid: str) -> str:
    config_conn = _plane_connection()
    project_id = config_conn.get("project_id", "")
    workspace = config_conn.get("workspace", "jambuai")
    return (
        f"https://app.plane.so/{workspace}/projects/{project_id}/issues/{issue_uuid}/"
    )


def create_issue(name: str, description_html: str, *, parent_uuid: str | None = None) -> dict:
    states = _plane_states()
    payload: dict = {
        "name": name,
        "description_html": description_html,
        "priority": "high",
        "state": states["todo"],
    }
    if parent_uuid:
        payload["parent"] = parent_uuid
    return plane_api("POST", "/issues/", payload)


EPIC_HTML = """
<h2>Objective</h2>
<p>Deliver LLM Playground as a greenfield Astro SSR application at repository root <code>app/</code>, orchestrated under E2E run <code>llm-playground-20260525</code>.</p>
<h2>Background</h2>
<p>Post-reset baseline targets <code>examples/astro-blog</code>. This epic introduces a new demo surface: three-column LLM playground with functional Run flow. Prior ADR-009 bypass attempt reconciled; execution proceeds via registered child tickets only.</p>
<h2>Acceptance Criteria</h2>
<ul>
<li><strong>AC-1:</strong> All child vertical-slice tickets merged with QA PASS and evidence uploaded.</li>
<li><strong>AC-2:</strong> <code>workspace.target_root</code> updated to <code>app</code> after integration.</li>
</ul>
<p><strong>Explicitly out of scope:</strong> Placeholder menu destinations, multi-provider abstraction.</p>
<h2>References</h2>
<ul><li>Spec: .sdlc/specs/draft-llm-playground-functional.md</li><li>Run: llm-playground-20260525</li></ul>
"""

CHILD_HTML = """
<h2>Objective</h2>
<p>Scaffold Astro SSR at <code>app/</code> and implement the functional LLM playground UI: three-column layout, POST <code>/api/chat</code>, response panel with copy/latency/tokens.</p>
<h2>Background</h2>
<p>Single vertical slice for wave-1. Orphan worktree at <code>worktrees/JAMBU-LLM-1-playground</code> may be absorbed after formal registration.</p>
<h2>Acceptance Criteria</h2>
<ul>
<li><strong>AC-1:</strong> Given dev server at localhost:4321, when user opens <code>/</code>, then Playground nav active and three-column layout renders at 1280px.</li>
<li><strong>AC-2:</strong> Given prompts filled, when user clicks Run, then response area shows non-empty text within 30s.</li>
<li><strong>AC-3:</strong> Given completed run, when user clicks Copy, then clipboard contains response text.</li>
<li><strong>AC-4:</strong> Given temperature changed, when user clicks Run, then request includes updated temperature.</li>
</ul>
<p><strong>Explicitly out of scope:</strong> History persistence, placeholder route implementations.</p>
<h2>Technical Notes</h2>
<h3>Layer 1 — Implementation plan</h3>
<ul>
<li><strong>Entry point:</strong> app/src/pages/index.astro</li>
<li><strong>API:</strong> app/src/pages/api/chat.ts — OpenAI proxy or mock</li>
<li><strong>E2E:</strong> app/e2e/playground.spec.ts</li>
<li><strong>Observability:</strong> PostHog playground_run event</li>
</ul>
<h2>QA Requirements</h2>
<ul><li>E2E: app/e2e/playground.spec.ts</li><li>Evidence: .sdlc/evidence/JAMBU-N/</li></ul>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Create Plane epic + child for llm-playground")
    parser.add_argument("--epic-title", default="LLM Playground — Astro SSR app at app/")
    parser.add_argument(
        "--child-title",
        default="Implement functional LLM playground with /api/chat",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON for scripting")
    args = parser.parse_args()

    try:
        epic = create_issue(args.epic_title, EPIC_HTML)
        epic_uuid = epic["id"]
        epic_seq = epic.get("sequence_id")
        epic_ticket = f"JAMBU-{epic_seq}" if epic_seq else "JAMBU-EPIC"

        child = create_issue(args.child_title, CHILD_HTML, parent_uuid=epic_uuid)
        child_uuid = child["id"]
        child_seq = child.get("sequence_id")
        child_ticket = f"JAMBU-{child_seq}" if child_seq else "JAMBU-CHILD"

        result = {
            "epic": {
                "ticket_id": epic_ticket,
                "uuid": epic_uuid,
                "plane_url": _issue_url(epic_uuid),
            },
            "child": {
                "ticket_id": child_ticket,
                "uuid": child_uuid,
                "plane_url": _issue_url(child_uuid),
                "parent": epic_ticket,
            },
        }
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"Epic:  {epic_ticket}  {result['epic']['plane_url']}")
            print(f"Child: {child_ticket}  {result['child']['plane_url']}")
        return 0
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
