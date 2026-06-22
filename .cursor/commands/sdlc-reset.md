---
name: sdlc:reset
description: Reset the project to a reproducible clean baseline for SDLC demo re-runs. Wipes worktrees, open PRs, Plane ticket state, and memory files back to initial conditions. Not for production use.
---

# /sdlc:reset — Project Reset to Clean Demo Baseline

Resets the project to the reproducible baseline state for SDLC flow re-demonstration. Intended for demo cycle restarts, not for production use.

## Usage

```
/sdlc:reset [--commit] [--advance-baseline]
```

- `--commit`: create a git commit on `main` after the reset
- `--advance-baseline`: also move the `v0.1.0-baseline` tag to current HEAD (use after infra changes that should become the new canonical baseline)

---

## When to Use

One scenario: **re-running the SDLC demo from scratch**.

After a full demonstration cycle (spec → implement → QA → deploy), the project has feature content, Plane issues, worktrees, and handoff history. To demonstrate the same cycle again to a new audience, the project must return to Hello World so the flow reads as a fresh execution.

## When NOT to Use

- During active feature development — this destroys uncommitted work in `app/src/`
- To "clean up" after a sprint — completed features should be deployed, not deleted
- As a rollback mechanism — use git revert or branch recovery for that

---

## Execution Protocol

### Step 1 — Pre-flight check

Confirm you are on `main` and there is no in-progress work that should be saved:

```bash
git checkout main
git status
git worktree list
```

The script will abort immediately if the current branch is not `main`. This is a hard guard — `git checkout <tag> -- app/src/` applies to the working tree of whatever branch is active, so running from a feature branch would corrupt it.

If there are uncommitted changes on a feature branch, run `/sdlc:handoff` first, then return to `main`.

### Step 2 — Execute reset script

```bash
./scripts/reset.sh
```

The script will print a summary of what it will destroy and require you to type `reset` to confirm before doing anything. There is no undo after confirmation.

```
==> PROJECT RESET

    This will:
      - Cancel all Plane issues
      - Remove all git worktrees
      - Restore app/src/ to v0.1.0-baseline
      - Clear evidence, handoffs, and memory files

    Branch: main
    Baseline tag: v0.1.0-baseline

    Type 'reset' to confirm:
```

The script runs 7 steps in order:

| Step | What It Does | Source of Truth |
|---|---|---|
| 0/7 | Cancel all Plane issues via API | Plane API (PLANE_API_KEY required) |
| 1/7 | Remove all git worktrees | `git worktree list` |
| 2/7 | Restore `app/src/` to baseline | `git checkout v0.1.0-baseline -- app/src/` |
| 3/7 | Clear `.sdlc/evidence/` | filesystem |
| 4/7 | Reset handoffs to bootstrap state | generates new LATEST.md |
| 5/7 | Clear all memory files | hardcoded empty templates |
| 6/7 | Clear active tables in INDEX.md | regex replacement |
| 7/7 | Verify `npm run build` passes | local build check |

### Step 3 — Post-reset verification

```bash
/sdlc:doctor
```

Expected: all checks pass. Two known non-blocking warnings at baseline:
- No evidence artifacts (expected — nothing has been demonstrated yet)
- `tailwind.config.mjs` absent (expected — Tailwind 4 uses Vite plugin, not config file)

### Step 4 — If PLANE_API_KEY is not set

The Plane reset step (0/7) will warn and skip. Manually cancel or delete issues at [app.plane.so/jambuai](https://app.plane.so/jambuai/). The rest of the reset proceeds normally.

---

## Baseline Tag Protocol

The app source of truth for the reset is the git tag `v0.1.0-baseline`. The variable `BASELINE_TAG` in `scripts/reset.sh` controls which tag is used.

### When to advance the baseline

After any change to SDLC infrastructure that should become the new canonical starting point:

```bash
git tag -d v0.1.0-baseline
git push origin :refs/tags/v0.1.0-baseline
git tag -a v0.1.0-baseline HEAD -m "Baseline: <description of what changed>"
git push origin v0.1.0-baseline
```

Then update `BASELINE_TAG` in `scripts/reset.sh` if the tag name changes (e.g. `v0.2.0-baseline`).

### What is and is NOT in the baseline tag

| Included | Not Included |
|---|---|
| `app/src/` — all source files | Memory files (always reset to empty templates) |
| `app/astro.config.mjs` | Handoffs (always regenerated) |
| `app/package.json` / `package-lock.json` | INDEX.md active tables (always cleared) |
| `app/.nvmrc` | Plane issue state |
| `app/vercel.json` | Git worktrees |
| `scripts/reset.sh` | `.env` (gitignored) |

---

## What Reset Does NOT Touch

- `.cursor/rules/` — all Cursor rules remain
- `.cursor/commands/` — all commands remain
- `.cursor/hooks/` — all hooks remain
- `.sdlc/workflows/` — SDLC workflow definitions remain
- `.sdlc/doctor/` — doctor checks remain
- `.github/` — CI/CD configuration remains
- Git history — all commits and tags are preserved
- The git tag itself — `v0.1.0-baseline` is not deleted or moved

---

## Failure Recovery

If the build check (step 7/7) fails after reset:

1. Check `/tmp/sdlc-reset-build.log` for the Astro build error
2. The most common cause: a file in `app/src/` at the baseline tag references a dependency that is no longer installed
3. Fix: `cd app && npm install`, verify build passes, then advance the baseline tag

If worktree removal fails:

```bash
git worktree prune
rm -rf /home/administrator/workspaces/jambu/worktrees/*
```
