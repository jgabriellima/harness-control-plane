# Design Contract — {TICKET}

| Field | Value |
|---|---|
| Ticket | {TICKET} |
| Reference source | {url \| hand-drawn \| figma-export} |
| Created | {ISO8601} |

## Reference files

| Viewport | File | Required |
|---|---|---|
| Desktop 1280x900 | reference/reference-desktop-1280.png | yes |
| Mobile 375x812 | reference/reference-mobile-375.png | yes |
| Tablet 768x1024 | reference/reference-tablet-768.png | optional |

## Token table

| Token ID | Property | Expected value | Element selector |
|---|---|---|---|
| body-bg | background-color | {computed} | body |
| card-bg | background-color | {computed} | [data-testid="post-card"] |

## Structural checklist

- [ ] Header visible at all viewports
- [ ] Sidebar visible at >= 1024px

## Dynamic mask regions (optional)

Elements excluded from pixel diff (timestamps, avatars):

- `{selector}`

## Viewports for comparison

- 1280x900 (mandatory)
- 375x812 (mandatory)
