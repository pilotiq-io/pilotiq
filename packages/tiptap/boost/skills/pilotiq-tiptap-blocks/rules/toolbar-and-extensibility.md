# Toolbar & Extensibility

Three things in scope here: customizing the always-on toolbar, opting into non-default block primitives (`details`, `grid`, `lead`, `small`), and the pitfalls that bite when you extend the editor beyond the defaults.

## Default toolbar layout

```ts
[
  ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'link'],
  ['h2', 'h3'],
  ['alignStart', 'alignCenter', 'alignEnd'],
  ['blockquote', 'codeBlock', 'bulletList', 'orderedList'],
  ['undo', 'redo'],
]
```

Each inner array is a visually-separated group in the rendered toolbar. The selection-anchored floating toolbar (separate surface) shows a smaller subset on text selection — by default `bold / italic / link / clearFormatting`.

## Three customization styles

Use whichever matches your intent:

### Replace the whole layout

```ts
RichTextField.make('body').toolbarButtons([
  ['bold', 'italic', 'underline', 'strike', 'link'],
  ['h2', 'h3'],
  ['textColor', 'highlight'],
  ['bulletList', 'orderedList'],
  ['attachFiles', 'table', 'details', 'grid', 'gridDelete'],
  ['undo', 'redo'],
])
```

### Augment the defaults

```ts
RichTextField.make('body')
  .enableToolbarButtons(['lead', 'small'])      // append to last group
  .disableToolbarButtons(['table'])             // drop from every group
```

`enableToolbarButtons` always appends to the last group; reach for `toolbarButtons` if you need ids in a specific group.

### Hide chrome entirely

```ts
RichTextField.make('body')
  .toolbar(false)                                // hide the always-on top toolbar
  .floatingToolbar(false)                        // disable the selection-anchored quick toolbar
  .slashCommand(false)                           // disable the slash menu
```

All three are independent. A minimal-distraction config: `.toolbar(false).floatingToolbar(false)` but keep the slash menu so the user still has a way to insert blocks.

## Recognized button ids

```
Inline marks   bold italic underline strike subscript superscript code lead small
Headings       paragraph h1 h2 h3 h4 h5 h6
Alignment      alignStart alignCenter alignEnd alignJustify
Block prims    blockquote codeBlock bulletList orderedList horizontalRule
Style          textColor highlight clearFormatting
Files          attachFiles
Tables         table tableAddColumnBefore tableAddColumnAfter tableDeleteColumn
               tableAddRowBefore tableAddRowAfter tableDeleteRow
               tableMergeCells tableSplitCell tableDelete
               tableToggleHeaderRow tableToggleHeaderCell
Disclosure     details
Layout         grid gridDelete
Editing        link undo redo
```

**Unknown ids are silently dropped.** The union is forward-compatible — adding a new id later won't break existing field configs that referenced a typo or pre-release id.

## Opt-in primitives (not in default toolbar)

These nodes ship but aren't surfaced unless you explicitly add their toolbar id (or they appear in the slash menu via the same mechanism). The renderer (`renderRichTextToHtml`) serializes them whether or not the toolbar exposes them — so a document with `details` content created elsewhere still round-trips correctly even if the local field config doesn't include the button.

### `lead` / `small` size marks

Two inline marks for paragraph-style size variants:

- **`lead`** renders as `<span class="lead">…</span>`. Consumer owns the `.lead` CSS — there's no built-in stylesheet (`@pilotiq/pilotiq`'s typography preset typically has one; check yours).
- **`small`** renders as semantic `<small>…</small>`.

Surfaced as toolbar button ids `'lead'` / `'small'` and slash-menu entries under the **Style** group. Mirror the editor output in your own server-side render (`renderRichTextToHtml` does this correctly).

### `details` (collapsible disclosure)

