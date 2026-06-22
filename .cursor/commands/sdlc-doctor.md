---
name: sdlc-doctor
description: Validate that the SDLC infrastructure is fully aligned — agent runtime, Plane connection, GitHub Actions, memory files, hooks, and evidence storage. Reports misalignment with remediation steps.
---

# /sdlc:doctor — SDLC Operational Alignment Validator

Validate that the SDLC infrastructure is fully aligned and operational. This command checks the agent runtime, SDLC layer, CI/CD wiring, and evidence storage — not the application inside `{workspace.target_root}`. App-layer concerns (framework, dependencies, tests) are out of scope.

## Usage

```
/sdlc:doctor [--fix] [--mode=structural|operational]
```

[MODES]
structural=default_mid-init|dirs+commands+workflows|no_secret_validation
operational=post_init|structural+active_integration_secrets
[/MODES]

CLI:

```bash
cd .sdlc && npm run doctor:structural
cd .sdlc && npm run doctor:operational
```

`--fix`: remediate all gaps with automated fixes after reporting.

## Execution Protocol

Run ALL checks in order. Do not skip. Aggregate results and output at the end.

---

## Check Group 1: Cursor Runtime Assets

### 1.1 Rules

- [ ] `.cursor/rules/architecture.mdc` exists
- [ ] `.cursor/rules/astro-patterns.mdc` exists
- [ ] `.cursor/rules/frontend-rules.mdc` exists
- [ ] `.cursor/rules/observability.mdc` exists
- [ ] `.cursor/rules/deployment-rules.mdc` exists
- [ ] `.cursor/rules/output-standards.mdc` exists

Failure: `❌ Required Cursor rules missing — agent behavior is underconstrained`

### 1.2 Commands (ADR-024 namespaces)

**`/sdlc:*` lifecycle**

- [ ] `.cursor/commands/sdlc-init.md` exists
- [ ] `.cursor/commands/sdlc-discovery.md` exists
- [ ] `.cursor/commands/sdlc-goal.md` exists
- [ ] `.cursor/commands/sdlc-engspec.md` exists
- [ ] `.cursor/commands/sdlc-spec.md` exists
- [ ] `.cursor/commands/sdlc-plan.md` exists
- [ ] `.cursor/commands/sdlc-feature.md` exists
- [ ] `.cursor/commands/sdlc-implement.md` exists
- [ ] `.cursor/commands/sdlc-deploy.md` exists
- [ ] `.cursor/commands/sdlc-incident.md` exists
- [ ] `.cursor/commands/sdlc-hydrate.md` exists
- [ ] `.cursor/commands/sdlc-handoff.md` exists
- [ ] `.cursor/commands/sdlc-reset.md` exists
- [ ] `.cursor/commands/sdlc-doctor.md` exists
- [ ] `.cursor/commands/sdlc-baseline.md` exists
- [ ] `.cursor/commands/sdlc-reflect.md` exists
- [ ] `.cursor/commands/sdlc-post-deployment.md` exists
- [ ] `.cursor/commands/sdlc-token-health.md` exists
- [ ] `.cursor/commands/sdlc-learn.md` exists
- [ ] `.cursor/commands/sdlc-config.md` exists

**`/run:*` capabilities**

- [ ] `.cursor/commands/run-e2e.md` exists
- [ ] `.cursor/commands/run-browser.md` exists
- [ ] `.cursor/commands/run-cua.md` exists

**Rules**

- [ ] `.cursor/rules/goal-runner-mandate.mdc` exists

Failure: `❌ Required Cursor commands missing`

### 1.3 Agents

- [ ] `.cursor/agents/planner.md` exists
- [ ] `.cursor/agents/implementer.md` exists
- [ ] `.cursor/agents/reviewer.md` exists
- [ ] `.cursor/agents/qa.md` exists
- [ ] `.cursor/agents/deployer.md` exists
- [ ] `.cursor/agents/incident-resolver.md` exists

Failure: `❌ Required agents missing`

### 1.4 Skills

Skills materialize as directory skills per the Agent Skills layout:

| Layout | Path | Example |
|---|---|---|
| Directory (canonical) | `.cursor/skills/{name}/SKILL.md` | `handoff/SKILL.md`, `browser-user/SKILL.md` |

Legacy flat layout (`.cursor/skills/{name}.md`) is deprecated — doctor warns if detected.

