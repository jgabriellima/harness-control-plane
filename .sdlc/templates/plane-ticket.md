# Plane Ticket Standard

## Language and Tone

Every ticket is an engineering contract. It defines what must be built, how correctness
is verified, and what the implementation strategy is. Accordingly:

- No emojis. No decorative symbols.
- Technical language throughout. Precision over readability.
- Acceptance criteria are verifiable invariants, not descriptions of intent.
- Technical Notes IS the implementation plan — vertical, end-to-end.
- Every ticket must be implementable without a follow-up conversation.

---

## Title Format

```
[Imperative verb] [object] — [scope qualifier if needed]
```

Good:
- "Configure site identity metadata in consts.ts and BaseHead component"
- "Implement tag-based post filtering with URL query parameter persistence"
- "Add Sentry error boundary to BlogPost layout for uncaught rendering failures"

Bad:
- "Blog stuff"
- "Fix the issue"
- "Feature request: search"
- "Update some files"

---

---

## Required QA contract (YAML — ADR-029)

Every ticket must include this block on the work item (local YAML or Plane-equivalent fields). Spec-flow and `register-ticket` **hard-fail** without it.

```yaml
qa_surface: browser   # browser | headless — choose one; do not infer from workspace.profile
validation_checks:    # required when qa_surface=headless; omit or empty for browser
  - name: pytest
    cmd: [python3, -m, pytest, -q]
```

Pass the same values to manifest registration:

```bash
python3 .sdlc/bin/sdlc_workflow_manifest.py register-ticket \
  --run-id <run_id> --ticket JAMBU-N --qa-surface browser
```

---

## Description Template (HTML for Plane API — no emojis)

