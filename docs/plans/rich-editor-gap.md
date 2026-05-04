# RichTextField gap audit + plan

> **Status (2026-05-04):** Phases **A / B / C** landed in this pass — top-level
> toolbar with 26 button ids, `toolbarButtons / enableToolbarButtons /
> disableToolbarButtons` API, Underline / Subscript / Superscript / TextAlign
> / TextStyle / Color / Highlight extensions, palette popovers (`textColors` /
> `customTextColors` / `highlightColors`), slash-menu expansion (h1-h6 +
> alignment + clear-format), and `.storage('json' | 'html')` option. **23
> tests** in `@pilotiq/tiptap`. Phases **D-G** remain — see below.

Aligns `@pilotiq/tiptap` with the reference admin's RichEditor surface.
Current package ships StarterKit + Placeholder + slash menu + drag handle +
selection-only floating toolbar (B / I / Strike / Code / Link). This plan
fills the remaining surface in phases.

> Note: the reference admin is just the API blueprint. Names / docs / tests
> stay neutral.

---

## What we already have (v0)

- `RichTextField.make(name)` → `fieldType: 'richtext'`
- StarterKit 3 nodes + marks: paragraph, heading (1-3 in slash, 1-6 in node), bold, italic, strike, code, blockquote, codeBlock, bulletList, orderedList, horizontalRule, link mark, history.
- `Block.make(name).label().icon().schema([fields])` — custom blocks with inline form NodeView.
- `slashCommand(boolean)` — toggle the `/` menu.
- `toolbar('default' | 'none')` — floating selection toolbar on/off.
- Drag handle in the gutter for top-level blocks (incl. list items).
- Storage: always Tiptap **JSON** (parsed + stringified through a hidden input).
- Slash items: paragraph, h1, h2, h3, bullet list, ordered list, quote, code, divider, custom blocks.

## What's missing

