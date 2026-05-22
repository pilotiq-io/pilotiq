---
name: pilotiq-tiptap-blocks
description: Custom blocks, slash menu, mentions, and toolbar customization for @pilotiq/tiptap's RichTextField — the side-panel form-in-block UX plus the pitfalls that bite when you customize beyond defaults
license: MIT
appliesTo:
  - '@pilotiq/tiptap'
trigger: defining `Block.make(...)` types for a `RichTextField`, wiring mentions / merge tags, customizing the toolbar, or touching slash-menu / drag-handle behavior
skip: just using `RichTextField.make('body').required()` with defaults — the always-loaded `boost/guidelines.md` already covers the basic surface
metadata:
  author: pilotiq
---

# Pilotiq Tiptap Blocks

## When to use this skill

Load when you're:

- Defining `Block.make(...)` types so users can insert form-driven embeds (callouts, YouTube embeds, CTAs, media cards) into a `RichTextField`
- Wiring `MentionProvider`s — especially the async `itemsUsing` variant that hits the DB
- Customizing the toolbar layout (`toolbarButtons`, `enableToolbarButtons`, `disableToolbarButtons`) or hiding chrome (`toolbar(false)`, `floatingToolbar(false)`, `slashCommand(false)`)
- Debugging slash-menu keyboard behavior, drag-handle snap-back, or side-panel keyboard shortcuts (`Mod-E` / `Esc` / focus trap)
- Opting into the non-default block primitives — `details` (collapsible), `grid` (2/3-column), `lead` / `small` size marks

For just the basic `RichTextField.make('body').required().placeholder(...)` surface — the always-loaded `boost/guidelines.md` covers it. Server-side HTML rendering (`renderRichTextToHtml`) is in guidelines too.

## Quick Reference

| Task | Open |
|---|---|
| Custom blocks — `Block.make().schema([…])` form-in-block embeds, side panel UX, keyboard shortcuts (`Mod-E` / `Esc`), field-type coverage inside blocks | `rules/custom-blocks.md` |
| Slash menu, mentions, merge tags — `MentionProvider` (static + async), `{{ merge_tag }}` chips, slash-menu groups | `rules/slash-menu-and-mentions.md` |
| Toolbar customization + opt-in primitives — toolbar groups, `lead` / `small` / `details` / `grid`, drag-handle gotcha, node-naming pitfalls | `rules/toolbar-and-extensibility.md` |

## Key concepts (load once)

- **A `Block` is a form embedded in a document.** `Block.make('callout').schema([TextField, …])` registers a slash-menu entry; inserting it stamps a `pilotiqBlock` node with `attrs.blockType='callout'` + `attrs.blockData={}`; clicking **Edit** (or `Mod-E` on a selected block) opens the right-docked side panel with that schema mounted as a real pilotiq form. Edits write back into `attrs.blockData` on every keystroke — no save button.
- **The side panel uses every pilotiq field renderer.** TagsInput / KeyValue / FileUpload (JSON-encoded), Repeater / Builder (dotted-path nested), markdown (raw source), all primitives — they all work inside a block schema because the panel snapshots `new FormData(formEl)` → `parseFormDataToNested` → per-fieldType coerce, no `FormStateProvider` mount required.
- **Block names are discriminators.** `Block.make('callout')` registers under that string; `BlockNodeView` and `BlockSidePanel` look up the active block by that name against `RichTextField.toMeta().blocks`. **Never name a block `'block'`** — it collides with ProseMirror's schema GROUP and breaks `contentMatchAt`. Any other name is fine; the framework's own node is `pilotiqBlock` so user names are safe.
- **Toolbar ids are forward-compatible.** Unknown ids in `.toolbarButtons([...])` are silently dropped — adding a new button id later won't break existing field configs. The recognized id union is documented in `boost/guidelines.md` (`Recognized button ids` block).
- **`Mod-E` / `Esc` / focus trap / width memory all ship.** Mod-E opens the panel for a selected block; Esc closes; Tab/Shift-Tab cycles within (soft trap — outside clicks still work); width persists to `localStorage` under `pilotiq.tiptap.sidePanel.width` clamped `[240, 600]`.
- **Slash menu listens capture-phase.** So does the mention menu. The side panel's Esc listener is bubble-phase + `stopPropagation` inside menus — so pressing Esc inside an open slash menu only closes the menu, not the panel.
- **Async mentions inside Repeater / Builder rows work out of the box.** The dispatcher parses `items.0.body` (Repeater) and `blocks.0.data.body` (Builder) dotted paths and looks the leaf up against the row template. Non-standard nesting (Repeater-inside-Repeater) needs manual `tagRichTextMentionUrls` walker extension.

## Examples

- `playground/app/Pilotiq/Articles/Schemas/ArticleForm.ts` — `RichTextField.make('body')` with `.blocks([…])`, `.mergeTags([…])`, and a couple `MentionProvider`s.
- `playground/app/Pilotiq/pages/BuilderDemo.ts` — heterogeneous Builder using Tiptap blocks alongside other field types.
