#!/bin/bash
# Session Start Hook — Context Injector
# Location: .cursor/hooks/session-start.sh
# Trigger:  sessionStart event (hooks.json)
# Purpose:  Inject full operational context at the start of every Cursor session.
#           Reads SDLC state, latest handoff, active Plane tickets.
#           Output: additional_context JSON consumed by Cursor runtime.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SDLC="$ROOT/.sdlc"
CURSOR="$ROOT/.cursor"

# ── Collect context fragments ─────────────────────────────────────────────────

CONTEXT=""

# 1. SDLC status from DSL
if [ -f "$SDLC/sdlc.yaml" ]; then
  STATUS=$(grep "^status:" "$SDLC/sdlc.yaml" | head -1 | awk '{print $2}' || true)
  PLANE_WORKSPACE=$(grep "workspace_slug:" "$SDLC/sdlc.yaml" 2>/dev/null | head -1 | awk '{print $2}' || true)
  PLANE_PROJECT=$(grep "project_identifier:" "$SDLC/sdlc.yaml" 2>/dev/null | head -1 | awk '{print $2}' || true)
  CONTEXT="${CONTEXT}## SDLC Status: ${STATUS}\nPlane: ${PLANE_WORKSPACE}/${PLANE_PROJECT} (https://app.plane.so/${PLANE_WORKSPACE}/)\n\n"
fi

# 2. Latest handoff (most important — what was last done)
if [ -f "$SDLC/handoffs/LATEST.md" ]; then
  HANDOFF=$(cat "$SDLC/handoffs/LATEST.md")
  CONTEXT="${CONTEXT}## Last Session Handoff\n${HANDOFF}\n\n"
elif ls "$SDLC/handoffs/"*.md 2>/dev/null | head -1 | grep -q "."; then
  LATEST_FILE=$(ls -t "$SDLC/handoffs/"*.md 2>/dev/null | head -1)
  HANDOFF=$(cat "$LATEST_FILE")
  CONTEXT="${CONTEXT}## Last Session Handoff\n${HANDOFF}\n\n"
else
  CONTEXT="${CONTEXT}## Last Session Handoff\nNo handoffs recorded yet. This may be a new project. Run /sdlc:doctor to check state.\n\n"
fi

# 3. Operational context (sprint + active work)
if [ -f "$CURSOR/memories/operational-context.md" ]; then
  # Extract just the current sprint + active features sections (first 30 lines)
  OP_CONTEXT=$(head -40 "$CURSOR/memories/operational-context.md")
  CONTEXT="${CONTEXT}## Operational Context\n${OP_CONTEXT}\n\n"
fi

# 4. Active incidents (real rows only — skip template/example lines)
if [ -f "$CURSOR/memories/incidents.md" ]; then
  # Match table rows with real dates (YYYY-MM-DD) that are not resolved
  ACTIVE=$(grep -E "^\| [0-9]{4}-[0-9]{2}-[0-9]{2}" "$CURSOR/memories/incidents.md" | \
    grep -vE "RESOLVED|CLOSED" 2>/dev/null || true)
  if [ -n "$ACTIVE" ]; then
    CONTEXT="${CONTEXT}## ⚠ ACTIVE INCIDENTS\n${ACTIVE}\n\n"
  fi
fi

# 5. Active workflow run (ADR-017/020 — workflow-runs control plane)
if [ -f "$SDLC/workflow-runs/ACTIVE" ]; then
  ACTIVE_RUN=$(cat "$SDLC/workflow-runs/ACTIVE" 2>/dev/null || true)
  MANIFEST="$SDLC/workflow-runs/${ACTIVE_RUN}/manifest.yaml"
  if [ -n "$ACTIVE_RUN" ] && [ -f "$MANIFEST" ]; then
    WF_BLOCK=$(python3 - <<'PY' "$ACTIVE_RUN" "$MANIFEST"
import sys, yaml
from pathlib import Path
run_id, mf = sys.argv[1], Path(sys.argv[2])
m = yaml.safe_load(mf.read_text())
meta = m.get("metadata") or {}
cont = m.get("continuity") or {}
lines = [
    f"run_id: {run_id}",
    f"status: {m.get('status', '?')}",
    f"workflow: {meta.get('workflow_id', '?')}",
    f"intent: {(m.get('intent') or '')[:120]}",
    f"continuity.awaiting: {cont.get('awaiting', 'none')}",
    "required_actions:",
]
for a in (cont.get("required_actions") or [])[:6]:
    if isinstance(a, dict):
        lines.append(f"- {a.get('command') or a.get('description') or a.get('id')}")
print("\n".join(lines))
PY
)
    CONTEXT="${CONTEXT}## Active Workflow Run (workflow-runs)\n${WF_BLOCK}\n\n"
  fi