```html
<h2>Objective</h2>
<p>
  {1-2 sentence technical description of what must be implemented and the
  engineering rationale. State the exact system change, not the user benefit.}
</p>

<h2>Background</h2>
<p>
  {Technical context: what exists today, what is wrong or missing, what triggered
  this ticket. Reference prior tickets as JAMBU-N. Reference ADRs if applicable.}
</p>

<h2>Acceptance Criteria</h2>
<p>
  Each criterion is an independently verifiable invariant. All criteria must pass
  before the PR is mergeable. Written in Given/When/Then format.
</p>
<ul>
  <li>
    <strong>AC-1:</strong>
    Given {precise system state},
    when {exact user or system action},
    then {observable, measurable outcome — include specific values where possible}.
  </li>
  <li>
    <strong>AC-2:</strong>
    Given {state}, when {action}, then {outcome}.
  </li>
</ul>
<p><strong>Explicitly out of scope:</strong> {list items this ticket does not cover}</p>

<h2>Technical Notes</h2>
<p>
  This section has two layers. Both are mandatory. An agent reading this ticket
  must internalize both before writing a single line of code.
</p>

<h3>Layer 1 — Implementation plan (what and how)</h3>
<p>Vertical path from entry point to observable output. End-to-end. No horizontal stubs.</p>
<ul>
  <li>
    <strong>Entry point:</strong>
    {The first file to touch and why — follows the data or request path top-down}
  </li>
  <li>
    <strong>Data model changes:</strong>
    {TypeScript interface changes, content schema changes, or "none"}
  </li>
  <li>
    <strong>Implementation path:</strong>
    {Files to modify in order, each with a one-line description of the change.
    Example: src/consts.ts — update SITE_TITLE and SITE_DESCRIPTION string constants}
  </li>
  <li>
    <strong>Side effects and dependencies:</strong>
    {What else breaks or must change as a result. Other components, RSS feed, sitemap, etc.}
  </li>
  <li>
    <strong>Architecture constraints:</strong>
    {Constraints from .cursor/rules/ that apply. TypeScript strict. Tailwind only. Etc.}
  </li>
  <li>
    <strong>Breaking change:</strong> Yes / No — {reason if yes}
  </li>
</ul>

<h3>Layer 2 — Cognitive reinforcement (how to reason about correctness)</h3>
<p>
  This layer exists to prevent cognitive drift: the tendency to substitute
  "the code looks right" for "the output is correct". Read it before implementation.
  It defines the mental frame for this specific task type.
</p>
<ul>
  <li>
    <strong>Primary drift risk:</strong>
    {The most common way an agent (or engineer) incorrectly declares this task done.
    Be specific. Example: "declaring visual fidelity PASS based on color token values
    in code rather than measured computed styles in the rendered page"}
  </li>
  <li>
    <strong>Reasoning frame:</strong>
    {The mental model to apply. How should the agent think about this class of problem?
    Example: "treat this as a measurement task, not a construction task —
    the deliverable is a score ≥ threshold, not a component that imports the correct hex value"}
  </li>
  <li>
    <strong>Success defined as (measured, not assumed):</strong>
    {Exactly what observable output constitutes completion, and how it is measured.
    Not 'implement X' but 'X is confirmed when [specific observable assertion] returns [specific value]'.
    Example: "body background is rgb(11,20,22) via getComputedStyle on the live rendered page at 1280px,
    not via code inspection"}
  </li>
  <li>
    <strong>Invariants that must not be violated:</strong>
    {Which ADRs, workflow contracts, or architectural rules apply here and would be silently
    broken by the path of least resistance. Example: "ADR-009 — orchestrator must not write
    app/ code; this ticket must be executed inside its worktree by the Implementer subagent"}
  </li>
  <li>
    <strong>Stop condition:</strong>
    {Exact state of the world at which the agent stops and hands off. Not 'when done' but
    'when [specific artifact] exists at [specific path] and [specific assertion] returns [value]'.
    Example: ".sdlc/evidence/JAMBU-N/manifest.md exists, visual_fidelity_score ≥ 0.80 in manifest,
    PR URL recorded — then and only then hand off"}
  </li>
</ul>

<h2>QA Requirements</h2>
<ul>
  <li>
    <strong>QA surface (required):</strong>
    <code>browser</code> — UI change; Playwright + viewport screenshots.
    <code>headless</code> — API/library/CLI; pytest/log evidence only (no fake PNGs).
  </li>
  <li>
    <strong>Validation checks (required when headless):</strong>
    YAML on ticket — <code>validation_checks: [{name, cmd}, ...]</code>
    e.g. <code>pytest</code> → <code>[python3, -m, pytest, -q]</code>
  </li>
  <li><strong>E2E tests:</strong> {Which test files must be created or updated. Name the spec file.}</li>
  <li><strong>Accessibility (browser only):</strong> WCAG 2.1 AA — {which pages to scan}</li>
  <li><strong>Recordings (browser only):</strong> {Yes/No} — mobile 375px, tablet 768px, desktop 1280px</li>
  <li><strong>Performance regression check:</strong> {Yes/No — Lighthouse on affected pages}</li>
  <li><strong>Evidence path:</strong> .sdlc/evidence/JAMBU-{N}/</li>
</ul>

<h2>References</h2>
<ul>
  <li><strong>Spec:</strong> {.sdlc/specs/JAMBU-N-sdlc-feature.md or "none"}</li>
  <li><strong>ADR:</strong> {.sdlc/context/decisions/ADR-NNN.md or "none"}</li>
  <li><strong>Related tickets:</strong> {JAMBU-N or "none"}</li>
  <li><strong>Sentry issue:</strong> {URL or "none"}</li>
</ul>
```

---

## Priority Mapping

| Engineering Severity | Plane Priority | Criteria |
|---|---|---|
| P1 | urgent | Production degraded; data loss risk; zero-user-path broken |
| P2 | high | Significant user-facing regression; revenue path affected |
| P3 | medium | Standard feature work; non-critical bugs |
| P4 | low | Cosmetic issues; minor improvements; cleanup |

---

## State Lifecycle

```
Todo → In Progress → Done
```

Transitions are automated by the SDLC:
- Worktree created → In Progress
- PR merged and deployed → Done
- Abandoned or WNF → Cancelled

---

## Validation Checklist (before submitting to Plane)

- [ ] Title is an imperative technical phrase, no emojis
- [ ] Objective states the system change, not the user story
- [ ] Minimum 2 acceptance criteria in Given/When/Then format
- [ ] Out of scope is explicitly listed
- [ ] Technical Notes contains the full vertical implementation path
- [ ] QA contract YAML block present (`qa_surface`; `validation_checks` when headless)
- [ ] QA requirements name specific test files
- [ ] Priority reflects actual engineering severity
