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
│   ├── SlashCommandExtension.ts   # / slash menu via Suggestion
│   └── TextSizeMarks.ts           # `lead` + `small` inline marks
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

## Custom-block side panel (V2, 2026-05-04)

When a user clicks **Edit** on an inserted custom block, a floating right-docked panel mounts in the editor wrapper and mounts the block's `Block.schema([…])` as a real pilotiq form (via `<FormFields>` from `@pilotiq/pilotiq/react`). Edits write back into `attrs.blockData` on every keystroke — no save button.

**Wiring:**
1. The host (`TiptapEditor`) keeps `selectedBlock: { pos, blockType } | null` state and a stable `handleEditBlock(pos)` callback.
2. `BlockNodeExtension.configure({ blocks, onEdit: handleEditBlock })` plumbs the callback into extension options. Tiptap mounts NodeViews in a separate React tree — `useContext` does NOT cross that boundary, so the bridge has to ride extension options.
3. `BlockNodeView`'s Edit button reads `extension.options.onEdit` and calls it with its own `getPos()`.
4. The host opens `<BlockSidePanel>`, keyed on `pos:blockType` so swapping blocks fully remounts.
5. Inside the panel: `<FormFields elements={meta.schema} values={initialBlockData} />` renders the same field renderers pilotiq uses everywhere else.
6. A container-level `onChange/onInput` handler on the panel's `<form>` snapshots the **entire form** via `new FormData(formEl)` → `parseFormDataToNested` (re-exported from `@pilotiq/pilotiq/react`; rebuilds nested arrays/objects from dotted-path inputs like `items.0.title`) → `coerceBlockValues` (per-fieldType JSON parse / boolean / number coerce so nested-shape fields land in their canonical wire form). The result is dispatched through `state.tr.setNodeMarkup(pos, null, { blockType, blockData })` directly through the editor view.
7. The panel listens to every `transaction` and remaps its tracked `pos` so live edits elsewhere in the doc don't desync. If the underlying node disappears (different type at the mapped pos, or null), the panel closes itself.

**V2 field-type coverage.** All pilotiq field renderers serialize through hidden inputs in the form DOM (TagsInput / KeyValue / FileUpload write JSON, Toggle / Checkbox write `'true'/'false'`, Repeater / Builder use dotted-path names) — `parseFormDataToNested` + per-fieldType coerce captures every wire shape with no `FormStateProvider` mount. Working end-to-end:

- **Primitives:** text, textarea, select, radio, toggleButtons, date, dateTime, email, color, number, slider, toggle, checkbox.
- **JSON-encoded:** tagsInput (string[]), checkboxList (string[]), keyValue (Record<string, unknown>), fileUpload (URL string or string[] when `multiple`).
- **Plain text:** markdown (raw markdown source).
- **Nested array fields:** repeater (array of subschema rows; each row's children coerce recursively against `field.template`), builder (heterogeneous rows; `row.data` coerces against the block matching `row.type` from `field.blocks[]`; unknown block types pass through verbatim so config rollbacks don't lose content).

`coerceBlockValues(raw, schema)` is exported from `BlockSidePanel.tsx` for testing — pure helper, no DOM, no React.

**Polish (2026-05-05):**

- **`Mod-e`** (Cmd+E / Ctrl+E) — when the current selection is a NodeSelection on a `pilotiqBlock`, opens its side panel. Wired via `BlockNodeExtension.addKeyboardShortcuts()`. Returns `false` (yields to the browser default) when no block is selected, so Safari's *Use Selection for Find* still works in plain text.
- **ESC** closes the panel via a bubble-phase `document` listener. Slash and mention menus listen capture-phase + `stopPropagation`, so ESC inside an open slash menu only closes the menu and never bubbles down to the panel.
- **Focus management.** On open, the previously focused element is captured and the first focusable inside the panel is focused. While mounted, `Tab` / `Shift+Tab` cycles within the panel's focusables (soft trap — clicks elsewhere still work). On close, the previously focused element is re-focused.
- **Width memory.** The panel has a left-edge resize handle (1px hover-highlighted strip) and persists its width in `localStorage` under `pilotiq.tiptap.sidePanel.width`, clamped `[240, 600]` (default 320). Pure helper `clampPanelWidth(value)` is exported for tests; falls back to the default for `null` / `undefined` / empty-string / non-finite values, otherwise clamps numeric strings + numbers into range.

**editorRef.** `TiptapEditor` mirrors the `useEditor` instance into a ref so `handleEditBlock` (created before the editor exists) reads the live editor lazily. Re-creating the callback every render would force the editor to rebuild from scratch.

---

## Other key surfaces

- **`Block.toMeta()`** emits `{ name, label, icon, schema: FieldMeta[] }`. `RichTextField.blocks([…]).toMeta()` ships the array under `meta.blocks`. Both `BlockNodeView` and `BlockSidePanel` look up the active block by `blockType` against this meta.
- **Slash menu** (`SlashMenu.tsx` + `SlashCommandExtension.ts`): document-level capture-phase keys; cursor-anchored Base UI Popover via virtual element. Items derived from `extension.options.blocks` plus built-ins.
- **Drag handle**: `DragHandleExtension.ts` ships per-block external handles. Drop must `setNodeSelection` AND set `view.dragging` AND `serializeForClipboard` — missing any of those is the snap-back-to-origin bug (see `feedback_tiptap_drag_handle_pm_dragging.md`).
- **Tiptap node naming**: never use `name: 'block'` for a node — it collides with PM's schema GROUP and breaks contentMatchAt. The custom block uses `pilotiqBlock`.
- **`lead` / `small` size marks** (2026-05-05 cont'd⁴): two inline marks for paragraph-style size variants. `lead` renders as `<span class="lead">…</span>` (consumer owns the CSS — every site has a `.lead` rule); `small` renders as the semantic `<small>…</small>`. Surfaced as toolbar button ids `'lead'` / `'small'` and slash-menu entries under the **Style** group. Render-side serialization in `render.ts` mirrors the editor output.
- **Async mentions inside Repeater / Builder rows** (2026-05-05 cont'd⁴): the dispatcher (`pageData.findRichTextFieldByName`) parses the row-relative dotted path the editor posts (`items.0.body` for Repeater, `blocks.0.data.body` for Builder) and looks the leaf up against the Repeater's template / each Builder block's schema. The stamper (`tagRichTextMentionUrls`) walks Builder block schemas explicitly because `BuilderField.getChildren()` returns `undefined` to keep field walkers from treating heterogeneous rows as flat children.

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
