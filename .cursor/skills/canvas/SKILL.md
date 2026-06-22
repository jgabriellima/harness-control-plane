---
name: canvas
description: >-
  A Cursor Canvas is a live React app that the user can open beside the chat.
  You MUST use a canvas when the agent produces a standalone analytical artifact
  — quantitative analyses, billing investigations, security audits, architecture
  reviews, data-heavy content, timelines, charts, tables, interactive
  explorations, repeatable tools, or any response that benefits from visual
  layout. Especially prefer a canvas when presenting results from MCP tools
  (PostHog, Playwright, GitHub, etc.) where the data is the deliverable —
  render it in a rich canvas rather than dumping it into a markdown table or
  code block. If you catch yourself about to write a markdown table, stop and
  use a canvas instead. When the user passes --html (or asks for a printable
  version), also emit a self-contained print-ready HTML companion derived from
  the same inline data as the canvas. You MUST also read this skill whenever
  you create, edit, or debug any .canvas.tsx file.
metadata:
  surfaces:
    - ide
---

## Invocation

```
/canvas <topic>
/canvas --html <topic>
/canvas --html --lang pt <topic>
```

[TABLE]
*(none)*→Canvas_only_—_live_React_artifact_beside_chat
`--html`→Canvas_+_print-ready_HTML_companion
`--lang_pt`→HTML_in_pt-BR_(requires_`--html`)._Canvas_stays_English_unless_user_a...
[/TABLE]

## Workspace Canvas Path

Canvases for this project live at:

```
/home/administrator/.cursor/projects/home-administrator-workspaces-jambu-ai-blog/canvases/
```

## Workflow

### 1. Decide whether to use a canvas

The trigger is **user intent**, not response shape. Ask: would the user benefit from viewing this output as its **own standalone artifact**, separate from the chat?

**Use a canvas when the agent produces new standalone analytical output:**
- Architecture and SDLC reviews (sdlc.yaml, ADRs, memory files, handoffs)
- QA evidence summaries (test run results, pass/fail manifests, Playwright traces)
- Deployment state snapshots (version history, rollback status, Cloudflare Pages build log)
- PostHog analytics breakdowns (error rates, session funnel, event volumes)
- Sprint / ticket state reports from Plane
- Tables with more than a handful of rows that the user asked to see

**Do NOT use a canvas when:**
- The user asks for work in a specific tool — "create a Plane ticket" means create the ticket, not a canvas
- The user has a specific deliverable — "fix this component", "write this test", "make this PR"
- The user is working within an existing file — editing a component, updating a rule
- Short factual answers, one-off file edits, or quick clarifying questions

### 2. Write the canvas

**File rules:**
- Exactly one `.canvas.tsx` file per canvas. Never create helper files or style files.
- Import **only** from `cursor/canvas`. No relative imports, no npm packages, no Node built-ins.
- Default-export the top-level component.
- Embed all data inline as typed constants at the top of the file (e.g. `const WORKFLOWS = [...]`). **No `fetch()`, no network calls.** These constants are the single source of truth for both canvas and HTML.

**Never render empty states.** If a section has no data, omit it. If the entire canvas would be empty, ask for the missing data instead of shipping placeholder content.

**Label every plot.** Charts and tables must be self-describing:
- Title naming the specific metric (not "Metrics" — "PostHog error rate by page").
- Axis labels with units on both axes.
- Legend when more than one series is shown.
- Source and time range in a small caption.

**Component discovery:** the full public surface (components, hooks, prop types, tokens) is declared in `~/.cursor/skills-cursor/canvas/sdk/index.d.ts` — read it when you need exact exports or prop shapes. Referencing a non-existent export is the most common runtime error.

### 3. Design guidance

Flat, minimal, purposeful. No gradients, [CONSTRAINT] emojis=NEVER → see output-standards.mdc

**Forbidden patterns:**
- `linear-gradient` / `radial-gradient` / `background-clip: text`
- Emojis as icons, bullets, or status indicators
- `box-shadow` on any element
- Wall of identical Cards — mix open sections with cards
- Rainbow coloring — most elements neutral, accent used sparingly
- Font sizes above H1 (24px)
- Decorative colored borders — borders are structural only

**Visual hierarchy:** primary content gets more space and accent color. Supporting content stays compact. Squint test: blur your eyes — can you tell what matters?

**Pre-delivery self-check:**
1. Does the layout have visual hierarchy? One thing should stand out.
2. Is there variety in the composition? Not just a single column of uniform blocks.
3. Slop check: scan for the forbidden patterns above.

### 4. Introduce the canvas

Add a short note in the chat response:
- **First canvas in session** — one sentence explaining what a canvas is.
- **Unsolicited canvas** — one sentence explaining why canvas over plain text.

### 5. Print HTML companion (`--html`)

When `--html` is present, generate a self-contained HTML file **in the same turn** as the canvas. Do not defer HTML to a follow-up unless the user explicitly asks.