Doctor resolves declared `runtime.skills` entries against the directory layout first.

Failure: `❌ Required skill missing — check .cursor/skills/{name}/SKILL.md layout`

### 1.5 Memories

- [ ] `.cursor/memories/architecture.md` exists and is non-empty
- [ ] `.cursor/memories/operational-context.md` exists
- [ ] `.cursor/memories/business-rules.md` exists
- [ ] `.cursor/memories/incidents.md` exists

Failure: `❌ Memory files missing — agent context will degrade across sessions`

### 1.5 Hooks

- [ ] `.cursor/hooks.json` exists and is valid JSON: `python3 -c "import json; json.load(open('.cursor/hooks.json'))"`
- [ ] `.cursor/hooks/session-start.sh` exists and is executable
- [ ] `.cursor/hooks/session-stop.sh` exists and is executable
- [ ] `.cursor/hooks/hook_handler.py` exists
- [ ] `hooks.json` `sessionStart` entry references `session-start.sh`
- [ ] `hooks.json` `stop` entries include both `session-stop.sh` and a `type: "prompt"` entry

Failure: `❌ Hooks misconfigured — handoff persistence and context injection will fail`

---

## Check Group 2: SDLC Layer

### 2.0 Workspace CI Alignment and Gate Declaration (ADR-012)

- [ ] `.sdlc/sdlc.yaml` contains `gates:` section with stage → check IDs
- [ ] `.github/workflows/deploy.yaml` has `working-directory: {workspace.target_root}`
- [ ] `.github/workflows/release.yaml` has `working-directory: {workspace.target_root}`
- [ ] `.github/workflows/dependency-updates.yaml` has `working-directory: {workspace.target_root}`
- [ ] `python3 .sdlc/bin/sdlc_workspace_rebind.py --dry-run --target app` exits 0 when aligned

Run automated check:

```bash
cd .sdlc && npm run doctor:structural 2>&1 | grep -E 'workspace:ci-target-aligned|gates:declared'
```

Failure: `CI workflows reference stale target_root — run sdlc_workspace_rebind.py`

### 2.1 DSL

- [ ] `.sdlc/sdlc.yaml` exists
- [ ] YAML is syntactically valid: `python3 -c "import yaml; yaml.safe_load(open('.sdlc/sdlc.yaml'))"`
- [ ] `.sdlc/INDEX.md` exists

Failure: `❌ SDLC DSL missing or invalid`

### 2.2 Workflows

- [ ] `.sdlc/workflows/goal-flow.yaml` exists
- [ ] `.sdlc/workflows/feature-flow.yaml` exists
- [ ] `.sdlc/workflows/deployment-flow.yaml` exists
- [ ] `.sdlc/workflows/e2e-flow.yaml` exists (trigger: `/run:e2e` — Playwright QA, not orchestration)
- [ ] `.sdlc/workflows/incident-flow.yaml` exists
- [ ] `.sdlc/workflows/bootstrap-flow.yaml` exists

Failure: `❌ Required workflow definitions missing`

### 2.3 Integrations

- [ ] Each provider in `sdlc.yaml` `integrations:` has a matching `.sdlc/integrations/{id}/{id}.yaml`
- [ ] `.sdlc/integrations/github/github.yaml` exists
- [ ] `.sdlc/integrations/plane/plane.yaml` exists

Warning: `⚠ Integration config declared in DSL but file missing`

### 2.4 Handoffs

- [ ] `.sdlc/handoffs/` directory exists
- [ ] `.sdlc/handoffs/LATEST.md` exists

Warning: `⚠ No LATEST.md — session-stop.sh has not fired yet or handoffs directory is missing`

### 2.5 Evidence Storage

- [ ] `.sdlc/evidence/` directory exists

Warning: `⚠ Evidence directory missing — run /run:e2e to create`

### 2.6 Delivery closure (ADR-028)

Operator-facing diagnostics — no code reading required:

```bash
python3 .sdlc/bin/sdlc_delivery.py explain
python3 .sdlc/bin/sdlc_delivery.py validate
```

- [ ] `.sdlc/sdlc.yaml` contains `delivery.default_closure` (default: `local-validated`)
- [ ] `explain` output matches operator intent (which goal-flow nodes RUN vs SKIP)
- [ ] `validate` exits 0, or warnings are acknowledged