elif [ -f "$SDLC/runs/ACTIVE" ]; then
  ACTIVE_RUN=$(cat "$SDLC/runs/ACTIVE" 2>/dev/null || true)
  CONTEXT="${CONTEXT}## Legacy runs/ACTIVE (deprecated)\nrun_id: ${ACTIVE_RUN}\nMigrate to workflow-runs — use /sdlc:goal + sdlc_workflow_run.py\n\n"
fi

# 6. INDEX reminder (scoped — no playbook catalog)
if [ -f "$SDLC/INDEX.md" ]; then
  CONTEXT="${CONTEXT}## Navigation\nProject INDEX: .sdlc/INDEX.md — hydrate ACTIVE_WORK/SPECS/ADRS only. Playbooks: lazy via .sdlc/bin/sdlc_playbook.py catalog --summary\n"
fi

# 7. Goal runtime guard state (only when runner handshake is active — avoid stale propagation)
if [ -f "$SDLC/workflow-runs/.cursor-runtime.json" ]; then
  RT=$(python3 -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p, encoding="utf-8")); print(json.dumps(d, indent=2)) if d.get("runner_engaged") else sys.exit(1)' "$SDLC/workflow-runs/.cursor-runtime.json" 2>/dev/null || true)
  if [ -n "$RT" ]; then
    CONTEXT="${CONTEXT}## Goal Runtime (hook-enforced)\n${RT}\n\n"
  fi
fi

# 8. Key constraints reminder
CONTEXT="${CONTEXT}## Operational Constraints\n- /sdlc:goal: HARD WORKFLOW — hooks in .cursor/hooks/sdlc_runtime_guard.py (preToolUse denies app/ edits; postToolUse injects AGENT_DISPATCH; stop auto-continues runner)\n- beforeSubmitPrompt does NOT support additional_context (Cursor docs) — use postToolUse + sessionStart\n- ALL feature work in git worktrees (qa.worktree_gate)\n- Handoff required at end of execution (/sdlc:handoff)\n- INDEX must be updated for new docs/specs\n"

# ── Ensure cognitive trace server + output JSON ───────────────────────────────
printf '%s' "$CONTEXT" | python3 - "$ROOT" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
context = sys.stdin.read()
ensure_script = root / ".sdlc" / "bin" / "sdlc_trace_ensure.py"

trace: dict = {"status": "unavailable"}
if ensure_script.is_file():
    try:
        proc = subprocess.run(
            [sys.executable, str(ensure_script), "--json"],
            capture_output=True,
            text=True,
            timeout=12,
            cwd=str(root),
        )
        if proc.returncode == 0 and proc.stdout.strip():
            trace = json.loads(proc.stdout)
    except (subprocess.SubprocessError, json.JSONDecodeError, OSError):
        pass

url = trace.get("url")
if url:
    status = trace.get("status", "unknown")
    context += (
        f"\n## Cognitive Trace Dashboard\n"
        f"URL: {url}\n"
        f"SSE: {url}/api/events/stream\n"
        f"Status: {status}\n"
    )
    if trace.get("target_dir") and trace.get("status") == "running_foreign":
        context += f"Note: server target is {trace['target_dir']} (shared listener)\n"
    if trace.get("reason"):
        context += f"Recovery: restarted ({trace['reason']})\n"
    context += "\nSurface this URL to the user at session start.\n\n"
else:
    msg = trace.get("message") or "Trace server unavailable — run: ai-native-sdlc trace"
    context += f"\n## Cognitive Trace Dashboard\nUnavailable: {msg}\n\n"

payload: dict = {"additional_context": context}
if url:
    payload["env"] = {"SDLC_TRACE_URL": url}
    payload["user_message"] = f"Cognitive trace dashboard: {url}"
else:
    payload["user_message"] = f"Cognitive trace unavailable — {trace.get('message', 'start with ai-native-sdlc trace')}"

print(json.dumps(payload))
PY

exit 0