**Single source of truth:** the inline data constants in the `.canvas.tsx` file drive both outputs. Never maintain parallel data in canvas and HTML — translate structure, not re-fetch or re-derive content.

**Output path:**

[TABLE]
`<name>.canvas.tsx`→`.sdlc/<name>.html`
`sdlc-overview.canvas.tsx`→`.sdlc/sdlc-map.html`_(established_convention)
[/TABLE]

With `--lang pt`: append locale suffix → `.sdlc/<name>.pt.html` (e.g. `.sdlc/sdlc-map.pt.html`).

User may override path explicitly (e.g. `--html .sdlc/reports/sprint-3.html`). When unspecified, use defaults above.

**HTML construction:**

1. Read `print-shell.html` in this skill directory for the print CSS and page structure.
2. Copy the `<style>` block verbatim — do not link external stylesheets.
3. Map canvas sections to semantic HTML using the shell's utility classes:

[TABLE]
`H1`_/_`H2`_/_`H3`→`<h1>`_/_`<h2>`_/_`<h3>`
`Text`_(body)→`<p_class="lead">`_or_`<p_class="card-body">`
`Text_tone="secondary"`→`<p_class="muted">`
`Table`→`<table>`_with_`<thead>`_/_`<tbody>`
`Stat`→`.stats-row`_>_`.stat`_>_`.stat-value`_+_`.stat-label`
`Pill`→`.pill`_(+_`.pill-ok`,_`.pill-warn`,_`.pill-info`,_`.pill-danger`)
`Card`→`.card`_(+_`.card-accent`_for_emphasis)
`Callout`→`.callout`_>_`.callout-title`_+_`<p>`
`Grid_columns={2}`→`.grid-2`
`Grid_columns={3}`_(lifecycle)→`.grid-3-lifecycle`_(third_child_spans_full_width)
`Grid_columns={4}`→`.grid-4`_(renders_as_2×2)
Code_/_paths→`<code_class="mono">`
Constraint_rows→`.constraint-grid`_>_`.constraint-item`
Step_sequences→`.step-row`_>_`.step-num`_+_`.step-body`
Tree_diagrams→`.tree`_>_`.tree-root`_/_`.tree-child`
[/TABLE]

4. Set `<html lang="en">` or `lang="pt-BR"` per `--lang`.
5. Add `@media print` page breaks: `.page-break` before major sections that overflow A4 (match canvas section boundaries).
6. Wrap each logical section in `.no-break` when it must not split across pages (cards, small tables).

**Translation rules (`--lang pt`):**
- Translate narrative text, section headings, table column headers, and pill labels.
- Keep brand terms, product names, agent names, slash commands, hook event names, constraint rule identifiers, file paths, and JSON return values in English.
- Preserve **AI-Native SDLC** verbatim in titles and footers.

**Post-generation:**
- Register new HTML files under `.sdlc/` in `.sdlc/INDEX.md` immediately.
- Tell the user both file paths: canvas (interactive) and HTML (print via Ctrl+P).

**Reference implementations:**
- Canvas: `canvases/sdlc-overview.canvas.tsx`
- HTML EN: `.sdlc/sdlc-map.html`
- HTML PT: `.sdlc/sdlc-map.pt.html`

## Troubleshooting

If the canvas appears blank, the most common cause is an incorrect file path. Re-save to the workspace canvases path above. The canvas server writes a `<name>.canvas.status.json` sidecar after each build with `status`, `diagnostics`, or `error` fields — read it if the canvas fails to render.

## Good example

```tsx
import { Divider, Grid, H1, H2, Stack, Stat, Table, Text } from 'cursor/canvas';

const TICKETS = [
  ["JAMBU-12", "Dark mode toggle", "Done", "agent"],
  ["JAMBU-13", "PostHog error rate alert", "In Progress", "agent"],
];

export default function SprintOverview() {
  return (
    <Stack gap={20}>
      <H1>Sprint 3 — Ticket State</H1>
      <Grid columns={3} gap={16}>
        <Stat value="8" label="Total" />
        <Stat value="5" label="Done" tone="success" />
        <Stat value="2" label="In Progress" tone="warning" />
      </Grid>
      <Divider />
      <H2>Ticket Breakdown</H2>
      <Table headers={["ID", "Title", "State", "Assignee"]} rows={TICKETS} />
    </Stack>
  );
}
```

## Bad example — do not imitate

```tsx
// BAD — every section in Card, no hierarchy, Table boxed for no reason
<Stack gap={12}>
  <Card><CardHeader>Summary</CardHeader><CardBody><Text>8 tickets.</Text></CardBody></Card>
  <Card><CardHeader>Tickets</CardHeader><CardBody><Table headers={[...]} rows={[...]} /></CardBody></Card>
</Stack>
```

```tsx
// BAD — --html requested but data defined only inside JSX, not as top-level constants
export default function Map() {
  return <Table rows={[["spec", "/sdlc:spec"]]} />; // HTML companion cannot reuse this
}
```