Guide: `docs/engineering/delivery-closure.md`

Warning: `⚠ delivery validate warnings — see docs/engineering/delivery-closure.md`

---

## Check Group 3: CI/CD

### 3.1 GitHub Actions

- [ ] `.github/workflows/validate.yaml` exists
- [ ] `.github/workflows/deploy.yaml` exists
- [ ] `.github/workflows/e2e.yaml` exists

Run YAML validation:
```bash
for f in .github/workflows/*.yaml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK: $f" || echo "INVALID: $f"
done
```

Failure: `❌ Required GitHub Actions workflows missing`
Warning: `⚠ {file} contains invalid YAML`

### 3.2 GitHub Actions Workflow Permissions

The `GITHUB_TOKEN` in Actions has read-only permissions by default. Any workflow that
performs write operations — creating issues, opening PRs, pushing branches, adding
reactions — must declare an explicit `permissions:` block. A workflow without it will
fail at runtime with `Resource not accessible by integration`.

For each workflow in `.github/workflows/`:

```bash
python3 - <<'EOF'
import yaml, glob, sys

# Operations that require write permissions and the permission key they need
WRITE_INDICATORS = {
    'issues: write':       ['issues.create', 'issues.createComment', 'reactions.createForIssueComment',
                            'issues.addLabels', 'issues.update'],
    'pull-requests: write': ['pulls.create', 'pulls.update', 'pulls.merge'],
    'contents: write':     ['git.createRef', 'git.createCommit', 'git.updateRef',
                            'repos.createOrUpdateFileContents'],
}

problems = []
for path in sorted(glob.glob('.github/workflows/*.yaml')):
    raw = open(path).read()
    try:
        data = yaml.safe_load(raw)
    except Exception as e:
        continue  # already caught by 3.1

    has_permissions_block = 'permissions:' in raw

    # Detect write operations by scanning for known API method patterns in the raw YAML
    needs_issues_write      = any(op in raw for op in ['issues.create', 'issues.createComment',
                                                        'reactions.createForIssueComment',
                                                        'issues.addLabels'])
    needs_pr_write          = any(op in raw for op in ['pulls.create', 'pulls.update'])
    needs_contents_write    = any(op in raw for op in ['git push', 'git.createRef', 'git commit',
                                                        'git checkout -b', 'createOrUpdateFileContents'])

    required_permissions = []
    if needs_issues_write:      required_permissions.append('issues: write')
    if needs_pr_write:          required_permissions.append('pull-requests: write')
    if needs_contents_write:    required_permissions.append('contents: write')

    if required_permissions and not has_permissions_block:
        problems.append(
            f"  MISSING permissions block in {path}\n"
            f"  Required: {', '.join(required_permissions)}"
        )
    elif required_permissions and has_permissions_block:
        # Verify the specific permissions are present
        missing_perms = [p for p in required_permissions if p not in raw]
        if missing_perms:
            problems.append(
                f"  INCOMPLETE permissions block in {path}\n"
                f"  Missing: {', '.join(missing_perms)}"
            )

if problems:
    print(f"FAIL: {len(problems)} workflow(s) have insufficient permissions:")
    for p in problems:
        print(p)
    sys.exit(1)
else:
    print(f"OK: all {len(list(glob.glob('.github/workflows/*.yaml')))} workflows have sufficient permissions declarations")
EOF
```

Failure: `❌ {workflow} performs write operations but has no permissions: block — will fail with "Resource not accessible by integration" at runtime`

### 3.3 GitHub PAT Scope Validation

The `GITHUB_PERSONAL_ACCESS_TOKEN` must have `repo` and `workflow` scopes for the
gh CLI and MCP server to operate. Missing `workflow` scope blocks `gh workflow run`.

