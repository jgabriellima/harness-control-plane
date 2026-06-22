# Capability Ready — {query}

Run ID: {run_id}
Date: {date}

Research: `.sdlc/playbooks/.research/{run_id}/report.md`

---

## Provisioned Playbooks

| ID | Version | File |
|---|---|---|
| {pb.id} | {version} | {file} |

---

## What You Must Provide

| Requirement | Why | How |
|---|---|---|
| {name} | {reason} | {setup_instruction} |

Nothing in this list is optional for the capability to function.

---

## Ready to Use

```bash
# Provision into session context packet
python3 .sdlc/bin/sdlc_playbook.py provision --ids {comma_separated_ids}

# Resolve by domain when spec declares domain_tags
python3 .sdlc/bin/sdlc_playbook.py resolve --domain {tags}
```

Skills with matching `domain_tags` in spec will auto-provision via runtime (future wiring).

---

## Not Included (by design)

- Feature implementation plan
- Plane ticket
- Code under `app/`
- Worktree setup

Use `/sdlc:spec` and `/sdlc:implement` for SDLC execution.
