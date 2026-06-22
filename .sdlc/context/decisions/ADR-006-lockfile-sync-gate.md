# ADR-006 — Deterministic Lockfile Sync Gate

| Field | Value |
|---|---|
| ID | ADR-006 |
| Date | 2026-05-20 |
| Status | ACCEPTED |
| Deciders | Engineering |
| Incident | CI startup_failure cascade + npm ci EUSAGE (2026-05-20) |

---

## Problem Statement

The merge of JAMBU-9 introduced `better-sqlite3`, which depends on `@napi-rs/wasm-runtime`,
which requires `@emnapi/core@1.10.0` and `@emnapi/runtime@1.10.0` as optional peer
dependencies. The `package-lock.json` committed with the PR was generated without
`--include=optional` on a macOS environment. The CI runner (ubuntu-latest) resolved these
packages as required and `npm ci` failed with `EUSAGE: Missing from lock file`.

The failure was undetectable at PR creation time because no local gate existed to validate
lock file completeness before push.

## Constraint Inventory

1. `npm ci` is strict by design — it enforces byte-level reproducibility of the dependency
   graph. Any deviation between `package.json` and `package-lock.json` is a hard failure.
2. `.astro/` is gitignored. `astro sync` must run in CI before `tsc --noEmit` to generate
   virtual module type declarations (`astro:content`, `import.meta.env`).
3. Git worktrees share a common git directory. Hooks registered via `core.hooksPath` fire
   across all worktrees from a single source.
4. The CI environment is ubuntu-latest (Linux x64). Optional native dependencies
   (`@emnapi/*`, `better-sqlite3` prebuilds) resolve differently per platform unless
   `--include=optional` is passed explicitly.

## Decision

Enforce a three-layer gate architecture:

### Layer 1 — Pre-commit hook (`scripts/hooks/pre-commit`)

Triggers when `app/package.json` or `app/package-lock.json` is in the staged area.

Execution contract:
1. Run `npm install --include=optional` in `app/` with a timeout.
2. Detect if `package-lock.json` changed after the install.
3. If it changed: auto-stage the updated lock file and print a warning.
4. If `npm install` exits non-zero: abort the commit.

This ensures the lock file is always regenerated in the correct state before any commit
that modifies dependency declarations.

### Layer 2 — Pre-push hook (`scripts/hooks/pre-push`)

Triggers on any push.

Execution contract:
1. If `app/package.json` or `app/package-lock.json` is in the diff between HEAD and
   the push target, run `npm ci` in `app/` (dry-run equivalent via `--dry-run` flag).
2. If `npm ci` exits non-zero: block the push with the exact error output.

This is the last local gate before the branch reaches GitHub Actions.

### Layer 3 — Cursor rule (`dependency-gates.mdc`)

Agent-level invariant consumed by all Cursor agents on every session where
`app/package.json` is modified.

Contract:
- Any tool call that writes to `app/package.json` MUST be followed by
  `npm install --include=optional` in `app/`.
- The agent MUST stage `app/package-lock.json` before calling any git commit or
  PR creation command.
- The agent MUST NOT create a PR while `app/package-lock.json` has uncommitted changes.

### Layer 4 — CI enforcement (validate.yaml + deploy.yaml)

Already enforced. `npm ci` remains strict. `astro sync` runs before `tsc --noEmit`
to generate virtual module type declarations (ADR-006 also codifies this requirement).

## Hook Activation

Hooks are stored in `scripts/hooks/` (tracked in git).
Activation command (idempotent, run once per clone/worktree):

```bash
git config core.hooksPath scripts/hooks
```

This command is also embedded in `scripts/install-hooks.sh` which is invoked by
`npm run prepare` in `app/package.json`.

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Husky | Adds 4 KB of JS runtime overhead for a shell concern; conflicts with worktree setup |
| `lint-staged` | Scoped to staged files only; does not catch transitive optional dep resolution |
| CI-only enforcement | Too late in the loop — CI failure costs a full runner minute and pollutes PR history |
| Committing `.astro/` | Stale generated types cause worse failures than missing types; gitignore is correct |

## Verification Criteria

1. `git commit` while `app/package.json` has an unstaged `package-lock.json` →
   hook runs `npm install --include=optional`, auto-stages lock file, commit proceeds.
2. `git push` with a lock file missing optional peer entries → hook runs `npm ci`,
   detects EUSAGE, blocks push with exact error.
3. Agent modifying `app/package.json` without subsequent `npm install` →
   `dependency-gates.mdc` rule triggers a blocking lint warning in Cursor.
4. CI `validate.yaml` on a clean checkout → `astro sync` produces `.astro/types.d.ts`
   before `tsc --noEmit`, both jobs pass green.

## Residual Risks

- Developers who clone without running `scripts/install-hooks.sh` bypass Layers 1 and 2.
  Mitigation: add hook installation to `app/README.md` onboarding steps and to the
  `npm run prepare` lifecycle hook.
- Platform-specific prebuilds that resolve differently on arm64 (Apple Silicon) vs
  x64 (CI) may still diverge. Mitigation: the `--include=optional` flag covers this
  class of failure by forcing all optional deps to be written to the lock file regardless
  of the current platform.
