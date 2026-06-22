---
name: run:e2e
description: Execute the full Playwright E2E validation suite with browser recording and evidence generation. Saves results to .sdlc/evidence/ and reports pass/fail per scenario.
---

# /run:e2e — End-to-End Test Execution

Execute the full E2E validation suite with browser tooling and evidence generation.

## Usage

```
/run:e2e [--scope <smoke|full|accessibility|visual>] [--url <base-url>]
```

Default: `--scope full --url http://localhost:4321`

## Execution Protocol

You are executing E2E validation using Playwright and the browser tooling. All evidence MUST be stored.

---

### Step 1 — Environment Check

Verify:
- `app/playwright.config.ts` and `app/playwright.evidence.config.ts` exist
- Chromium browser is installed: `cd app && npx playwright install chromium`
- App is built or a `--url` pointing to a live environment is provided

**ALWAYS run E2E against the static preview server, never against the dev server.**
The Vite dev server causes transient 504 errors that produce false failures.

```bash
# Build first, then start preview
cd app && npm run build && npm run preview -- --port 4322 &
sleep 3
```

---

### Step 2 — Scope-Specific Execution

#### Standard Fast Run (CI / pre-commit validation)

```bash
cd app && PLAYWRIGHT_BASE_URL=http://localhost:4322 npx playwright test --reporter=list,html
```

Uses `playwright.config.ts` — video only on retry, screenshot only on failure.

#### Evidence Run (required before PR creation)

```bash
# Delegates to the evidence recording script which handles build, server, recording, manifest
./scripts/record-e2e.sh JAMBU-{N}
```

Uses `playwright.evidence.config.ts` — video ON for every test, full trace, all viewports.
This is the ONLY run that counts as QA evidence for PR creation.

#### Accessibility

```bash
cd app && PLAYWRIGHT_BASE_URL=http://localhost:4322 npx playwright test e2e/accessibility.spec.ts
```

#### Visual Regression

```bash
cd app && PLAYWRIGHT_BASE_URL=http://localhost:4322 npx playwright test e2e/visual.spec.ts --update-snapshots
```

---

### Step 3 — Browser Tooling Validation

After Playwright tests, use the Cursor browser tool to manually validate critical flows:

1. Open homepage at the target URL
2. Take a screenshot and record to `.sdlc/evidence/{ticket}-e2e-{timestamp}/manual-desktop.png`
3. Click through navigation links — verify each page renders
4. Resize to mobile (375px) — take mobile screenshot

Store manual screenshots alongside the automated evidence from `scripts/record-e2e.sh`.

---

### Step 5 — Memory Consolidation

After the run, update:

| Condition | File to update |
|---|---|
| Always | `.cursor/memories/operational-context.md` — append one-line E2E result entry: date, scope, pass/fail, test count, evidence path |
| Any test was added or modified to reflect a new coverage rule | `.cursor/memories/business-rules.md` — add the invariant the test encodes if it is not already documented |

---

### Step 6 — Report

Output summary:

```
E2E Suite: {scope}
Status:    PASS / FAIL
Duration:  Xs
Tests:     N passed, N failed

Evidence: .sdlc/evidence/{ticket}-e2e-{timestamp}/manifest.md
Videos:   .sdlc/evidence/{ticket}-e2e-{timestamp}/artifacts/ ({N} files)
```

If FAIL: list failing tests with error messages. Do not proceed to PR creation until all E2E tests pass.

**No PR may be created without a completed evidence run via `scripts/record-e2e.sh`.**
