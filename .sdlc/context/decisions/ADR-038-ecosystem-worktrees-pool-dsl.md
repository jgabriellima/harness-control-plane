# ADR-037: Ecosystem worktrees pool and DSL binding

Date: 2026-06-15
Status: ACCEPTED
Extends: ADR-009, ADR-021, ADR-033, ADR-035
Supersedes: hardcoded `jambu/worktrees/` convention in skills and architecture rules only

## Problem statement

Feature worktrees for multiple sibling git repos under `~/workspaces/jambu/` were created ad hoc in a shared directory `jambu/worktrees/`, but:

1. Path layout lived in skills and `.cursor/rules` as string literals — not in harness DSL.
2. Protocol guard detected `/worktrees/` substring instead of configured root.
3. Channel repos (`jambu-ai-homepage`, `joao-personal-website`) and `harness/` had no normative contract for where worktrees go when SDLC is adopted.
4. Operators opening a site repo or gateway binding could not discover the shared pool without tribal knowledge.

## Decision

### 1. Shared filesystem pool (ecosystem layout)

When a git repo's **primary checkout** is a direct child of `~/workspaces/jambu/`:

| Concept | Path |
|---|---|
| **Worktrees pool** (absolute) | `~/workspaces/jambu/worktrees/` |
| **DSL relative root** | `../worktrees` (from primary checkout) |
| **Directory naming** | `{ticket_id}-{slug}` (kebab slug) |

All harness-enabled repos in the Jambu sibling layout **SHARE one pool**. Each repo registers its own worktrees via `git worktree add`; the pool is not a git repo.

Navigation index: `jambu/docs/ecosystem/worktrees-pool.md`.

### 2. DSL contract (`workspace.worktrees`)

Declare in each repo's `.sdlc/sdlc.yaml`:

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

| Field | Role |
|---|---|
| `root` | Relative to **primary** git worktree (`git worktree list` first entry) |
| `pool` | Ecosystem identifier (`jambu`) — documentation and doctor hints only |
| `dir_template` | Subdirectory under pool; placeholders `{ticket_id}`, `{slug}` |
| `branch_templates` | Branch naming by change kind |

Resolution API (`sdlc_dsl_bindings.py`):

- `worktrees_dsl()`, `worktrees_root_path()`, `resolve_worktree_dir()`, `resolve_worktree_branch()`, `path_under_worktrees_root()`

Defaults match the block above when omitted (backward compatible).

### 3. Enforcement

| Layer | Behavior |
|---|---|
| `worktree-registered.pass` | Registered manifest paths MUST be under `worktrees_root_path()` |
| `sdlc_protocol_guard.py` | Uses `path_under_worktrees_root()` — not `/worktrees/` substring |
| Worktree skill | Resolves paths via `sdlc_dsl_bindings` — MUST NOT hardcode parent dir |
| Gates / doctor | Warn when `workspace.worktrees` missing on operational installs |

### 4. Per-repo administration

| Action | Where |
|---|---|
| Create worktree | Primary checkout of owning repo: `git worktree add $(resolve_worktree_dir …) -b $(resolve_worktree_branch …)` |
| List worktrees | `git worktree list` **from owning repo** (each repo has its own linked set) |
| Registry | Owning repo `.sdlc/INDEX.md` → Active Worktrees |
| Verify cwd | `git rev-parse --show-toplevel` before edits |

### 5. Repo classes under `jambu/`

| Class | Worktree policy |
|---|---|
| SDLC product (`ai-native-sdlc`, `business-workflow`) | **Mandatory** — `constraints.worktrees_mandatory: true` |
| Platform dev binding (`deep-agent-gateway`) | **Mandatory** when using SDLC goal-flow |
| Platform library (`agent-runtime-gateway` canonical) | Work via `deep-agent-gateway` binding or adopt same DSL when standalone SDLC added |
| Kernel (`harness/`) | Same DSL when feature work starts; pool root unchanged |
| Channel static sites (`jambu-ai-homepage`, `joao-personal-website`) | **SDLC operational (2026-06-16)** — same `../worktrees` block; worktrees mandatory |

## Non-goals

- Central git repo for `jambu/worktrees/` (remains non-git directory).
- Auto-create worktrees in workflow runner (remains agent + `git worktree add`).
- Cross-repo worktree deduplication (same ticket in two repos = two registrations).

## Verification

```bash
cd ~/workspaces/jambu/ai-native-sdlc
python3 -m pytest .sdlc/bin/tests/test_worktree_dsl_bindings.py -q
python3 -m pytest .sdlc/bin/tests/test_protocol_guard_workflow.py -q
python3 -c "
import sys; sys.path.insert(0, '.sdlc/bin')
from sdlc_dsl_bindings import worktrees_root_path
assert str(worktrees_root_path()).endswith('/jambu/worktrees')
print('pool ok:', worktrees_root_path())
"
```

## Consequences

- One documented pool for the entire Jambu filesystem layout.
- Site and kernel repos inherit the same contract when they add `.sdlc/`.
- Misconfigured paths fail at gate time with DSL root in the error message.

## References

- `jambu/docs/ecosystem/worktrees-pool.md`
- ADR-009 — worktree mandate
- ADR-033 — sibling repo topology
- `.cursor/skills/worktree/SKILL.md`
