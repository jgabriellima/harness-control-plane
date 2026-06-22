---
name: sdlc:post-deployment
description: Post-deployment validation gate — resolves deployed version and commits, records browser video of the production URL at three resolutions, runs HTTP and Playwright smoke checks, generates a signed evidence manifest, and asks the operator whether to open a GitHub incident issue if any check fails. Invoked automatically by /sdlc:deploy and the Deployer agent, and callable standalone after any production change.
---

# /sdlc:post-deployment — Post-Deployment Validation Gate

Validate production after any deploy. Collect version-locked evidence. Close the loop or escalate.

## Usage

```
/sdlc:post-deployment [--url <production-url>] [--version <semver>] [--env <production|staging>]
```

Defaults:
- `--url`: resolved from `.cursor/memories/operational-context.md` → `URL` field
- `--version`: resolved from `app/package.json` `.version` field
- `--env`: `production`

## Invocation Contract

This command is **non-optional**. It must be the final step of every production deployment.
- Called by `/sdlc:deploy` Step 8 automatically.
- Called by the Deployer agent Stage 6 automatically.
- Can also be invoked standalone to re-validate after rollback, hotfix, or manual intervention.

If called without a `--url` argument and no URL is found in operational-context.md, STOP and report: URL is required.

---

## Execution Protocol

---

### Step 1 — Version and Commit Audit

Resolve the deployed version and commit baseline before touching the browser.

```bash
VERSION=$(node -p "require('./app/package.json').version" 2>/dev/null || echo "unknown")
GIT_TAG="v${VERSION}"
DEPLOYED_SHA=$(git rev-list -n 1 "$GIT_TAG" 2>/dev/null || git rev-parse HEAD)
COMMIT_RANGE_START=$(git describe --tags --abbrev=0 "$GIT_TAG^" 2>/dev/null || echo "initial")
```

Collect:
- `VERSION` — semver from package.json
- `DEPLOYED_SHA` — commit SHA the tag points to
- `COMMIT_LOG` — all commits in this release:
  ```bash
  git log --oneline "${COMMIT_RANGE_START}..${GIT_TAG}" 2>/dev/null \
    || git log --oneline -10
  ```
- `TAG_DATE` — `git log -1 --format="%ci" "$GIT_TAG"`

If `VERSION` is `unknown` or `DEPLOYED_SHA` is empty, record this as a version audit warning but do not abort — continue with what is available and flag it in the manifest.

Observability slot is **`none`** — skip client analytics deployment events. Record deploy correlation via GitHub Actions run URL and Cloudflare Pages deployment ID in the evidence manifest.

---

### Step 2 — Resolve Production URL

```bash
PROD_URL="${ARGS_URL:-$(grep -E '^URL:' .cursor/memories/operational-context.md | head -1 | awk '{print $2}')}"
```

If `PROD_URL` is empty: STOP. Report: "Production URL not found. Pass --url or update .cursor/memories/operational-context.md."

Verify the URL is reachable:
```bash
HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}" --max-time 10 "$PROD_URL")
```

If `HTTP_STATUS` is not 200 (or expected redirect 301/302): record as CRITICAL FAILURE. Skip browser steps. Go directly to Step 6.

---

### Step 3 — Browser Visual Recording (Production URL)

Record the production URL at three resolutions using the cursor-ide-browser MCP.

Use the following protocol for each resolution:

#### 3a — Desktop (1280×800)

1. Navigate to `$PROD_URL`
2. Take screenshot — save as `post-deploy-desktop-home.png`
3. Navigate to each critical path (at minimum: homepage, blog list, one post detail if exists)
4. Take a screenshot at each path
5. Check browser console for errors: `browser_console_messages` — record any errors

#### 3b — Tablet (768×1024)

1. Set viewport to 768×1024
2. Navigate to `$PROD_URL`
3. Take screenshot — save as `post-deploy-tablet-home.png`
4. Navigate through the same critical paths

#### 3c — Mobile (375×812)

1. Set viewport to 375×812
2. Navigate to `$PROD_URL`
3. Take screenshot — save as `post-deploy-mobile-home.png`
4. Navigate through same critical paths
5. Verify mobile nav is functional (no overflow, no broken layout)

