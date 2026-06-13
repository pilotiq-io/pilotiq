---
'@pilotiq/tiptap': minor
---

The remaining inline content blocks (**Summary**, **Key takeaways**, **Pros & cons**) now use the React NodeView + gear-menu pattern, matching Alert and FAQ.

- Each gains an in-block **gear menu** with a **Width** setting (`contained` / `full`), surfaced read-side as `data-width`.
- **Summary** and **Key takeaways** share one new `LabeledBlockNodeView` (they're structurally identical — a label above a `block+` body), driven by the existing `labeledBlock()` factory, which now attaches the NodeView + `width` attr and carries the per-block `label` / `cssClass` on `addOptions()`.
- **Pros & cons** gets its own `ProsConsNodeView`; the gear lives on the container, the two columns keep their plain label markup.
- The `width` attr is consolidated into one shared `widthAttribute()` helper (FAQ, Alert, the labelled blocks, and Pros & cons all reuse it, so they can't drift).

**Read-side / consumer CSS:** each block now renders a full-width outer anchor wrapping an inner content layer (mirrors the FAQ outer/`-content` split, so the gear doesn't move on a width toggle):

- Summary / Key takeaways: the label + body now sit inside a `.pilotiq-block-content` wrapper; that wrapper carries the max-width / centering (full-width via `[data-width="full"] > .pilotiq-block-content`).
- Pros & cons: the two-column grid moves from `.pilotiq-pros-cons` onto a new inner `.pilotiq-pros-cons-content`; the outer becomes the full-width anchor.

Back-compat: node structures are unchanged and parsing is tolerant of the old (unwrapped) HTML, so existing stored content loads as-is and defaults to `contained`.
