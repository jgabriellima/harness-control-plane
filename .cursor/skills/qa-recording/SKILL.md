---
name: qa-recording
description: Use when visual evidence is required during QA validation — feature implementation QA, accessibility checks, pre-deploy validation, or PR evidence generation. Captures browser recordings at multiple resolutions and saves to .sdlc/evidence/.
---

# QA Recording Skill

## When to Use
Call this skill during QA validation whenever visual evidence is required.
This is mandatory for:
- Feature implementation QA
- Accessibility validation
- Pre-deploy validation
- Evidence generation for PR review

## Evidence Storage Contract

Evidence artifacts (screenshots, videos) are **NOT committed to git**. They are:
1. Generated locally in `.sdlc/evidence/{ticket}/` **within the active worktree**
2. Uploaded to the Plane ticket as attachments after PR merge (see `plane.yaml` `attach_evidence_*` api_examples)
3. Summarized in a Plane comment with QA verdict and manifest content

Do NOT `git add` any file under `.sdlc/evidence/`. The `.gitignore` excludes all PNG, WebM, and manifest files from this directory.

## Tooling
Uses Playwright's built-in video recording. No FFmpeg required for recording.
Videos are WebM format, stored in `.sdlc/evidence/`.

## Three Target Resolutions

| Profile | Viewport | Device |
|---|---|---|
| mobile | 375 × 812 | iPhone equivalent |
| tablet | 768 × 1024 | iPad equivalent |
| desktop | 1280 × 800 | Standard laptop |

## Execution Protocol

### Step 0 — Worktree Context Gate (MANDATORY)

Before generating any evidence, verify execution context is the feature worktree, not the main workspace:

```bash
CURRENT_DIR=$(pwd)
MAIN_WORKTREE=$(git worktree list | head -1 | awk '{print $1}')

if [ "$CURRENT_DIR" = "$MAIN_WORKTREE" ] || [[ "$CURRENT_DIR" == "$MAIN_WORKTREE"* && "$CURRENT_DIR" = "$MAIN_WORKTREE" ]]; then
  echo "GATE FAIL: Running in main workspace ($MAIN_WORKTREE)."
  echo "Evidence must be generated from the feature worktree."
  echo "Run: cd /home/administrator/workspaces/jambu/worktrees/JAMBU-N-{desc}"
  exit 1
fi

ACTIVE_BRANCH=$(git branch --show-current)
echo "GATE PASS: Worktree context verified — branch: $ACTIVE_BRANCH, cwd: $CURRENT_DIR"
```

If this gate fails, STOP. Do not proceed with evidence generation. Navigate to the correct worktree first.

### Step 1 — Configure Recording

Resolve application root from `workspace.target_root` (demo: `examples/astro-blog`):

```bash
TARGET_ROOT=$(python3 -c "import sys; sys.path.insert(0, '.sdlc/bin'); from _sdlc_paths import workspace_target_root; print(workspace_target_root())")
```

Create/update `$TARGET_ROOT/playwright.config.ts` to enable video:

```typescript
use: {
  video: 'on',             // Record every test
  trace: 'on-first-retry',
}
```

If you only want recording for a specific test run (not globally), pass `--project` flag.

### Step 2 — Run Recording Session

Execute tests for each resolution profile:

```bash
# Mobile recording
cd "$TARGET_ROOT" && npx playwright test \
  --project=mobile-chrome \
  --video=on \
  --reporter=html 2>&1

# Tablet recording
cd "$TARGET_ROOT" && npx playwright test \
  --project=tablet \
  --video=on \
  --reporter=html 2>&1

# Desktop recording
cd "$TARGET_ROOT" && npx playwright test \
  --project=chromium \
  --video=on \
  --reporter=html 2>&1
```

### Step 3 — Collect Evidence

Videos are written to `$TARGET_ROOT/test-results/{test-name}/`:

```bash
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
# Use the ticket ID as the directory name (not timestamp) for deterministic paths
# that sdlc-reflect and post-merge upload scripts can locate without discovery
TICKET="${TICKET:-qa-run}"   # e.g. JAMBU-9
EVIDENCE_DIR=".sdlc/evidence/${TICKET}"
mkdir -p "$EVIDENCE_DIR"

# Copy videos for each resolution
for RESOLUTION in mobile-chrome tablet chromium; do
  find "$TARGET_ROOT/test-results" -name "*.webm" -path "*${RESOLUTION}*" \
    -exec cp {} "$EVIDENCE_DIR/${RESOLUTION}-$(basename {})" \;
done

# Copy screenshots
find "$TARGET_ROOT/test-results" -name "*.png" \
  -exec cp {} "$EVIDENCE_DIR/" \;

echo "Evidence stored: $EVIDENCE_DIR"
```

### Step 4 — Generate Evidence Manifest

Create `.sdlc/evidence/{timestamp}-{feature}-manifest.md`:

```markdown
# QA Recording Evidence — {feature} — {timestamp}

## Recordings

| Resolution | File | Status |
|---|---|---|
| Mobile (375×812) | mobile-chrome-*.webm | ✅/❌ |
| Tablet (768×1024) | tablet-*.webm | ✅/❌ |
| Desktop (1280×800) | chromium-*.webm | ✅/❌ |

## Test Results
- Passed: N
- Failed: N
- Skipped: N

## Playwright Report
- HTML: .sdlc/evidence/{timestamp}-playwright-report/

## Accessibility
- WCAG AA violations: N

## Notes
{Any visual regressions or observations from the recordings}
```

### Step 5 — Register in INDEX

Add the evidence entry to `.sdlc/INDEX.md` under the Evidence section.

### Step 6 — Evidence Upload (Post-Merge)

Evidence upload to Plane happens as part of the post-merge `plane-closure` stage in `/sdlc:implement` Step 6.5.
Do NOT upload during QA — files must exist locally and be verified before upload.

The upload script reads `sdlc.yaml qa.evidence_upload_to_plane`. If `true` (default), it executes the 3-step presigned URL flow documented in `plane.yaml api_examples.attach_evidence_*`.

## Using Browser Tool for Live Capture

When Playwright is not applicable (e.g., manual flow validation), use the Cursor browser tool:

1. Open the browser tool at the target URL
2. Navigate through the user flow
3. At each key state, take a screenshot: `browser_take_screenshot`
4. Record the interaction with `browser_take_screenshot` at mobile viewport (set viewport width to 375)
5. Record at tablet viewport (768)
6. Record at desktop viewport (1280)
7. Save all screenshots to `.sdlc/evidence/{TICKET}/`

## Output Assertion

For a QA run to be considered VALID, all three resolutions must have:
- At least one screenshot per key page
- Video recording (or documented reason why recording was skipped)
- Manifest file created and registered in INDEX
- Evidence files located in `.sdlc/evidence/{TICKET}/` **within the active feature worktree**
