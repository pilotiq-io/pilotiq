---
'@pilotiq/tiptap': minor
---

Ship five built-in **inline content blocks** in every `RichTextField` (free + pro): **FAQ**, **Alert** (info/warning/success/tip), **Summary**, **Key takeaways**, and **Pros & cons**.

They are **inline editable nodes** — a small label on top, content typed straight into the block in place (no card, no popup, no border/background). Inserted from the slash menu's **Content** group. Each renders read-side to semantic `pilotiq-*` HTML via `renderRichTextToHtml` (consumer owns the CSS). Quote and Table remain the native `blockquote` / table extensions.

- Nodes live in `extensions/contentBlocks.ts`; registered by default in the editor.
- Alert's type is the label (Info/Warning/Success/Tip), chosen from the slash menu.
- Pros & cons is two labelled list columns.

The `Block.make().schema([...])` API (card + side-panel form) stays for **custom** blocks via `RichTextField.blocks([...])`, but no schema block ships as a default. `Block.toMeta()` / `RichTextField.toMeta()` are now `async` so option-fields (Select/Radio/ToggleButtons) resolve correctly inside custom schema blocks.
