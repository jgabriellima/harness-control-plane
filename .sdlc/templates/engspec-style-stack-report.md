# Style Stack Validation Report

Run ID: {run_id}
Date: {ISO8601}
Workflow: engspec-flow
Gate: engspec-style-stack.pass

---

## Summary

| Metric | Value |
|---|---|
| Required rows | {N} |
| PASS | {N} |
| FAIL | {N} |
| SKIP (conditional) | {N} |
| Overall | PASS \| FAIL |

---

## Core inventory

| Component | Path | Catalog ID | Status | Notes |
|---|---|---|---|---|
| pedagogical-profiles | `.sdlc/playbooks/domains/engineering/pedagogical-profiles.pb.yaml` | pb.engineering.pedagogical-profiles | PASS \| FAIL | |
| architecture-review | `.sdlc/playbooks/domains/docs/architecture-review.pb.yaml` | pb.docs.architecture-review | PASS \| FAIL | |
| visual-enrichment-gate | `.sdlc/playbooks/domains/docs/visual-enrichment-gate.pb.yaml` | pb.docs.visual-enrichment-gate | PASS \| FAIL | |
| architecture-artistry | `.sdlc/playbooks/domains/docs/architecture-artistry.pb.yaml` | pb.docs.architecture-artistry | PASS \| FAIL | |
| output-standards | `.cursor/rules/output-standards.mdc` | rule | PASS \| FAIL | |
| write-docs skill | `~/.cursor/skills/write-docs/SKILL.md` | skill | PASS \| FAIL | |
| plane-ticket template | `.sdlc/templates/plane-ticket.md` | template | PASS \| FAIL | |
| spec template | `.sdlc/templates/spec.md` | template | PASS \| FAIL | |
| ADR template | `.sdlc/templates/ADR-000-template.md` | template | PASS \| FAIL | |
| engspec command | `.cursor/commands/sdlc-engspec.md` | command | PASS \| FAIL | |
| engspec workflow | `.sdlc/workflows/engspec-flow.yaml` | workflow | PASS \| FAIL | |
| engspec skill | `.cursor/skills/engspec/SKILL.md` | skill | PASS \| FAIL | |

---

## Conditional inventory (product shell)

| Component | Path | Required | Status | Notes |
|---|---|---|---|---|
| product-shell-design | `.sdlc/playbooks/domains/docs/product-shell-design.pb.yaml` | yes \| no | PASS \| FAIL \| SKIP | |
| product-shell-engineering | `.sdlc/playbooks/domains/docs/product-shell-engineering.pb.yaml` | yes \| no | PASS \| FAIL \| SKIP | |
| product-shell-visual-gate | `.sdlc/playbooks/domains/docs/product-shell-visual-gate.pb.yaml` | yes \| no | PASS \| FAIL \| SKIP | |
| starlight-shell-engineering | `.sdlc/playbooks/domains/docs/starlight-shell-engineering.pb.yaml` | yes \| no | PASS \| FAIL \| SKIP | |

---

## Learn audit trail

| Run ID | Report path | Status |
|---|---|---|
| learn-20260530-161006 | `.sdlc/playbooks/.research/learn-20260530-161006/report.md` | PASS \| FAIL |
| learn-20260530-234623 | `.sdlc/playbooks/.research/learn-20260530-234623/report.md` | PASS \| FAIL |

---

## Catalog verification

```
python3 .sdlc/bin/sdlc_playbook.py catalog --summary
```

Core playbook ids present in catalog: yes \| no

---

## Remediation (if FAIL)

List each FAIL row with exact missing path or registration action required.
