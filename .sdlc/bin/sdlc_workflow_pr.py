#!/usr/bin/env python3
"""
Workflow PR bridge — create GitHub PRs from registered worktrees and record pr_url on manifest.

Usage:
  python3 .sdlc/bin/sdlc_workflow_pr.py create --run-id <goal-run-id>
  python3 .sdlc/bin/sdlc_workflow_pr.py register --run-id <id> --ticket JAMBU-N --pr-url <url>
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from _sdlc_paths import REPO_ROOT

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdlc_workflow_gate import (  # noqa: E402
    _slice_tickets,
    _worktree_commit_state,
    check_pr_registered,
)
from sdlc_ref_resolver import RunContext  # noqa: E402
from sdlc_workflow_manifest import load_manifest, save_manifest  # noqa: E402

_GH_PR_RE = re.compile(r"^https://github\.com/[^/]+/[^/]+/pull/\d+/?$")


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _output_dir(manifest: dict[str, Any]) -> Path:
    rel = (manifest.get("paths") or {}).get("output_dir", "")
    return (REPO_ROOT / rel).resolve()


def _cognitive_path(manifest: dict[str, Any], node_id: str) -> Path:
    return _output_dir(manifest) / "cognitive" / f"{node_id}.json"


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def _git_push_branch(wt_path: Path, branch: str) -> tuple[bool, str]:
    proc = subprocess.run(
        ["git", "-C", str(wt_path), "push", "-u", "origin", branch],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        combined = (proc.stderr or "") + (proc.stdout or "")
        if "Everything up-to-date" in combined or "up to date" in combined.lower():
            return True, "branch already on remote"
        return False, combined.strip() or "git push failed"
    return True, "pushed to origin"


def _gh_pr_create(wt_path: Path, branch: str, title: str, body: str) -> tuple[bool, str]:
    proc = subprocess.run(
        [
            "gh",
            "pr",
            "create",
            "--base",
            "main",
            "--head",
            branch,
            "--title",
            title,
            "--body",
            body,
        ],
        cwd=str(wt_path),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        combined = (proc.stderr or "") + (proc.stdout or "")
        if "already exists" in combined.lower():
            view = subprocess.run(
                ["gh", "pr", "view", branch, "--json", "url", "-q", ".url"],
                cwd=str(wt_path),
                capture_output=True,
                text=True,
            )
            if view.returncode == 0 and view.stdout.strip():
                return True, view.stdout.strip()
        return False, combined.strip() or "gh pr create failed"
    url = (proc.stdout or "").strip().splitlines()[-1].strip()
    if not _GH_PR_RE.match(url):
        return False, f"gh returned unexpected URL: {url!r}"
    return True, url


def _register_pr_on_ticket(
    run_id: str,
    manifest: dict[str, Any],
    ticket_id: str,
    pr_url: str,
) -> None:
    if not _GH_PR_RE.match(pr_url):
        raise SystemExit(f"ERROR: invalid GitHub PR URL: {pr_url!r}")
    tickets = manifest.setdefault("tickets", {})
    if ticket_id not in tickets:
        raise SystemExit(f"ERROR: unknown ticket {ticket_id!r} on run {run_id}")
    ticket = tickets[ticket_id]
    ticket["pr_url"] = pr_url
    harness = ticket.setdefault("harness", {})
    if isinstance(harness, dict):
        harness["pr_url"] = pr_url
    save_manifest(run_id, manifest)


def cmd_register(run_id: str, ticket_id: str, pr_url: str) -> int:
    manifest = load_manifest(run_id)
    _register_pr_on_ticket(run_id, manifest, ticket_id, pr_url)
    print(f"REGISTERED pr_url={pr_url} ticket={ticket_id} run={run_id}")
    return 0


def cmd_create(run_id: str, ticket_filter: str | None) -> int:
    manifest = load_manifest(run_id)
    run_mode = manifest.get("run_mode") or "feature"
    if run_mode == "content":
        print("PR_CREATE SKIP content mode")
        return 0

    slices = _slice_tickets(manifest)
    if ticket_filter:
        slices = [(tid, t) for tid, t in slices if tid == ticket_filter]
    if not slices:
        print("ERROR: no slice tickets on manifest — register-ticket first", file=sys.stderr)
        return 1

    created: list[dict[str, str]] = []
    for ticket_id, ticket in slices:
        existing = ticket.get("pr_url")
        if isinstance(existing, str) and _GH_PR_RE.match(existing.strip()):
            created.append({"ticket": ticket_id, "pr_url": existing.strip(), "action": "existing"})
            continue

        wt_raw = ticket.get("worktree")
        branch = ticket.get("branch")
        if not isinstance(wt_raw, str) or not wt_raw.strip():
            print(f"ERROR: {ticket_id} missing worktree", file=sys.stderr)
            return 1
        if not isinstance(branch, str) or not branch.strip():
            print(f"ERROR: {ticket_id} missing branch", file=sys.stderr)
            return 1

        wt_path = Path(wt_raw.strip()).resolve()
        ok, reason = _worktree_commit_state(wt_path)
        if not ok:
            print(f"ERROR: {ticket_id} {reason}", file=sys.stderr)
            return 1

        pushed, push_msg = _git_push_branch(wt_path, branch.strip())
        if not pushed:
            print(f"ERROR: {ticket_id} push failed: {push_msg}", file=sys.stderr)
            return 1

        title = f"feat({ticket_id}): {manifest.get('intent', 'vertical slice')[:72]}"
        body = (
            f"## Summary\n\n"
            f"Vertical slice `{ticket_id}` from goal run `{run_id}`.\n\n"
            f"## Harness\n\n"
            f"- Worktree: `{wt_path}`\n"
            f"- Branch: `{branch}`\n"
            f"- Created by: `sdlc_workflow_pr.py create`\n"
        )
        pr_ok, pr_url = _gh_pr_create(wt_path, branch.strip(), title, body)
        if not pr_ok:
            print(f"ERROR: {ticket_id} PR create failed: {pr_url}", file=sys.stderr)
            return 1

        manifest = load_manifest(run_id)
        _register_pr_on_ticket(run_id, manifest, ticket_id, pr_url)
        manifest = load_manifest(run_id)
        created.append({"ticket": ticket_id, "pr_url": pr_url, "action": "created"})
        print(f"PR_CREATED {ticket_id} {pr_url}")

    manifest = load_manifest(run_id)
    ctx = RunContext(
        run_id=run_id,
        intent=manifest.get("intent", ""),
        manifest=manifest,
        node_id="pr-creation",
        execution_mode="agent",
    )
    gate = check_pr_registered(ctx)
    if not gate.passed:
        print(f"ERROR: {gate.message}", file=sys.stderr)
        return 1

    cognitive = {
        "nodeId": "pr-creation",
        "runId": run_id,
        "recordedAt": _utc_now(),
        "outcome": "success",
        "confidence": 0.95,
        "summary": f"Registered {len(created)} PR(s) on workflow manifest.",
        "structured": {
            "pr_urls": created,
            "gateId": gate.gate_id,
            "gateOutcome": gate.outcome,
        },
        "artifacts": [
            {"name": "pr-creation.json", "uri": "cognitive/pr-creation.json", "kind": "manifest"},
        ],
        "gateInput": {},
    }
    _write_json(_cognitive_path(manifest, "pr-creation"), cognitive)
    print(json.dumps({"pr_urls": created}, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or register PRs for goal workflow tickets")
    sub = parser.add_subparsers(dest="cmd", required=True)

    create_p = sub.add_parser("create", help="Push branch and gh pr create per slice ticket")
    create_p.add_argument("--run-id", required=True)
    create_p.add_argument("--ticket", help="Limit to one ticket id")

    reg_p = sub.add_parser("register", help="Record existing PR URL on manifest ticket")
    reg_p.add_argument("--run-id", required=True)
    reg_p.add_argument("--ticket", required=True)
    reg_p.add_argument("--pr-url", required=True)

    args = parser.parse_args()
    if args.cmd == "create":
        return cmd_create(args.run_id, getattr(args, "ticket", None))
    if args.cmd == "register":
        return cmd_register(args.run_id, args.ticket, args.pr_url)
    return 1


if __name__ == "__main__":
    sys.exit(main())