For each resolution, record:
- Any JavaScript console errors
- Any 4xx/5xx network responses: `browser_network_requests`
- Whether the page renders within 5 seconds (visual completeness, not performance metric)

Store all screenshots in:
```
EVIDENCE_DIR=".sdlc/evidence/$(date +%Y-%m-%d-%H%M)-v${VERSION}-post-deploy"
mkdir -p "$EVIDENCE_DIR"
```

---

### Step 4 — Playwright Smoke with Video Recording

Run the smoke spec against the production URL using the dedicated post-deploy projects.
These projects have `video: "on"` and `screenshot: "on"` — recording is unconditional,
not gated on retry. This produces evidence even when all tests pass.

```bash
cd app && PLAYWRIGHT_BASE_URL="$PROD_URL" \
  npx playwright test e2e/smoke.spec.ts \
  --project=post-deploy-desktop \
  --project=post-deploy-tablet \
  --project=post-deploy-mobile \
  --reporter=html \
  2>&1 | tee "$EVIDENCE_DIR/smoke-run.log"
```

After the run, collect videos:
```bash
find app/test-results -name "*.webm" \
  -exec cp {} "$EVIDENCE_DIR/smoke-video-$(basename {})" \;
```

If `e2e/smoke.spec.ts` does not exist: run the first available E2E spec with `--grep @smoke` tag, or run the full suite with `--reporter=dot` and record results summary only.

Record:
- Total tests: passed / failed / skipped
- Exit code of the playwright run

---

### Step 5 — Production health check (no observability SDK)

With `observability: none`, validate production via HTTP and console/network signals from Steps 3–4:

```bash
# Re-verify homepage and one deep link
for path in "" "/engineering/"; do
  code=$(curl -o /dev/null -s -w "%{http_code}" --max-time 15 "${PROD_URL}${path}")
  echo "${PROD_URL}${path} -> HTTP ${code}"
done
```

Record any non-2xx as FAIL in the evidence manifest. Classify HTTP health:
- All checked paths 2xx: HEALTHY
- One path non-2xx: FAILED

---

### Step 6 — Evidence Manifest

Create `$EVIDENCE_DIR/manifest.md`:

```markdown
# Post-Deploy Evidence Manifest

## Release
- Version: {VERSION}
- Git Tag: {GIT_TAG}
- Deployed SHA: {DEPLOYED_SHA}
- Tag Date: {TAG_DATE}
- Environment: production
- URL: {PROD_URL}
- Validation Timestamp: {ISO timestamp}

## Commits in This Release
{COMMIT_LOG — one line per commit}

## HTTP Reachability
- Status: {HTTP_STATUS}

## Browser Visual Checks
| Resolution | Paths Checked | Console Errors | Network Errors | Status |
|---|---|---|---|---|
| Desktop 1280×800 | {N} | {count} | {count} | PASS / FAIL |
| Tablet 768×1024 | {N} | {count} | {count} | PASS / FAIL |
| Mobile 375×812 | {N} | {count} | {count} | PASS / FAIL |

## Screenshots
{list of screenshot filenames with descriptions}

## Smoke Tests (Playwright)
- Total: {N}
- Passed: {N}
- Failed: {N}
- Skipped: {N}
- Video: {filename or "not captured"}
- Log: smoke-run.log

## HTTP Health (post-deploy paths)
- Paths checked: {list}
- Classification: HEALTHY / FAILED

## Verdict
PASS / WARN / FAIL

### Failure Reasons (if any)
{list each failed check}
```

---

### Step 7 — Verdict Determination

Apply this decision matrix:

| Condition | Verdict |
|---|---|
| HTTP not 200 | FAIL |
| Smoke tests have any failure | FAIL |
| Deep-link HTTP not 2xx | FAIL |
| Console errors on critical paths | WARN |
| Version audit warning | WARN |
| All checks clean | PASS |

A WARN verdict does not block but must appear in the manifest.

---

### Step 8 — User Consent Gate (on FAIL or WARN)

If verdict is FAIL:

