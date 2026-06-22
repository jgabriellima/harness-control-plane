---
name: sdlc:deploy
description: Execute the full deployment pipeline — build validation, staging deploy, E2E smoke tests, and production deploy with automatic rollback on failure.
---

# /sdlc:deploy — Release Deployment Pipeline

Execute the full deployment pipeline: validate → staging → E2E → production.

## Usage

```
/sdlc:deploy [--env <staging|production>] [--version <semver>]
```

Default: `--env staging`

## Pre-conditions

Before running this command, verify:
- All PR checks are green
- E2E suite passed (evidence exists in `.sdlc/evidence/`)
- No open P1/P2 incidents (GitHub `incident` label or `incidents.md`)

Observability slot is **`none`** — do not require `PUBLIC_POSTHOG_*` or PostHog MCP.

## Execution Protocol

---

### Step 1 — Pre-Deploy Checklist

Verify each item:

- [ ] `main` branch is up to date
- [ ] All tests pass: `cd app && npm run build` succeeds with zero errors
- [ ] No TypeScript errors: `cd app && npx tsc --noEmit`
- [ ] Cloudflare API token and Pages project secrets are configured in GitHub Actions
- [ ] `CHANGELOG.md` is updated with this release's changes

If any item fails, STOP and resolve before proceeding.

---

### Step 2 — Version Bump

Determine version bump type based on changes:
- `patch`: bug fixes only
- `minor`: new features, backward compatible
- `major`: breaking changes (requires ADR)

```bash
cd app && npm version <patch|minor|major> --no-git-tag-version
git add app/package.json
git commit -m "chore: bump version to $(cat app/package.json | jq -r .version)"
git tag "v$(cat app/package.json | jq -r .version)"
```

---

### Step 3 — Staging Deploy

Trigger staging deployment:

```bash
gh workflow run deploy.yaml --ref main -f environment=staging
```

Monitor deployment status:
```bash
gh run watch
```

Wait for staging deployment to complete. Verify staging URL responds.

---

### Step 4 — Staging Validation

Run smoke tests against staging:

```bash
cd app && PLAYWRIGHT_BASE_URL=https://staging.your-domain.com npx playwright test e2e/smoke.spec.ts
```

Use browser tool to visually validate staging:
1. Navigate to staging URL
2. Screenshot homepage
3. Click through 3 critical paths
4. Verify no console errors

Store evidence in `.sdlc/evidence/{version}-staging-validation/`.

---

### Step 5 — Full E2E on Staging

```bash
cd app && PLAYWRIGHT_BASE_URL=https://staging.your-domain.com npx playwright test
```

If any test fails on staging: STOP. Do not proceed to production. Create incident.

---

### Step 6 — Record deploy intent (workflow runner)

When using `/sdlc:goal`, record CI evidence on submit:

```json
{
  "structured": {
    "ci_run_url": "https://github.com/{org}/{repo}/actions/runs/{id}",
    "production_url": "https://your-production-url"
  }
}
```

---

### Step 7 — Production Deploy (if `--env production`)

```bash
gh workflow run deploy.yaml --ref main -f environment=production
gh run watch
```

---

### Step 8 — Post-Deploy Validation (mandatory, blocking)

Invoke `/sdlc:post-deployment` immediately after the production deploy workflow completes.
Do not proceed to Step 9 until this command exits with PASS or WARN.

```
/sdlc:post-deployment --url https://your-domain.com --version {VERSION}
```

This command runs the full validation protocol:
- Version and commit audit (confirms the SHA deployed matches the release tag)
- Browser visual recording at desktop, tablet, and mobile
- Playwright smoke against the live production URL with video evidence
- HTTP health check on production paths (observability slot `none`)
- Evidence manifest saved to `.sdlc/evidence/{timestamp}-v{VERSION}-post-deploy/`
- User consent gate: if any check fails, prompts to open a GitHub incident issue
- If operator approves: creates GitHub issue and invokes `/sdlc:incident`

If the command returns FAIL and the operator elects rollback:
```bash
npx wrangler pages deployment rollback <PREVIOUS_DEPLOYMENT_ID> --project-name="$CLOUDFLARE_PAGES_PROJECT_NAME"
```
`/sdlc:post-deployment` will handle issue creation and `/sdlc:incident` invocation.

---

### Step 9 — Memory Consolidation and Release Record

Update `.cursor/memories/operational-context.md` with deployment version, timestamp, and URL.

Record GitHub Actions run URL in workflow manifest `deployment.ci_run_url` when applicable.
