---
'@pilotiq/tiptap': minor
---

The **FAQ** content block is now a collapsible **accordion**.

- **Editor:** each Q&A item is a collapsible row (a React NodeView) — the question is the always-visible trigger with a chevron, the answer folds below it. The question stays editable on click; only the chevron toggles. New `open` attr on `faqItem` (defaults open) stores per-item state.
- **Read-side** (`renderRichTextToHtml`): renders as native **`<details>`/`<summary>`** — a real, accessible, **zero-JS** accordion the browser collapses on its own. Each item's `open` attr drives the platform `open` attribute. Consumer owns the `.pilotiq-faq*` CSS.
- Dropped the old "Q"/"A" markers in favor of the accordion chrome.
- **Block width:** an in-block toggle (a reusable `BlockWidthControl`) switches the FAQ between **contained** (max-width, centered) and **full** width — a `width` attr on the `faq` node, emitted read-side as `data-width`. Generic enough to reuse on other blocks.

Back-compat: the node structure is unchanged (`faq > faqItem > faqQuestion faqAnswer`), so existing FAQ content loads as-is and gains the default-open state; old HTML question/answer wrappers still parse via fallback rules.