```bash
python3 - <<'EOF'
import subprocess, re, sys

result = subprocess.run(['gh', 'auth', 'status'], capture_output=True, text=True)
output = result.stdout + result.stderr

if 'not logged in' in output.lower() or result.returncode != 0:
    print("FAIL: gh CLI is not authenticated — run: gh auth login")
    sys.exit(1)

# Parse token scopes from gh auth status output
# Format: "- Token scopes: 'gist', 'read:org', 'repo', 'workflow'"
scope_match = re.search(r"Token scopes: (.+)", output)
if not scope_match:
    print("WARN: Could not parse token scopes from gh auth status — verify manually")
    sys.exit(0)

scopes_raw = scope_match.group(1)
scopes = set(re.findall(r"'([^']+)'", scopes_raw))

REQUIRED_SCOPES = {'repo', 'workflow'}
missing = REQUIRED_SCOPES - scopes

if missing:
    print(f"FAIL: GITHUB_PERSONAL_ACCESS_TOKEN missing required scopes: {', '.join(sorted(missing))}")
    print(f"  Current scopes: {', '.join(sorted(scopes))}")
    print("  Regenerate PAT at https://github.com/settings/tokens and add missing scopes")
    sys.exit(1)
else:
    account_match = re.search(r"account (\S+)", output)
    account = account_match.group(1) if account_match else "unknown"
    print(f"OK: PAT authenticated as {account} with required scopes: {', '.join(sorted(scopes))}")
EOF
```

Failure: `❌ PAT missing scope {scope} — gh workflow run and incident-response.yaml will fail`

---

## Check Group 4: Integration Secrets

This check is deterministic. For every file matching `.sdlc/integrations/*/` that contains a `secrets_required:` block, extract each entry and validate credential presence based on its `scope`.

### 4.1 Iterate integration files

```bash
python3 - <<'EOF'
import yaml, os, glob, sys

results = []
integration_files = glob.glob('.sdlc/integrations/*/*.yaml')

for path in sorted(integration_files):
    data = yaml.safe_load(open(path))
    integration = data.get('integration', path)
    if data.get('status') == 'DEPRECATED':
        print(f"SKIP [{integration}] — DEPRECATED (see {data.get('deprecated_by', 'replacement')})")
        continue
    secrets = data.get('secrets_required', [])
    for s in secrets:
        env_var = s['env_var']
        scope = s.get('scope', 'both')
        required = s.get('required', True)
        present_locally = env_var in os.environ and bool(os.environ[env_var])
        results.append({
            'integration': integration,
            'env_var': env_var,
            'scope': scope,
            'required': required,
            'present_locally': present_locally,
        })

for r in results:
    local_status = '✅' if r['present_locally'] else ('❌' if r['required'] and r['scope'] in ('local', 'both') else '⚠')
    print(f"{local_status} [{r['integration']}] {r['env_var']} (scope={r['scope']}, local={'set' if r['present_locally'] else 'MISSING'})")
EOF
```

### 4.2 CI secrets (GitHub Actions)

For integrations where `scope` is `ci` or `both`, verify secrets are registered in GitHub Actions:

```bash
gh secret list 2>/dev/null | awk '{print $1}' > /tmp/gh_secrets.txt
python3 - <<'EOF'
import yaml, glob

integration_files = glob.glob('.sdlc/integrations/*/*.yaml')
with open('/tmp/gh_secrets.txt') as f:
    gh_secrets = set(line.strip() for line in f if line.strip())

for path in sorted(integration_files):
    data = yaml.safe_load(open(path))
    integration = data.get('integration', path)
    for s in data.get('secrets_required', []):
        env_var = s['env_var']
        scope = s.get('scope', 'both')
        required = s.get('required', True)
        if scope not in ('ci', 'both'):
            continue
        present_ci = env_var in gh_secrets
        status = '✅' if present_ci else ('❌' if required else '⚠')
        print(f"{status} [{integration}] {env_var} (CI secret: {'registered' if present_ci else 'MISSING'})")
EOF
```

If `gh` is not authenticated or the command fails:
- Report `⚠ GitHub CLI not authenticated — CI secret validation skipped`
- Continue with local checks

### 4.3 Failure / Warning conditions

- `❌` if a `required: true` secret with `scope: local` or `scope: both` is not present in local environment
- `❌` if a `required: true` secret with `scope: ci` or `scope: both` is absent from GitHub Actions secrets (when gh CLI is available)
- `⚠` if a `required: false` secret is missing (degraded functionality expected)
- `⚠` if gh CLI is unavailable — CI secret validation is skipped, must be verified manually

Failure: `❌ Required integration secret missing — {integration}.{env_var} not set (scope: {scope})`
Warning: `⚠ Optional integration secret not set — {integration}.{env_var}`

---

## Check Group 5: Baseline Drift

