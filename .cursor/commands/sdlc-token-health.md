---
name: sdlc-token-health
description: Audit token consumption across SDLC instruction files. Flags outliers, detects duplication. --html and --canvas emit rev3 report artifacts. --fix applies bracket compression to RED/ORANGE files.
---

# /sdlc:token-health — Agent Instruction Token Budget Auditor

Measures token consumption for every file that an agent loads as instruction context: rules, commands, agents, skills, memories, workflows, and templates. Identifies distribution outliers, cross-file duplication, and instruction density ratios. Produces a risk-ranked report. With `--fix`, applies lossless compression to flagged files.

## Core Premise

Agent instruction files do not need to be human-readable prose. Language models process bracket notation, YAML KV pairs, arrow chains, and dense structured formats with equal or better fidelity to verbose markdown — at 38–65% fewer tokens per file in this corpus.

Every excess token in an instruction file is context window consumed at inference time, every session, by every agent that loads that file. The primary offenders in order of token waste:

1. **Markdown tables** — `|---|---|` separator rows, pipe delimiters, and padding spaces contribute zero semantic signal. A 5-column table with 10 rows costs ~80 tokens in pipes+spaces alone.
2. **Prose preambles** — "This command validates that the SDLC infrastructure is fully aligned" before the actual content. The content demonstrates the constraint; the description of it is redundant.
3. **Redundant constraint restatement** — Rules already declared in `output-standards.mdc` or `architecture.mdc` repeated verbatim in every file that references them.
4. **Markdown headers as section labels** — `## Active Work Items (Plane)` when `[ACTIVE_WORK]` carries the same semantic at half the token cost.

**Format contract for SDLC instruction files:**

```
[SECTION_NAME]           → context block open (replaces ## Header + table/prose)
key=value                → assignment (replaces | col | col | rows)
path→purpose             → arrow = "path resolves to purpose" (replaces verbose description)
a→b→c                    → workflow chain (replaces numbered step list)
key=NEVER                → hard constraint (replaces "- Do NOT X" bullets)
[/SECTION_NAME]          → context block close (optional when next [BLOCK] is unambiguous)
```

Human readability is NOT a goal for these files. The primary consumer is an LLM. The secondary consumer is an engineer who can read structured KV format without prose scaffolding.

## Usage

```
/sdlc:token-health [--html] [--canvas] [--fix] [--scope=<path>] [--threshold=<σ_multiplier>]
```

Entry point (always):

```bash
python3 .sdlc/bin/sdlc_token_health.py [flags]
```

| Flag | Effect |
|---|---|
| *(none)* | Bracket-notation report on stdout |
| `--html` | Write `.sdlc/sdlc-token-health.html` (print-ready, rev3 layout) |
| `--canvas` | Write `~/.cursor/projects/.../canvases/sdlc-token-health.canvas.tsx` |
| `--html` + `--canvas` | Both artifacts from same audit bundle (single source of truth) |
| `--html-out=<path>` | Override HTML destination |
| `--canvas-out=<path>` | Override canvas destination |
| `--fix` | Compress RED/ORANGE files after report (`*.pre-fix.bak`) |
| `--scope=<path>` | Limit corpus scan |
| `--threshold=<n>` | RED tier σ multiplier (default `1.5`) |

Recommended sprint cadence: `python3 .sdlc/bin/sdlc_token_health.py --html --canvas`

---

## Load Context Taxonomy (canonical — do not regress)

This invariant was validated against Cursor runtime behavior. **File bytes on disk ≠ LLM context.**

```
always_injected
  scope=.cursor/rules/*.mdc + .cursor/memories/*.md
  measure=sum(raw_token_count) per scope
  report_field=always_injected_raw

Note (session context — NOT a third always_injected tier)
  hook=sessionStart in .cursor/hooks.json
  script=.cursor/hooks/session-start.sh
  injects=stdout JSON field additional_context only
  content=handoff + SDLC status + memory excerpts (variable size per session)

Excluded from always_injected and risk tiers
  hook_handler.py → runtime subprocess (LangSmith trace)
  session-stop.sh → runtime subprocess (handoff stub write)
  rule=never multiply hook source tokens by weight; never label hooks always_injected
```

---

## Artifact Generation (`--html` / `--canvas`)

Implementation: `.sdlc/bin/sdlc_token_health.py` delegates to `.sdlc/bin/token_health_artifacts.py`.

Pipeline:

```
collect_corpus → analyze → classify → detect_duplication → build_audit_bundle
  → [render_report stdout]
  → [--html: render_html → .sdlc/sdlc-token-health.html]
  → [--canvas: render_canvas → IDE canvases path]
```

### HTML print invariants (Chrome)

Violating these causes **missing sections in print preview** (content exists in DOM but is omitted):

- **Never** `page-break-inside: avoid` on `<section>`, tables, or callouts
- Use `avoid-break-small` only on stats row and step rows
- `@media print`: `html, body, .page-wrap { height: auto; overflow: visible }`
- Tables: `break-inside: auto`; repeat `thead` with `display: table-header-group`
- Enable **Background graphics** in browser print dialog for bar fills and row highlights

### Canvas invariants

