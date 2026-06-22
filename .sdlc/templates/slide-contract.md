# Slide Contract — {DECK_NAME}

| Field | Value |
|---|---|
| Deck | {DECK_NAME} |
| Viewport | {DECK_WIDTH}x{DECK_HEIGHT} |
| Flexibility | {strict \| relaxed} |
| Reference source | {instructions \| reference-png \| both} |
| Created | {ISO8601} |

## Shared tokens (`:root`)

| Token ID | Property | Expected value |
|---|---|---|
| color-bg | background | {value} |
| color-text | color | {value} |
| color-accent | color | {value} |
| font-display | font-family | {value} |
| font-body | font-family | {value} |

## Slides

### Slide {N} — {title}

| Element ID | Type | top | left | width | height | style notes |
|---|---|---|---|---|---|---|
| slide-{N}-title | text | {px} | {px} | {px} | {px} | font-size, weight, color |

Reference file: `reference/slide-{N}.png`

## Structural checklist

- [ ] Keyboard navigation script present in index.html
- [ ] All slides use data-slide attribute
- [ ] Shared chrome cloned from template or consistent markup
- [ ] No vw/vh/% positioning when flexibility=strict

## Dynamic mask regions (optional)

Elements excluded from pixel diff (live counters, timestamps):

- `{selector}`
