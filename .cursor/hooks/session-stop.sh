#!/bin/bash
# Session Stop Hook — Mechanical Handoff Stub Writer
# Location: .cursor/hooks/session-stop.sh
# Trigger:  stop event (hooks.json) — runs BEFORE the agent prompt
# Purpose:  Write a minimal timestamped stub to .sdlc/handoffs/ unconditionally.
#           This guarantees LATEST.md is always updated even if the agent never
#           responds to the stop prompt. The agent's stop prompt then overwrites
#           with enriched content if it executes successfully.
#
# Fail-open: exits 0 regardless of errors so Cursor never blocks on this hook.

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HANDOFFS="$ROOT/.sdlc/handoffs"
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
STUB_FILE="$HANDOFFS/${TIMESTAMP}-session-stub.md"

mkdir -p "$HANDOFFS"

LATEST="$HANDOFFS/LATEST.md"
# Do not overwrite enriched handoff with stub (ADR-012)
if [ -f "$LATEST" ]; then
  if ! grep -q "STUB — Agent did not enrich" "$LATEST" 2>/dev/null; then
    LATEST_MTIME=$(stat -c %Y "$LATEST" 2>/dev/null || stat -f %m "$LATEST" 2>/dev/null || echo 0)
    NOW_EPOCH=$(date +%s)
    AGE=$((NOW_EPOCH - LATEST_MTIME))
    if [ "$AGE" -lt 3600 ]; then
      echo "{}"
      exit 0
    fi
  fi
fi

# Only write a stub if no handoff for this minute already exists.
# This prevents duplicate stubs if the hook fires multiple times.
if ls "$HANDOFFS/${TIMESTAMP}-"*.md 2>/dev/null | grep -q .; then
  echo "{}"
  exit 0
fi

cat > "$STUB_FILE" <<EOF
# Handoff — session-stub — ${TIMESTAMP}

## Status
STUB — Agent did not enrich this handoff. Session ended without /sdlc:handoff execution.

## What Was Done
(not recorded — check git log for changes made this session)

## Context for Next Session
Session ended at ${TIMESTAMP}. Run \`git log --oneline -10\` to reconstruct work.
EOF

cp "$STUB_FILE" "$HANDOFFS/LATEST.md"

# SDLC reflection warning: detect in-progress or in-review tickets
# that may not have been through /sdlc:reflect this session.
PLANE_API_KEY="${PLANE_API_KEY:-}"
if [ -n "$PLANE_API_KEY" ]; then
  IN_PROGRESS_COUNT=$(curl -s \
    -H "X-API-Key: $PLANE_API_KEY" \
    "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/issues/?state=08fe0d8a-88a6-4f73-a375-6059b21bb6b0" \
    2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0))" 2>/dev/null || echo "0")

  IN_REVIEW_COUNT=$(curl -s \
    -H "X-API-Key: $PLANE_API_KEY" \
    "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/issues/?state=347a804e-6938-47f0-8b96-f91fde3815b2" \
    2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0))" 2>/dev/null || echo "0")

  if [ "$IN_PROGRESS_COUNT" -gt 0 ] 2>/dev/null; then
    WARN_MSG="WARNING: $IN_PROGRESS_COUNT ticket(s) still In Progress at session end. Run /sdlc:reflect <JAMBU-N> to verify artifacts and move to In Review."
    echo "$WARN_MSG" >> "$STUB_FILE"
  fi

  if [ "$IN_REVIEW_COUNT" -gt 0 ] 2>/dev/null; then
    WARN_MSG="NOTE: $IN_REVIEW_COUNT ticket(s) In Review (PR open). Ensure /sdlc:reflect was run and evidence is complete."
    echo "$WARN_MSG" >> "$STUB_FILE"
  fi
fi

echo "{}"
exit 0
