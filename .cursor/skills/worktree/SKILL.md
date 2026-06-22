---
name: worktree
description: Use when starting any feature or fix implementation that requires an isolated git worktree. Required before any code is written. Triggered by /sdlc:spec and /sdlc:implement flows or any time a Plane ticket transitions to In Progress.
---

# Worktree Skill

## The Rule

**ALL feature work MUST happen in a git worktree. No exceptions.**

Direct commits to `main` are forbidden. Every Plane ticket gets its own worktree and branch. Nothing is implemented without a PR.

## When to Use
- Before starting any implementation (after Plane ticket is created)
- Invoked automatically by `/sdlc:spec` and `/sdlc:implement` flows

## Worktree Path — DSL Source of Truth (ADR-037)

Paths are **not** hardcoded in this skill. They come from `workspace.worktrees` in `.sdlc/sdlc.yaml`:

```yaml
workspace:
  worktrees:
    root: ../worktrees
    pool: jambu
    dir_template: "{ticket_id}-{slug}"
    branch_templates:
      feat: feat/{ticket_id}-{slug}
      fix: fix/{ticket_id}-{slug}
      chore: chore/{ticket_id}-{slug}
```

Under the Jambu sibling layout, `root: ../worktrees` resolves to `~/workspaces/jambu/worktrees/`. See `jambu/docs/ecosystem/worktrees-pool.md`.

Resolve at runtime via `sdlc_dsl_bindings.py`:

```bash
python3 - <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, str(Path(".sdlc/bin").resolve()))
from sdlc_dsl_bindings import resolve_worktree_dir, resolve_worktree_branch, worktrees_root_path
ticket, slug = "JAMBU-1", "blog-identity"
print("pool:", worktrees_root_path())
print(resolve_worktree_dir(ticket, slug))
print(resolve_worktree_branch(ticket, slug, kind="feat"))
PY
```

Gates (`worktree-registered.pass`) reject paths outside `worktrees_root_path()`.

## Creating a Worktree

```bash
TICKET="JAMBU-1"
DESC="blog-identity"
WORKTREE_PATH="$(python3 -c "import sys; from pathlib import Path; sys.path.insert(0,'.sdlc/bin'); from sdlc_dsl_bindings import resolve_worktree_dir; print(resolve_worktree_dir('${TICKET}', '${DESC}'))")"
BRANCH="$(python3 -c "import sys; from pathlib import Path; sys.path.insert(0,'.sdlc/bin'); from sdlc_dsl_bindings import resolve_worktree_branch; print(resolve_worktree_branch('${TICKET}', '${DESC}', kind='feat'))")"

git worktree add "$WORKTREE_PATH" -b "$BRANCH"

echo "Worktree: $WORKTREE_PATH"
echo "Branch: $BRANCH"
```

## Working in a Worktree

```bash
cd "$WORKTREE_PATH"
# All implementation happens here
# The main workspace is NOT touched during feature development
```

## Opening a PR from a Worktree

```bash
cd "$WORKTREE_PATH"
git add .
git commit -m "feat(JAMBU-N): short description

- Detailed change 1
- Detailed change 2

Plane: https://app.plane.so/jambuai/..."

git push -u origin "$BRANCH"

gh pr create \
  --title "feat(JAMBU-N): short description" \
  --body "## Summary
...
Closes JAMBU-N" \
  --base main
```

## Cleaning Up After Merge

```bash
# After PR is merged to main
git worktree remove "$WORKTREE_PATH"
git branch -d "$BRANCH"
```

## Listing Active Worktrees

```bash
git worktree list
```

## Worktree Registry

Active worktrees are tracked in `.sdlc/INDEX.md` under "Active Worktrees".
When a worktree is created: add to INDEX.
When a worktree is removed after merge: remove from INDEX.

## Important

- Each worktree is isolated — changes in one do NOT affect another
- The Cursor session can be pointed at a specific worktree path to work in isolation
- Multiple features can be developed concurrently in separate worktrees
- Always verify you are in the correct worktree before making changes: `pwd && git branch --show-current`