Validates downstream baseline tag integrity (ADR-014) and detects uncommitted structural
changes not yet captured in `sdlc_baseline_tag`. Includes `packages/**` in the authoring
monorepo only — distributable build artifact, not a separate baseline layer.

### 5.0 Verify baseline tag exists

When `status: operational`, `baseline.sdlc_baseline_tag` SHOULD point to an existing local git tag when set. **Missing tag is a warning** after init (ADR-029) — run `/sdlc:baseline` when ready; not required to complete `/sdlc:init`.

```bash
python3 - <<'EOF'
import subprocess, sys, yaml

with open('.sdlc/sdlc.yaml') as f:
    sdlc = yaml.safe_load(f)

status = sdlc.get('status', 'operational')
baseline = sdlc.get('baseline') or {}
tag = baseline.get('sdlc_baseline_tag')

if status != 'operational':
    print(f"SKIP: status={status} — baseline tag not required yet")
    sys.exit(0)

if not tag:
    print("WARN: status=operational but baseline.sdlc_baseline_tag is null")
    print("  → Optional: /sdlc:baseline when ready (not part of /sdlc:init — ADR-029)")
    sys.exit(1)

result = subprocess.run(['git', 'rev-parse', tag], capture_output=True, text=True)
if result.returncode != 0:
    print(f"FAIL: git tag not found: {tag}")
    print(f"  → Run: python3 .sdlc/bin/sdlc_baseline.py verify")
    sys.exit(1)

print(f"OK: {tag} → {result.stdout.strip()}")
EOF
```

Automated check (runtime-alignment.ts Group 14):

```bash
cd .sdlc && npm run doctor:operational 2>&1 | grep -E 'baseline:sdlc_baseline_tag'
```

Failure conditions:

- `⚠` if `status: operational` and `sdlc_baseline_tag` is null — run `/sdlc:baseline` when ready (optional after init)
- `❌` if tag is set but `git rev-parse $TAG` fails — tag missing from git history
- Skip when `status: uninitialized` — baseline not created until operator runs `/sdlc:baseline`

### 5.1 Collect candidate files

```bash
SDLC_TAG=$(grep 'sdlc_baseline_tag:' .sdlc/sdlc.yaml | awk -F'"' '{print $2}')
echo "SDLC baseline tag: $SDLC_TAG"
git status --short
```

### 5.2 Filter against structural path patterns

Apply the classification table from `/sdlc:baseline` Classification Rules.

```bash
python3 - <<'EOF'
import subprocess, re

STRUCTURAL_PATTERNS = [
    r'^\.cursor/rules/.*\.mdc$',
    r'^\.cursor/commands/.*\.md$',
    r'^\.cursor/skills/.*\.md$',
    r'^\.cursor/agents/.*\.md$',
    r'^\.cursor/hooks\.json$',
    r'^\.cursor/hooks/.*\.(sh|py)$',
    r'^\.github/workflows/.*\.yaml$',
    r'^scripts/hooks/',
    r'^scripts/.*\.sh$',
    r'^\.sdlc/bin/',
    r'^\.sdlc/context/decisions/ADR-.*\.md$',
    r'^\.sdlc/INDEX\.md$',
    r'^\.sdlc/sdlc\.yaml$',
    r'^\.sdlc/templates/',
    r'^\.sdlc/workflows/.*\.yaml$',
    r'^\.sdlc/integrations/.*\.yaml$',
    r'^\.sdlc/doctor/.*\.ts$',
    r'^\.sdlc/pipeline/',
    r'^\.sdlc/playbooks/',
    r'^\.sdlc/schemas/',
    r'^packages/',
    r'^README\.md$',
    r'^examples/README\.md$',
]

result = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
drift = []
for line in result.stdout.splitlines():
    status = line[:2].strip()
    path = line[3:].strip()
    if 'node_modules' in path or path.endswith('.tsbuildinfo'):
        continue
    if any(re.match(p, path) for p in STRUCTURAL_PATTERNS):
        drift.append((status, path))

if drift:
    print(f"⚠ BASELINE DRIFT — {len(drift)} structural file(s) not in baseline:")
    for status, path in drift:
        print(f"  [{status}] {path}")
    print("Run /sdlc:baseline to capture these changes.")
else:
    print("✅ No baseline drift — working tree clean of uncommitted structural changes")
EOF
```

### 5.3 Failure / Warning conditions

