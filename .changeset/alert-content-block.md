---
'@pilotiq/tiptap': minor
'@pilotiq/pilotiq': minor
---

Redesigned the **Alert** content block into an interactive, themeable callout — and made it round-trip through the Markdown editor.

**Rich-text + markdown editor:**
- shadcn-style card on the panel's theme tokens (icon column + editable **title** and **body** — previously the label was the fixed variant name).
- In-block **variant picker** — `info` / `warning` / `success` / `tip` / **`custom`** (the four slash-menu alert entries collapse into one "Alert").
- In-block **icon picker** — a curated inline-SVG library (~18 icons, ~1-2KB, no `lucide-react`) plus a **"Custom SVG"** paste field. Custom SVG is sanitized via a pure allowlist (`sanitizeIconSvg`) on input and on render — scripts, event handlers, external refs (`use`/`image`/`a`/`href`), `<style>`, `<foreignObject>` are all stripped.
- The **custom** variant gets an in-block **color** swatch; the box + icon tint via `color-mix` (the value is validated before it reaches inline CSS).
- **Markdown round-trip** — `:::alert{type=warning icon=rocket} Title` admonition syntax (title rides the opening fence line). `MarkdownField` gains an **Alert** toolbar button (added to the default toolbar).

**Read-side** (`renderRichTextToHtml`) emits the new `<div class="pilotiq-alert"><span class="pilotiq-alert-icon">…</span><div class="pilotiq-alert-title">…</div><div class="pilotiq-alert-description">…</div></div>` structure; icon SVGs are shared with the editor so the two never drift. Consumer owns the CSS.

**Back-compat:** the node's content model changed (`block+` → `alertTitle alertBody`). HTML from the previous alert (label + body divs) is parsed into the new shape; JSON-stored alerts from the prior release may lose their body and should be re-inserted.
