# Playbook Research Report

Run ID: {run_id}
Query: {query}
Date: {date}
Status: DRAFT | GATE_PASSED

---

## Capability Targets

| Target ID | Domain | Description |
|---|---|---|
| {target_id} | {domain_tags} | {one_line_scope} |

---

## Sources

Minimum 2 per target. At least one MUST be official vendor documentation.

| # | Target | Type | URL | Accessed | Notes |
|---|---|---|---|---|---|
| 1 | {target_id} | official | {url} | {date} | |

Types: `official` | `changelog` | `production-ref` | `codebase-local`

---

## Decision Log

One winning choice per row. No "acceptable alternatives" in playbook-bound decisions.

| Decision | MUST choice | Rationale | Source # | Rejected |
|---|---|---|---|---|
| SDK selection | {single_choice} | {why} | 1 | {B}: {reason}; {C}: {reason} |

---

## Rejected Alternatives (audit only — not copied to playbook)

### {Alternative name}

- Why rejected: {reason}
- Source: #{n}

---

## MUST / MUST NOT

### MUST

- {non-negotiable requirement}

### MUST NOT

- {forbidden pattern}

---

## User Prerequisites (preview for F3)

| Requirement | Why | Provided by |
|---|---|---|
| {ENV_VAR} | {reason} | user |

---

## Gate Checklist

- [ ] min 2 sources per target
- [ ] official docs per target
- [ ] decision log complete (no empty MUST choice)
- [ ] rejected alternatives documented
- [ ] no plan language ("consider", "you could", "alternatively")