- `⚠` if `status: operational` and `baseline.sdlc_baseline_tag` is null
- `❌` if `sdlc_baseline_tag` is set but `git rev-parse $TAG` fails
- `⚠` if any structural file is modified, staged, or untracked and not covered by `sdlc_baseline_tag`
- Drift alone is not a blocker — resolve before the next reset

Warning: `⚠ Baseline tag not set — optional; run /sdlc:baseline when ready to snapshot harness.`
Warning: `⚠ Baseline drift — {N} structural file(s) uncommitted. Run /sdlc:baseline.`

---

## Check Group 6: Directory Index Coverage

Validates the **Directory Index Mandate** from `.cursor/rules/architecture.mdc`.
Every agent-navigable directory MUST have a `README.md` that lists all files with their role and trigger.
Two sub-checks: (a) README existence, (b) README completeness — no file in the directory is absent from the README.

### 6.1 Required directory indices exist

```bash
python3 - <<'EOF'
import os, sys

REQUIRED = {
    '.github/README.md':           '.github/  — GitHub Actions workflow registry',
    '.cursor/commands/README.md':  '.cursor/commands/  — slash command registry',
    '.cursor/agents/README.md':    '.cursor/agents/  — agent protocol index',
    '.cursor/rules/README.md':     '.cursor/rules/  — Cursor rule registry',
    '.cursor/skills/README.md':    '.cursor/skills/  — project skill registry',
    'scripts/README.md':           'scripts/  — script registry',
}

missing = []
for path, description in REQUIRED.items():
    if os.path.isfile(path):
        print(f'OK  {path}')
    else:
        print(f'MISSING  {path}  ({description})')
        missing.append(path)

if missing:
    print(f'\n⚠ DIRECTORY INDEX GAPS: {len(missing)} required README(s) missing')
    sys.exit(2)   # exit 2 = warnings (not hard failure)
else:
    print('\n✅ All required directory indices exist')
EOF
```

Warning: `⚠ {path} missing — agents navigating this directory will rely on grep/glob, burning context window`

### 6.2 Index completeness — all directory files are referenced

For each directory that has an existing README, verify that every file currently present in that directory is mentioned at least once in the README text. A file not referenced in the index is invisible to an agent that reads only the index.

```bash
python3 - <<'EOF'
import os, glob

INDEXED_DIRS = {
    '.github':           '.github/README.md',
    '.cursor/commands':  '.cursor/commands/README.md',
    '.cursor/agents':    '.cursor/agents/README.md',
    '.cursor/rules':     '.cursor/rules/README.md',
    '.cursor/skills':    '.cursor/skills/README.md',
    'scripts':           'scripts/README.md',
}

total_gaps = 0
for directory, readme_path in INDEXED_DIRS.items():
    if not os.path.isfile(readme_path):
        continue  # existence already reported in 6.1

    readme_content = open(readme_path).read()
    dir_files = [
        os.path.basename(f)
        for f in glob.glob(f'{directory}/*')
        if os.path.isfile(f) and not os.path.basename(f).startswith('.')
    ]
    unindexed = [f for f in dir_files if f not in readme_content]

    if unindexed:
        print(f'⚠  {readme_path} does not reference: {", ".join(unindexed)}')
        total_gaps += len(unindexed)
    else:
        print(f'OK  {readme_path} — all {len(dir_files)} file(s) referenced')

if total_gaps:
    print(f'\n⚠ INDEX COMPLETENESS: {total_gaps} file(s) not referenced in their directory index')
else:
    print('\n✅ All directory indices are complete')
EOF
```

Warning: `⚠ {file} exists in {directory} but is not referenced in {readme} — index is stale`

### 6.3 Fix protocol (activated by `--fix`)

For each missing or incomplete index, perform in order:

**If README does not exist:** generate it from directory contents.