```
Post-Deploy Validation FAILED — v{VERSION} at {PROD_URL}

Failed checks:
  - {check 1}
  - {check 2}

Evidence: {EVIDENCE_DIR}/manifest.md

Actions available:
  [1] Open GitHub incident issue (triggers /sdlc:incident automatically)
  [2] Initiate rollback first, then open issue
  [3] Skip — I will handle this manually

Enter choice (1/2/3):
```

If verdict is WARN:

```
Post-Deploy Validation WARN — v{VERSION} at {PROD_URL}

Warnings:
  - {warning 1}

Evidence: {EVIDENCE_DIR}/manifest.md

Open a GitHub issue for tracking? (y/N):
```

If verdict is PASS: skip this step entirely.

---

### Step 9 — GitHub Issue Creation (if operator consents)

If operator chose option 1 (FAIL) or yes (WARN):

Determine severity:
- HTTP not 200 or smoke failures → P1
- HTTP/deep-link failure only → P2
- Warnings only → P3

```bash
SEVERITY="p1|p2|p3"  # determined above
ISSUE_TITLE="post-deploy validation failed: v${VERSION} — ${FAILED_CHECKS_SUMMARY}"

gh issue create \
  --title "$ISSUE_TITLE" \
  --label "incident,deployment,automated,${SEVERITY}" \
  --body "$(cat <<'EOF'
## Post-Deploy Failure Report

**Version:** v{VERSION}
**URL:** {PROD_URL}
**SHA:** {DEPLOYED_SHA}
**Validated at:** {ISO timestamp}

### Failed Checks
{list}

### Warnings
{list}

### Evidence
Path: `.sdlc/evidence/{EVIDENCE_DIR_BASENAME}/manifest.md`

### Commits in Release
{COMMIT_LOG}

---
*Created automatically by /sdlc:post-deployment*
EOF
)"
```

Record the issue URL returned by `gh issue create`.

If operator chose option 2 (rollback first):
1. Execute rollback: `npx wrangler pages deployment rollback <DEPLOYMENT_ID> --project-name="$CLOUDFLARE_PAGES_PROJECT_NAME"`
2. Verify rollback by re-running Step 2 HTTP check
3. Then create GitHub issue with rollback status noted in body
4. Invoke `/sdlc:incident <issue-url>`

If GitHub CLI is not authenticated or repo is not configured: print the issue body for the operator to create manually. Do not abort.

---

### Step 10 — Memory and INDEX Update

Update `.cursor/memories/operational-context.md`:

```
Last Deploy: v{VERSION} to production on {TAG_DATE}
URL: {PROD_URL}
Post-Deploy Status: PASS | WARN | FAIL
Post-Deploy Evidence: .sdlc/evidence/{EVIDENCE_DIR_BASENAME}/manifest.md
```

If a GitHub issue was created:
- Update `.cursor/memories/incidents.md`:
  ```
  {DATE} | {ISSUE_URL} | P{N} | post-deploy failure v{VERSION} | OPEN
  ```

Register evidence in `.sdlc/INDEX.md` under QA Evidence:
```
| {DATE} | {VERSION} post-deploy | Visual + Smoke + HTTP | {EVIDENCE_DIR_BASENAME}/manifest.md |
```

---

### Step 11 — Final Report

Print to the operator:

```
/sdlc:post-deployment — v{VERSION} — {PROD_URL}

Version Audit:   {PASS|WARN}   SHA: {short SHA}
HTTP:            {PASS|FAIL}   {HTTP_STATUS}
Browser Visual:  {PASS|WARN|FAIL}   {N} paths, {N} console errors
Smoke Tests:     {PASS|FAIL}   {passed}/{total}
HTTP paths:      {HEALTHY|FAILED}   {paths checked}

Overall Verdict: PASS | WARN | FAIL

Evidence: .sdlc/evidence/{EVIDENCE_DIR_BASENAME}/
Manifest: .sdlc/evidence/{EVIDENCE_DIR_BASENAME}/manifest.md

{If issue created:}
Incident Issue:  {ISSUE_URL}
Next Step:       /sdlc:incident {ISSUE_URL}

{If PASS:}
Production is healthy. Deployment complete.
```
