# Engspec Delivery

Run ID: {run_id}
Date: {ISO8601}
Workflow: engspec-flow
Mode: {run_mode}

---

## Executed

| Node | Status | Primary artifact |
|---|---|---|
| style-provision | completed \| skipped | playbooks provision log |
| style-validate | completed | {style_stack_report_path} |
| classify | completed \| skipped | {mode_decision_path} |
| research | completed \| skipped | {research_report_path} |
| review | completed \| skipped | {review_output_dir} |
| generate | completed \| skipped | {generated_paths} |
| refine | completed \| skipped | {refined_paths} |
| visual-enrichment | completed \| skipped | {assets_dir} |
| index-register | completed \| skipped | INDEX.md rows |
| delivery | completed | this file |

---

## Style stack gate

Outcome: PASS \| FAIL  
Report: {style_stack_report_path}

Playbooks provisioned:

```
{playbooks_provisioned_list}
```

---

## Artifacts

| Artifact | Path |
|---|---|
| style-stack-report | {path} |
| mode-decision | {path} |
| reviewer-plan | {path} |
| arc42-gap-matrix | {path} |
| generated docs | {paths} |

---

## Ready to use

```bash
# Re-validate style stack only
/sdlc:engspec validate

# Resume this run
/sdlc:engspec --resume {run_id}

# Hand off approved spec to implementation
/sdlc:spec <intent from generated spec>
/sdlc:e2e <intent from approved spec>
```

---

## Not Included (by design)

- Feature implementation in `app/` (use `/sdlc:implement` after `/sdlc:e2e`)
- Plane ticket creation (use `/sdlc:spec` when spec is approved for build)
- Worktree setup
- New playbook registration (use `/sdlc:learn` for new domain capabilities)
- Generic session hydration retro-feed
