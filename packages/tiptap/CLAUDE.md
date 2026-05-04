# CLAUDE.md — `@pilotiq/tiptap`

Deep notes for the Tiptap rich-text adapter. Auto-loaded when working inside `packages/tiptap/`.

The root `CLAUDE.md` covers monorepo-wide concerns; `packages/pilotiq/CLAUDE.md` covers the host admin package this adapter plugs into.

---

## Package layout

```
src/
├── Block.ts                       # Custom block primitive (Block.make().schema(...))
├── RichTextField.ts               # Field subclass; the public surface
├── MentionProvider.ts             # Mention provider primitive
├── render.ts                      # Server-side HTML serializer
├── register.ts                    # registerTiptap() — installs the renderer
├── extensions/
│   ├── BlockNodeExtension.ts      # ProseMirror node + ReactNodeViewRenderer
│   ├── DragHandleExtension.ts     # Hover gutter drag handle
│   ├── MentionExtension.ts        # @-mentions via Suggestion
│   ├── MergeTagExtension.ts       # {{merge_tag}} pills
│   └── SlashCommandExtension.ts   # / slash menu via Suggestion
└── react/
    ├── BlockNodeView.tsx          # Inline summary card per inserted block
    ├── BlockSidePanel.tsx         # Right-docked panel for editing block.schema
    ├── FloatingToolbar.tsx        # Selection-anchored quick-format toolbar
    ├── MentionMenu.tsx
    ├── Palette.tsx                # Color swatch popover
    ├── SlashMenu.tsx
    ├── TableFloatingToolbar.tsx
    ├── TiptapEditor.tsx           # The field renderer pilotiq mounts
    ├── Toolbar.tsx                # Always-on top toolbar
    └── toolbarButtons.tsx
```

---

## Custom-block side panel (V1, 2026-05-04)

When a user clicks **Edit** on an inserted custom block, a floating right-docked panel mounts in the editor wrapper and mounts the block's `Block.schema([…])` as a real pilotiq form (via `<FormFields>` from `@pilotiq/pilotiq/react`). Edits write back into `attrs.blockData` on every keystroke — no save button.

**Wiring:**
1. The host (`TiptapEditor`) keeps `selectedBlock: { pos, blockType } | null` state and a stable `handleEditBlock(pos)` callback.
2. `BlockNodeExtension.configure({ blocks, onEdit: handleEditBlock })` plumbs the callback into extension options. Tiptap mounts NodeViews in a separate React tree — `useContext` does NOT cross that boundary, so the bridge has to ride extension options.
3. `BlockNodeView`'s Edit button reads `extension.options.onEdit` and calls it with its own `getPos()`.
4. The host opens `<BlockSidePanel>`, keyed on `pos:blockType` so swapping blocks fully remounts.
5. Inside the panel: `<FormFields elements={meta.schema} values={initialBlockData} />` renders the same field renderers pilotiq uses everywhere else.
6. A container-level `onChange/onInput` handler on the panel's `<form>` reads the changed input by `name`, coerces by `fieldType` (booleans, numerics — see `readBlockFieldValue`), splices into a values map, and dispatches `state.tr.setNodeMarkup(pos, null, { blockType, blockData })` directly through the editor view.
7. The panel listens to every `transaction` and remaps its tracked `pos` so live edits elsewhere in the doc don't desync. If the underlying node disappears (different type at the mapped pos, or null), the panel closes itself.

**V1 field-type coverage.** Flat-shape fields work end-to-end: text / textarea / select / toggle / checkbox / radio / date / datetime / email / number / slider / color. Nested-shape fields (Repeater / Builder / FileUpload / Markdown / KeyValue / TagsInput) render but their value bindings are deferred — those types need a `FormStateProvider`-backed read path and aren't wired yet.

**editorRef.** `TiptapEditor` mirrors the `useEditor` instance into a ref so `handleEditBlock` (created before the editor exists) reads the live editor lazily. Re-creating the callback every render would force the editor to rebuild from scratch.

---

## Other key surfaces

- **`Block.toMeta()`** emits `{ name, label, icon, schema: FieldMeta[] }`. `RichTextField.blocks([…]).toMeta()` ships the array under `meta.blocks`. Both `BlockNodeView` and `BlockSidePanel` look up the active block by `blockType` against this meta.
- **Slash menu** (`SlashMenu.tsx` + `SlashCommandExtension.ts`): document-level capture-phase keys; cursor-anchored Base UI Popover via virtual element. Items derived from `extension.options.blocks` plus built-ins.
- **Drag handle**: `DragHandleExtension.ts` ships per-block external handles. Drop must `setNodeSelection` AND set `view.dragging` AND `serializeForClipboard` — missing any of those is the snap-back-to-origin bug (see `feedback_tiptap_drag_handle_pm_dragging.md`).
- **Tiptap node naming**: never use `name: 'block'` for a node — it collides with PM's schema GROUP and breaks contentMatchAt. The custom block uses `pilotiqBlock`.

---

## Commands (run from repo root)

```bash
pnpm -F @pilotiq/tiptap build         # tsc -p tsconfig.build.json
pnpm -F @pilotiq/tiptap test          # node --test (no React mounts)
cd packages/tiptap && pnpm dev        # watch mode
```

Tests are pure — `node:test` + `node:assert/strict`. No DOM, no React mounts. Component-level coverage lives in the playground (run `cd playground-pilotiq && pnpm dev` and exercise the editor manually).

---

## Dependencies

- **Peer:** `@pilotiq/pilotiq` — for `Field` types, `<FormFields>`, `FieldShell` chrome.
- **Tiptap:** `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/suggestion`, plus extensions (link, placeholder, underline, sub/superscript, text-align, text-style, color, highlight, image, table).
- **UI:** `@base-ui/react` (popovers).