| Area | Reference feature | Status |
|---|---|---|
| Toolbar | top-level always-on toolbar with grouped buttons | **missing** |
| Toolbar | `toolbarButtons([groups])` configuration | **missing** |
| Toolbar | `enableToolbarButtons` / `disableToolbarButtons` deltas | **missing** |
| Toolbar | `floatingToolbars({ paragraph, heading, table })` per-context | **missing** |
| Marks | underline, subscript, superscript | **missing** |
| Layout | text alignment (start/center/end/justify) | **missing** |
| Style | text colors palette + custom-color picker | **missing** |
| Style | highlight palette | **missing** |
| Style | clear formatting | **missing** |
| Style | `lead` / `small` size variants | **missing** |
| Headings | h4/h5/h6 in slash + paragraph reset | **missing** |
| Files | `attachFiles` button + Image node + upload pipeline | **missing** |
| Files | `resizableImages()` | **missing** |
| Files | `fileAttachmentsDisk/Directory/Visibility/AcceptedFileTypes/MaxSize` | **missing** |
| Files | `preventFileAttachmentPathTampering` | **missing** |
| Tables | full set (12 buttons) + table toolbar | **missing** |
| Tables | `grid` / `gridDelete` / `details` collapsible | **missing** |
| Custom blocks | side-panel UI in addition to slash menu | **missing** |
| Custom blocks | block grouping by `customBlocks(['Group' => […blocks]])` | **missing** |
| Merge tags | `{{ tag }}` insertion + render-time substitution | **missing** |
| Mentions | `@`/`#` mention providers + render-time link/label | **missing** |
| Plugins | `RichContentPlugin` interface — extension surface | **missing** |
| Storage | `json()` opt-in (we're JSON-by-default — switch to `html()` opt-out for parity) | **inverted** |
| Render | server-safe `renderRichTextToHtml()` for column / entry display | **missing** |
| Render | sanitize-html helper + private-image signed URLs | **missing** |

---

## Phases

### Phase A — top-level toolbar + new mark extensions  ✅ **DONE 2026-05-04**

Adds the always-on toolbar as a sibling of the editor body, with grouped
buttons. Brings the new mark extensions needed by those buttons.

- New peer deps: `@tiptap/extension-underline`, `@tiptap/extension-subscript`,
  `@tiptap/extension-superscript`, `@tiptap/extension-text-align`,
  `@tiptap/extension-text-style`, `@tiptap/extension-color`,
  `@tiptap/extension-highlight`.
- New `Toolbar.tsx` component — full button set; FloatingToolbar stays for
  selection-anchored quick actions.
- API additions:
  - `toolbarButtons([['bold','italic',…], ['undo','redo']])` — declarative
    grouped layout, accepts callback.
  - `enableToolbarButtons([...])` / `disableToolbarButtons([...])` — deltas
    on top of either the default layout or a custom one.
- Default toolbar groups (mirrors reference):
  ```
  [
    ['bold','italic','underline','strike','subscript','superscript','link'],
    ['h2','h3'],
    ['alignStart','alignCenter','alignEnd'],
    ['blockquote','codeBlock','bulletList','orderedList'],
    ['undo','redo'],
  ]
  ```
- Toolbar buttons recognized by id (build out): `bold`, `italic`, `underline`,
  `strike`, `subscript`, `superscript`, `code`, `paragraph`, `h1`, `h2`, `h3`,
  `h4`, `h5`, `h6`, `alignStart`, `alignCenter`, `alignEnd`, `alignJustify`,
  `blockquote`, `codeBlock`, `bulletList`, `orderedList`, `horizontalRule`,
  `clearFormatting`, `link`, `undo`, `redo`. (Color / highlight / table /
  attachFiles arrive in later phases.)

### Phase B — slash menu expansion + storage format opt-in  ✅ **DONE 2026-05-04**

- Slash menu adds h4/h5/h6, divider already present, paragraph alignment
  switches.
- `storage('json' | 'html')` field option. JSON stays the default (back-compat
  with existing `body` columns). When `'html'` is selected the hidden input
  serializes editor HTML instead and the form coercion stays a string.

### Phase C — text colors + highlight palette  ✅ **DONE 2026-05-04**

- `textColors([{ value, label, dark? }])` builder, `customTextColors()` to
  enable arbitrary picker.
- `highlightColors([…])` builder.
- Toolbar buttons `textColor`, `highlight` open a Base UI Popover with the
  palette.

### Phase D — read-side renderer

- `renderRichTextToHtml(content, opts)` — accepts JSON or HTML, returns
  sanitized HTML. Server-safe; no DOM dependency.
- TextEntry / TextColumn integration — when value is detected as Tiptap JSON,
  pipe through this renderer.

### Phase E — file attachments + image insertion

- Reuse pilotiq's `UploadAdapter` via `RenderContext.hasUploadAdapter`.
- New `attachFiles` toolbar button → Base UI dialog → upload → insert Image.
- `resizableImages()` — drag-handle on image NodeView.
- Field options: `fileAttachmentsAcceptedFileTypes`, `fileAttachmentsMaxSize`,
  `fileAttachmentsDirectory`, `fileAttachmentsVisibility`. Drive both the
  upload call and the picker filter.

### Phase F — tables

- `@tiptap/extension-table` + row / cell / header.
- All 12 table buttons.
- Floating toolbar variant when cursor is inside a table.

### Phase G — merge tags + mentions

- `mergeTags(['name','company'])` — slash menu surface + `{{ }}` rendering at
  read time.
- `mentions([MentionProvider.make('@').items({…})])` — Suggestion popover at
  trigger char; static + async items; server-side label resolution.

---

## Out of scope for this pass

- Plugin extensibility surface (the reference's `RichContentPlugin`). Revisit
  after Phase E — needs a stable extension contract first.
- Private-image signed URLs.
- `data-id` tamper guard (`preventFileAttachmentPathTampering`) — needs
  pilotiq-side authorization context first.
- `details` collapsible blocks, `grid` blocks, `lead`/`small` size variants.
  Cosmetic, low priority.
