---
name: work-items-ticket
description: Vendor-neutral ticket creation for spec-flow. Resolves the active work_items provider from sdlc.yaml integration runtime DSL and delegates to the configured ticket skill. Never hardcode plane-ticket or local-ticket in workflows.
---

# Work Items Ticket Skill (DSL resolver)

Workflows invoke **this** skill — not `plane-ticket` or `local-ticket` directly.

## Resolve provider skill from DSL

```bash
python3 -c "
from pathlib import Path
import sys
sys.path.insert(0, '.sdlc/bin')
from sdlc_dsl_bindings import work_items_runtime_bindings, work_items_ticket_skill_ref
import json
print(json.dumps({
    'bindings': work_items_runtime_bindings(Path('.')),
    'ticket_skill_ref': work_items_ticket_skill_ref(Path('.')),
}, indent=2))
"
```

Read `ticket_skill_ref` from the output. Open that file and follow it completely for ticket creation and updates.

## Rules

1. **Never** assume Plane API or `.sdlc/work-items/` paths — the active provider defines storage via integration YAML.
2. **Never** branch on provider id in this skill — only read DSL bindings.
3. Ticket registration on workflow manifest still uses `register-ticket`; uuid contract is provider-specific (auto for `local-work-items` when omitted).
4. `board_surface` in bindings is for UI layers only — trace-ui and dashboards resolve via `work_items_board_surface()`, not hardcoded directories.
5. **ADR-029:** The delegated ticket skill must persist `qa_surface` and (when headless) `validation_checks` on the work item before spec-flow advances. `register-ticket` must receive `--qa-surface` and optional `--validation-checks-json` — both paths hard-fail when the contract is incomplete.

## Failure

If `ticket_skill_ref` is empty, init did not materialize a work_items integration. Run `/sdlc:init` or `/sdlc:config add --provider local-work-items --slots work_items`.