```bash
# Example: .cursor/agents/README.md
python3 - <<'PYEOF'
import os, glob

def stub_readme(directory, purpose, files):
    rows = '\n'.join(
        f'| [`{os.path.basename(f)}`]({os.path.basename(f)}) | — | — | — |'
        for f in sorted(files)
    )
    return f"""# {directory}/ — {purpose}

> Auto-generated stub by /sdlc:doctor --fix. Replace each `—` with accurate role, trigger, and dependency information.

Cross-reference: [`.sdlc/INDEX.md`](../.sdlc/INDEX.md)

---

## File Inventory

| File | Role | Trigger / Entry Point | Key Dependencies |
|---|---|---|---|
{rows}
"""

STUBS = {
    '.cursor/commands': ('Slash command registry — what each command does and when to invoke it',
                         '.cursor/commands/README.md'),
    '.cursor/agents':   ('Agent protocol index — which agent handles which lifecycle phase',
                         '.cursor/agents/README.md'),
    '.cursor/rules':    ('Cursor rule registry — scope and purpose of each rule file',
                         '.cursor/rules/README.md'),
    '.cursor/skills':   ('Project skill registry — available skills and invocation conditions',
                         '.cursor/skills/README.md'),
    'scripts':          ('Script registry — what each script does, when to call it, side effects',
                         'scripts/README.md'),
}

for directory, (purpose, readme_path) in STUBS.items():
    if os.path.isfile(readme_path):
        continue
    files = [f for f in glob.glob(f'{directory}/*') if os.path.isfile(f)]
    content = stub_readme(directory, purpose, files)
    with open(readme_path, 'w') as out:
        out.write(content)
    print(f'CREATED stub: {readme_path} ({len(files)} file(s) listed)')
PYEOF
```

**If README exists but has unindexed files:** append missing rows to the inventory table.

After generating stubs, the agent MUST review each stub and replace the `—` placeholders with accurate role, trigger, and dependency information before committing. Stubs are scaffolding, not finished indices.

**After fix:** re-run checks 6.1 and 6.2 to confirm all gaps resolved.

---

## Check Group 7: Context Budget (audit only)

Detects hydration-dominant bloat. **Does not fix** — remediation is `/sdlc:token-health --fix`.

### 7.0 Automated audit

```bash
python3 .sdlc/bin/sdlc_context_optimize.py audit --json
```

Thresholds: `context_budget` in `.sdlc/sdlc.yaml`.

[SIGNALS]
always_injected_tokens_over_budget→.cursor/memories/*.md too large
INDEX_section_over_limit→archive terminal rows
compressible_memories→markdown_tables→bracket_notation
[/SIGNALS]

### 7.1 Remediation (token-health, not doctor)

```bash
python3 .sdlc/bin/sdlc_token_health.py --fix
```

Preview without writes: `python3 .sdlc/bin/sdlc_context_optimize.py fix --dry-run`

Warning: `⚠ context budget exceeded — run /sdlc:token-health --fix`

---

## Output Format

```
SDLC Doctor Report — {timestamp}
================================================

Group 1: Cursor Runtime Assets        {✅ OK | ❌ N errors | ⚠ N warnings}
Group 2: SDLC Layer                   {✅ OK | ❌ N errors | ⚠ N warnings}
Group 3: CI/CD                        {✅ OK | ❌ N errors | ⚠ N warnings}
  3.1 Workflow files exist            {✅ OK | ❌}
  3.2 Workflow permissions blocks     {✅ OK | ❌ N missing}
  3.3 PAT scopes (repo, workflow)     {✅ OK | ❌ missing: {scopes}}
Group 4: Integration Secrets          {✅ OK | ❌ N errors | ⚠ N warnings}
Group 5: Baseline Drift               {✅ OK | ⚠ N warnings}
Group 6: Directory Index Coverage     {✅ OK | ⚠ N missing | ⚠ N stale}
  6.1 Required READMEs exist         {✅ OK | ⚠ missing: {paths}}
  6.2 Index completeness             {✅ OK | ⚠ N unindexed files}
Group 7: Context Budget               {✅ OK | ⚠ N warnings}
  7.0 Hydration audit (notify only)  {✅ OK | ⚠ over budget → /sdlc:token-health --fix}

TOTAL: {N} errors, {N} warnings

Blockers:
  ❌ {description} — remediation: {action}

Warnings:
  ⚠ {description} — remediation: {action}

Overall Status: {✅ HEALTHY | ⚠ DEGRADED | ❌ CRITICAL}
```

If `--fix` was passed, attempt automated remediation of all ⚠ warnings and ❌ errors that have automated fixes available. For Group 6 gaps specifically: generate stub READMEs for missing indices, then prompt the agent to fill in accurate role/trigger/dependency information before committing. **Group 7 context warnings are notify-only** — direct the operator to `/sdlc:token-health --fix`.
