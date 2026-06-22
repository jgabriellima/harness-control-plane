---
name: write-docs
description: >-
  Enforces strict author-mode discipline for writing technical and architecture
  documents. Use when the user invokes /write-docs or asks to write, draft,
  produce, generate, or update any architecture document, technical spec,
  design doc, whitepaper, or structured technical writing. Prevents
  meta-prompt leakage, dialogue contamination, assumed context, and
  defensive or marketing rhetoric. Supports optional custom instructions,
  image generation, and interactive refinement protocols.
---

# Write Docs

Activates **author mode**: the agent writes the document, full stop.
No meta-commentary, no dialogue bleed, no assumed context, no performance.

---

## Core mandate

When this skill is active, the agent is an author — not an assistant describing
what it is about to write or explaining its reasoning inside the document.

**Every word produced belongs to the document or to explicit interaction
outside it.** There is no middle ground.

---

## Strict writing rules

### 1. No meta-contamination

Never emit inside the document:

- Instructions you received ("As requested...", "Based on our conversation...")
- System or prompt artefacts ("As an AI...", "I was asked to...")
- Conversational fillers carried from chat into prose ("Sure!", "Great question",
  "As I mentioned earlier...")
- Self-references to the writing process ("In this document I will...",
  "I have structured this as...")

If you need to communicate something to the user about the document —
do it **outside** the document, as a separate plain-text note before or after
the artifact. Never contaminate the artifact itself.

### 2. No assumed context

Everything that must be in the document **must appear in the document**.

Do not assume:
- The reader has read a previous conversation
- A concept was explained in chat and therefore does not need to be explained
  in the text
- A section is implied and can be skipped because "we already covered it"

If context belongs in the document, write it. If it does not, omit it entirely.
There is no implicit inheritance from chat history into the artifact.

### 3. No rhetoric contamination

Eliminate from the document:

| Prohibited pattern | Example |
|--------------------|---------|
| Defensive rhetoric | "It should be noted that this approach, while not perfect, attempts to..." |
| Marketing rhetoric | "This powerful, best-in-class architecture delivers unprecedented value..." |
| Excessive hedging | "This might potentially possibly be considered as a way to perhaps..." |
| Apologetic framing | "While this is just a proposal and may need significant refinement..." |
| Filler authority | "Obviously", "Clearly", "It goes without saying", "As we all know" |

Write declaratively. Assert facts, describe decisions, explain trade-offs.
If something is uncertain, say so precisely and once.

### 4. No dialogue bleed

The document is not a chat message. It does not:
- Address the user directly ("you will notice that...", "as you can see...")
- Narrate the writing ("Now let's look at...", "Moving on to...")
- Solicit feedback within the prose ("Feel free to adjust this...",
  "Let me know if this works...")

Exception: technical specifications that explicitly address a reader audience
(e.g., an onboarding guide addressed to "you as the new engineer") are fine —
but this must be a deliberate document design decision, not conversational drift.

### 5. Completeness over speed

Do not publish partial documents with placeholders unless the user explicitly
asked for a skeleton/outline. If a section is not ready, either write it fully
or omit it — do not leave `[TODO]`, `[INSERT HERE]`, or `[...]` markers unless
instructed to do so.

---

## Document structure defaults

When no custom structure is provided, use this default for technical/architecture docs:

```
# Title

## Overview
One-paragraph context: what this is, why it exists, what problem it solves.

## Goals
Bulleted list of explicit objectives. Measurable where possible.

## Non-goals
What is explicitly out of scope. Equally important as goals.

## Architecture / Design
Core technical content. Use sub-sections as needed.

## Key decisions
Decision log: each decision, alternatives considered, rationale chosen.

## Trade-offs and constraints
Explicit acknowledgment of what was sacrificed and why.

## Open questions
Unresolved items. Owner and status if known.

## References
Links, related documents, prior art.
```

Adapt or drop sections based on document type and user instructions.

---

## Custom instructions

If the user provides custom instructions, they override or extend these defaults.

Custom instructions may specify:
- A different document structure or template
- A specific audience (engineers, executives, external partners)
- A tone variant (formal, RFC-style, tutorial-style)
- Sections to add, remove, or rename
- Length targets or density preferences
- Domain-specific terminology constraints

Custom instructions are additive unless they explicitly override a rule above.
The no-contamination, no-assumed-context, and no-rhetoric rules remain active
unless the user explicitly disables them.

---

## Visual assets: images and diagrams

When the document requires diagrams, architecture charts, flow diagrams,
or any visual content:

### Option A — AI-generated image (create-image skill)

Use the `create-image` skill (available globally at
`~/.cursor/skills/create-image/SKILL.md`) to generate images via the
OpenAI Image API. Best for: illustrative visuals, concept art, cover images,
non-technical diagrams.

### Option B — HTML canvas rendered to image

For precise technical diagrams (architecture maps, sequence diagrams, state
machines, data flows, component graphs):

1. Produce a self-contained `.html` file with the diagram rendered via
   SVG, Canvas 2D, or a JS library (Mermaid, D3, Three.js).
2. Render it to a PNG using the browser skill or Playwright.
3. Publish the PNG to `docs/assets/images/<name>.png`.
4. Reference the PNG in the markdown document.

This approach gives pixel-perfect control over technical diagrams without
depending on image generation models.

### When to generate vs. ask

- If the document explicitly calls for a diagram and the content is clear:
  **generate without asking**.
- If the diagram type is ambiguous or the user has a specific tool preference:
  **ask once, then execute**.
- Never generate decorative images speculatively.

---

## Interaction protocol

The default is **silent execution**: receive the request, write the document,
deliver the artifact. Do not narrate, do not ask permission to proceed.

### When to ask before writing

Ask — briefly, in a single message — only when:

1. The scope is genuinely ambiguous (e.g., "write the architecture doc" with
   no prior context and no open files)
2. A critical constraint is missing (target audience, system name, key
   technical parameters)
3. The request contradicts existing documents in the repo in a way that
   requires a decision

When asking: one focused question or a compact list. Not an interview.
Not a form. Get the minimum needed and proceed.

### When to iterate after delivery

After delivering the document, stay in author mode. If the user provides
feedback:
- Apply it directly and re-deliver the affected sections or the full document
- Do not defend prior choices
- Do not explain why the original was written the way it was unless asked

---

## Delivery format

- Deliver the document as a markdown code block or write it directly to the
  target file if a path was specified or can be inferred.
- If writing to a file, confirm the path after writing. Do not repeat the
  full document in chat after writing it.
- If delivering inline, do not add commentary before or after the document
  block unless there is a specific interaction reason (e.g., a question
  for the user, a note about a missing input).

---

## Quick-start checklist

Before delivering the document, verify:

- [ ] No meta-prompts or conversation artefacts in the text
- [ ] No assumed context — everything needed is written
- [ ] No defensive or marketing rhetoric
- [ ] No dialogue bleed into document prose
- [ ] No unresolved placeholders (unless skeleton was requested)
- [ ] Visual assets referenced from `docs/assets/images/`, not scratch dirs
- [ ] Document structure matches request or default template
