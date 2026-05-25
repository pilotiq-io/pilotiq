---
"@pilotiq/pilotiq": minor
---

feat(pilotiq): responsive tables — table on desktop, card-per-row on mobile

List tables can now collapse to one card per row on small screens instead
of forcing a horizontal scroll, with the card content built automatically
from the columns.

- **`Table.stackOnMobile(breakpoint = 'md')`** — opt-in. Renders the classic
  table at/above the breakpoint and one card per row below it. Distinct from
  `cards()` (cards at every breakpoint). Desktop is unchanged.
- **Auto-card** — `cards()` / `stackOnMobile()` no longer require a
  `cardSchema`. Without one, each card is built from the columns + the
  resource's record-identity attributes: optional image, the title as a
  heading, optional description, then the remaining columns as muted
  `Label · value` lines (reusing each row's formatted cell values).
- **New `Resource.recordImageAttribute` / `recordDescriptionAttribute`**
  statics (mirror `recordTitleAttribute`); the image falls back to the first
  `ImageColumn` when unset.
- **`cardSchema` widened to `(record, auto, ctx)`** — return `[...auto, extra]`
  to extend the auto-card, or ignore `auto` to fully replace it. Single-arg
  handlers still replace (back-compatible). Cards mode without a schema no
  longer throws.
- **`Column.visibleFrom(bp)` / `Column.hiddenFrom(bp)`** — per-column
  responsive visibility (`sm | md | lg | xl | 2xl`, mutually exclusive).
  Applies to the desktop table cell and the mobile card (a column visible
  only at/above the stack breakpoint is dropped from the card). Works on a
  plain table too.

Guide: `docs/guide/card-listing.md`.
