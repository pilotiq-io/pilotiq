---
'@pilotiq/tiptap': minor
---

In-block content-block controls now live behind a single **gear menu**.

Blocks with multiple variations used to scatter their controls (a width chip in one corner, a variant dropdown + color swatch + click-the-icon picker in another). They now share one consistent entry point — a gear button in the block's inline-end gutter that opens a **nested settings menu**, one submenu per setting.

- **New reusable `BlockSettingsMenu`** (replaces `BlockWidthControl`): a gear trigger + a Base UI `Menu` with a `SubmenuRoot` per setting. Two setting kinds — `select` (a radio submenu, e.g. Width / Type) and `custom` (caller-supplied submenu body, e.g. the icon grid / color swatches). The active value rides each row as a hint.
- **Alert** routes Width, Type, Icon (curated SVG library + Custom SVG paste), and Color (custom variant only) through the gear; the icon in column one is now static and changed from the menu.
- **Alert gains a `width` attr** (`contained` / `full`), mirroring the FAQ block — emitted read-side as `data-width`. To keep the gear from shifting when width changes, Alert now renders in **two layers** (same as FAQ): a full-width `.pilotiq-alert` anchor wrapping an inner `.pilotiq-alert-box` that carries the box chrome + width. Consumer CSS that targeted `.pilotiq-alert` for the box (border/background/padding/`pilotiq-alert-<type>`) should move to `.pilotiq-alert-box`; full-width is `.pilotiq-alert[data-width="full"] .pilotiq-alert-box`.
- **FAQ** moves its width toggle into the same gear menu.

Back-compat: node structures are unchanged; existing Alert/FAQ content loads as-is (alerts default to `contained`).