A node trio (`details` / `detailsSummary` / `detailsContent`) wired from `@tiptap/extension-details@3.22.4` — v3 consolidated the three classes into a single peer dep (the `-summary` / `-content` child packages don't exist on the v3 line).

- Toolbar id: `'details'` (opt-in)
- Slash entry under the **Insert** group
- Render emits standard `<details><summary>…</summary>…</details>` HTML
- Open / closed state round-trips via the node's `open: boolean` attr; the renderer adds the platform `open` attribute when `attrs.open === true`

### `grid` / `gridDelete` (2-column / 3-column layout)

A node pair (`grid` + `gridColumn`) defined inline under `extensions/GridExtension.ts` — Tiptap doesn't ship a first-party grid extension. Schema constrains `grid` to `gridColumn{2,3}` so the user can't construct a 1-col or 4+-col grid through any path (toolbar / slash / paste).

- Toolbar ids: `'grid'` (insert; defaults to 2 columns when clicked) + `'gridDelete'` (unwrap the enclosing grid)
- Slash entries: `Two-column grid`, `Three-column grid` under the **Insert** group
- Render emits `<div class="pilotiq-grid pilotiq-grid-cols-N">…<div>col</div>…</div>` — consumer owns the CSS (same posture as `lead` / `small`)
- Out-of-range column counts (anything other than 2 or 3) clamp to 2 in both editor `parseHTML` and renderer. `clampGridColumns(value)` is exported from `GridExtension.ts` for tests; the render-side has its own micro-helper to keep `render.ts` Tiptap-runtime-free.

## File attachments (`attachFiles` button)

The `attachFiles` toolbar button uploads via the panel's registered `UploadAdapter`. Per-field setters:

```ts
RichTextField.make('body')
  .fileAttachmentsAcceptedFileTypes(['image/*', 'application/pdf'])
  .fileAttachmentsMaxSize(5 * 1024 * 1024)       // 5 MB cap
  .fileAttachmentsDirectory('articles')          // sub-directory hint
  .fileAttachmentsVisibility('public')           // adapter-dependent
  .resizableImages()                              // drag-handle resize on images
```

The upload route enforces `maxSize` server-side — a tampered client can't bypass. **Without an `UploadAdapter` registered on the panel, the `attachFiles` button silently hides.** Wire one with `Pilotiq.uploads({ adapter: localUpload({...}) })` (or any adapter from `@pilotiq/media`, S3, R2, etc.).

This auto-hide behavior is intentional — see [[feedback-pilotiq-panel-module-client-safe]]: the `attachFiles` button checks `RenderContext.hasUploadAdapter` at meta-resolve time. The field renders correctly with the button absent rather than showing a broken control.

## Drag handle — three-step drop dance

The framework ships per-block drag handles in `extensions/DragHandleExtension.ts`. If you write a **custom block with external drag UX** (not the default per-block handle), the drop handler must do three things or you get the dreaded snap-back-to-origin bug:

1. **`setNodeSelection(pos)`** on the editor view to select the drop target
2. **Set `view.dragging = { slice, move: true }`** before the drop dispatches
3. **`serializeForClipboard(view, slice)`** so ProseMirror has the serialized content to insert

Missing any one of the three causes the dragged node to disappear from its drop position and snap back to where it came from. The framework's built-in handle does all three correctly; custom drag implementations (e.g. an external palette dragging onto the canvas) must too. See [[feedback-tiptap-drag-handle-pm-dragging]] for the full repro.

## Module identity — dedupe Tiptap peers

`@tiptap/core` and `@tiptap/pm` keep state on module-level singletons. **Multiple copies break the editor** (silent: `instanceof` checks fail, schema lookups miss, NodeViews don't mount). Add them to `resolve.dedupe` in your Vite config:

```ts
// vite.config.ts
export default defineConfig({
  resolve: {
    dedupe: ['@tiptap/core', '@tiptap/pm', '@tiptap/react'],
  },
  // …
})
```

This is unrelated to pilotiq's general `optimizeDeps.exclude: ['@pilotiq/pilotiq']` rule (see [[feedback-vite-optimizedeps-exclude]]) — both can be needed simultaneously.

## Toolbar-driven slash entries

The slash menu's **Style** and **Format** groups derive from the *active* toolbar buttons. If you hide `textColor` from the toolbar via `.disableToolbarButtons(['textColor'])`, it also disappears from the slash menu. Same for alignment — if no `alignStart` / `alignCenter` / `alignEnd` button is active, the Format group is empty and collapses.

The **Insert** group is the inverse: it always shows the core insertable nodes regardless of toolbar config (paragraph, headings, lists, code block, blockquote, horizontal rule). Opt-in primitives (`details`, `grid`) only appear in the Insert group when their toolbar id is in the active config.

## See also

- `custom-blocks.md` — `Block.make(...)` user blocks appear in the slash menu after the framework groups.
- `slash-menu-and-mentions.md` — how merge tags and mentions interact with the slash menu surface.
- [[feedback-tiptap-block-name-collision]] — the `'block'` name pitfall (also covered in `custom-blocks.md`).