- Single file: `sdlc-token-health.canvas.tsx` under IDE canvases directory (no subfolders)
- Import only from `cursor/canvas`
- Inline data constants generated from `build_audit_bundle` — same numbers as HTML
- Load context callout matches taxonomy above (always_injected + Note, not parallel tiers)

### INDEX registration

After `--html`, ensure `.sdlc/INDEX.md` `[REPORTS]` lists `sdlc-token-health.html`.

---

## Execution Protocol

[EXECUTION]
entrypoint=python3 .sdlc/bin/sdlc_token_health.py
implementation=.sdlc/bin/sdlc_token_health.py|.sdlc/bin/token_health_artifacts.py|.sdlc/bin/bracket_compress.py|.sdlc/bin/sdlc_context_optimize.py
rule=NEVER_reimplement_pipeline_inline|invoke_bin_only
pipeline=bootstrap_tokenizer→collect_corpus→analyze→classify→detect_duplication→render_report→[write_artifacts]→[run_fix]
[/EXECUTION]

[FIX_PHASES]
phase1=sdlc_context_optimize.run_fix→INDEX_archive|memory_archive|bracket_compress
phase2=RED_ORANGE_corpus→bracket_compress|backup=*.pre-fix.bak
preview=python3 .sdlc/bin/sdlc_context_optimize.py fix --dry-run
[/FIX_PHASES]

---

## Invocation as Cursor Command

When this command is invoked (`/sdlc:token-health`), execute the full pipeline above using the embedded Python scripts assembled sequentially. The execution model is:

```
bootstrap_tokenizer → collect_corpus → analyze_corpus → classify_files → detect_cross_duplication → render_report
  [→ write_artifacts if --html|--canvas] [→ run_fix if --fix]
```

All Python code blocks in Steps 1–8 are assembled into a single in-memory execution context. Run them in order as a coherent script.

**Output destination**: print to stdout. The report is structured as bracket-notation blocks — machine-parseable by subsequent agents and human-readable by engineers.

---

## Risk Register Reference

| Tier | Condition | Action |
|---|---|---|
| RED | `tokens > mean + 1.5σ` OR (`ORANGE` AND `load_context=always_injected`) | Must compress before next sprint |
| ORANGE | `tokens > mean + 0.75σ` | Review — compression recommended |
| GREEN | Within normal band | No action |
| THIN | `tokens < mean - 1.0σ` | Review — may be under-specified |
| DUP:HIGH | Same constraint phrase in ≥2 always_injected files | Consolidate to single authoritative source |
| DUP:MEDIUM | Same constraint phrase in ≥2 files (any load_context) | Consider cross-reference pattern |

---

## Compression Techniques Reference

[COMPRESSION_TECHNIQUES]
markdown_tables→[SECTION]\nkey=value_or_anchor→value reduction=35-45% automated=YES
constraint_bullets→[CONSTRAINT]\nX=NEVER reduction=40-60% automated=YES
arrow_chains→step1→step2→result replaces=numbered_procedural_lists reduction=35-50% automated=PARTIAL
cross_ref_substitution→duplicate_constraints_replaced_with_see_authority_file reduction=10-25% automated=YES
kv_compression→key=value replaces=verbose_prose_assignments reduction=25-40% automated=YES
yaml_anchors→&anchor/*ref replaces=repeated_yaml_blocks reduction=20-35% automated=PARTIAL
preamble_removal→strip_1-2_sentence_orientation_paragraphs reduction=15-30% automated=YES
[/COMPRESSION_TECHNIQUES]

[MANUAL_ONLY_COMPRESSION]
semantic_deduplication=two_files_same_constraint_different_wording→requires_human_judgment_on_authority
spec_pruning=spec_files_with_merged_implementation_detail→archive_or_truncate_to_summary
[/MANUAL_ONLY_COMPRESSION]

---

## Integration with sdlc:doctor

| Command | Role |
|---|---|
| `/sdlc:doctor` | Structural alignment + **context budget detection** (Group 7 warns; does not compress or archive) |
| `/sdlc:token-health` | Token audit across full instruction corpus + **remediation** via `--fix` |

**Workflow:** doctor surfaces `⚠ context budget exceeded` → operator runs `/sdlc:token-health --fix`.

### `--fix` phases (token-health)

**Phase 1 — hydration corpus** (`sdlc_context_optimize.run_fix`):

- Archive terminal INDEX rows → `.sdlc/archive/index/`
- Archive completed memory table rows → `.cursor/memories/archive/`
- Deduplicate ADR table in `architecture.md` (catalog → INDEX `[ADRS]`)
- Bracket-compress tables in memories and directory README indices

**Phase 2 — instruction corpus:**

- Bracket-compress RED/ORANGE tier files (rules, commands, agents, skills, workflows)

Backups: `*.pre-optimize.bak` (phase 1), `*.pre-fix.bak` (phase 2).

Preview phase 1 only: `python3 .sdlc/bin/sdlc_context_optimize.py fix --dry-run`

Recommended cadence: run `token-health` at the start of each sprint cycle, after any new command/rule/agent file is added, and before any major context-window-sensitive operation (multi-agent orchestration, large codebase scans).
