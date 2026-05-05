# RichTextField gap audit + plan

> **Status (2026-05-04 cont'd¹²):** Phases **A / B / C / D / E / F / G** landed — gap closed.
>
> - A/B/C — top-level toolbar with 26 button ids, `toolbarButtons /
>   enableToolbarButtons / disableToolbarButtons` API, Underline / Subscript /
>   Superscript / TextAlign / TextStyle / Color / Highlight extensions, palette
>   popovers (`textColors` / `customTextColors` / `highlightColors`), slash-menu
>   expansion (h1-h6 + alignment + clear-format), `.storage('json' | 'html')`.
> - D — `renderRichTextToHtml(content, opts?)` server-safe renderer +
>   `isRichTextValue` detector in `@pilotiq/tiptap` (also exported from
>   `@pilotiq/tiptap/render`); `@pilotiq/pilotiq/richtext` registry
>   (`registerRichTextRenderer`); `registerTiptap()` wires both. `TextEntry`
>   auto-renders rich text and stamps `richtext: true`; default-text columns
>   in `Table` auto-render too via `_richtextCells` (skipped when no renderer
>   is registered or when an explicit `formatStateUsing` / `format` /
>   editable-input column wins).
> - E — `attachFiles` toolbar button (Phase A reserved id flipped to
>   `available: true`) opens a Base UI dialog with file picker + alt-text
>   input + size guard + error surface. Upload posts multipart to the
>   panel's `_uploads` route (reuses pilotiq's existing `UploadAdapter`)
>   and inserts an Image node (or a link mark for non-images). Server-side,
>   the toolbar's `attachFiles` button + meta `uploadUrl` are stripped when
>   no adapter is registered (`RenderContext.hasUploadAdapter`), matching
>   `MarkdownField`'s posture. `RichTextField` gains `resizableImages() /
>   fileAttachmentsAcceptedFileTypes / fileAttachmentsMaxSize /
>   fileAttachmentsDirectory / fileAttachmentsVisibility`. `@tiptap/extension-image`
>   wired with `inline: false`, `allowBase64: false`, and the built-in
>   resize NodeView when `resizableImages()`. Read-side: `renderRichTextToHtml`
>   gains a `case 'image'` emitting `<img src alt title width height>` with
>   `sanitizeUrl` on src; bad srcs (`javascript:` etc) drop the `<img>`
>   entirely instead of emitting `src="#"`. **54 tests** in `@pilotiq/tiptap`
>   (was 45), **1922 tests** in `@pilotiq/pilotiq`.
>
> - F — `@tiptap/extension-table` (pinned **3.22.4**) wired in `TiptapEditor`
>   with `resizable: true` + `lastColumnResizable: false`. All 12 reserved
>   `table*` ids in `ToolbarButtonId` flipped to `available: true` with icons
>   + commands + `isDisabled` gates that read off `editor.can().<command>()`.
>   New `TableFloatingToolbar` mounts above the enclosing `<table>` whenever
>   the cursor is inside one — viewport-pinned (`position: fixed`), regroups
>   the cell-management buttons into 5 logical groups. Read-side:
>   `renderRichTextToHtml` learns `case 'table' | 'tableRow' | 'tableCell' |
>   'tableHeader'`. Tables wrap a `<tbody>`; cells honor `colspan` /
>   `rowspan`; a `<colgroup>` is emitted only when at least one cell carries
>   a resolved `colwidth: number[]` entry. **65 tests** in `@pilotiq/tiptap`
>   (was 54).
>
> - G — `RichTextField.mergeTags(['firstName', …])` surfaces a "Merge tags"
>   group in the slash menu; picking an item inserts a `mergeTag` inline atom
>   node carrying `{ id }`. The editor renders it as a small chip
>   (`{{ firstName }}`); read-side, `renderRichTextToHtml(content,
>   { mergeTags })` substitutes the value (HTML-escaped) — unmatched ids
>   fall back to a styled `<span class="merge-tag" data-id="...">{{ id }}</span>`.
>   `RichTextField.mentions([MentionProvider.make('@').items([…])])` wires
>   one Suggestion plugin per provider; each trigger char opens a
>   cursor-anchored `MentionMenu` popover. Picking an item inserts a
>   `mention` inline atom node carrying `{ id, label, trigger }`. Read-side,
>   `renderRichTextToHtml(content, { resolveMention })` lets display
>   surfaces refresh stale labels; without an override the cached label
>   wins. **75 tests** in `@pilotiq/tiptap` (was 65). Plan complete.

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
| Files | `attachFiles` button + Image node + upload pipeline | ✅ Phase E |
| Files | `resizableImages()` | ✅ Phase E |
| Files | `fileAttachmentsDirectory/Visibility/AcceptedFileTypes/MaxSize` | ✅ Phase E |
| Files | `preventFileAttachmentPathTampering` | **missing** (out of scope) |
| Tables | full set (12 buttons) + table toolbar | ✅ Phase F |
| Tables | `details` collapsible | ✅ ([details-blocks.md](./details-blocks.md)) |
| Tables | `grid` / `gridDelete` | **missing** |
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

### Phase D — read-side renderer  ✅ **DONE 2026-05-04**

- `renderRichTextToHtml(content, opts?)` in `@pilotiq/tiptap` — accepts a
  Tiptap JSON document (object or JSON-encoded string), renders to HTML.
  Pure function: no DOM, no Tiptap runtime, no React. Raw HTML strings pass
  through. Coverage matches Phases A-C (paragraph/heading/blockquote/list/
  hr/break, all marks, custom-block fallback to `<div data-type=…>`).
  HTML-escapes text content; sanitizes link hrefs (blocks `javascript:` /
  `data:` / `vbscript:`); allowlists color values.
- `isRichTextValue(v)` conservative detector — matches only the canonical
  `{ type: 'doc', content: [...] }` shape.
- `@pilotiq/pilotiq/richtext` registry — `registerRichTextRenderer(render,
  detect)` + `getRichTextRenderer / tryRenderRichText`. Adapter packages
  register at boot.
- `registerTiptap()` now wires both the field renderer AND the read-side
  renderer in one call.
- `TextEntry`: auto-renders Tiptap content; stamps server-rendered HTML on
  `_formatted` and flips `richtext: true`. The renderer dispatches via
  `dangerouslySetInnerHTML` and wraps in `prose`.
- `Table` default-text columns: per-row auto-render in `loadTableRecords`;
  stamps `row._formatted[col]` + `row._richtextCells[col] = true`. Skipped
  when the column has `formatStateUsing` / `format` / is editable, when no
  renderer is registered, or when the row's value isn't recognizable Tiptap.

### Phase E — file attachments + image insertion  ✅ **DONE 2026-05-04**

- Reuse pilotiq's `UploadAdapter` via `RenderContext.hasUploadAdapter`.
- `attachFiles` toolbar button (id was reserved in Phase A's union) flipped
  to `available: true` with an icon and a `custom: 'attachFiles'` route.
- Click → Base UI Dialog with file picker, alt-text input, size guard,
  inline error surface, busy state. Upload posts multipart to the panel's
  `_uploads` route (`POST {base}/_uploads`); on success the response
  `{ ok, url }` is fed to `editor.chain().setImage({ src, alt })` for
  images, or `insertContent` with a `link` mark on the filename for
  non-images (Tiptap StarterKit doesn't ship a generic file node).
- `RichTextField`: `resizableImages() / fileAttachmentsAcceptedFileTypes
  / fileAttachmentsMaxSize / fileAttachmentsDirectory /
  fileAttachmentsVisibility` setters; meta exposes them all + `uploadUrl`
  (only stamped when adapter is wired). `attachFiles` button is also
  stripped server-side from `toolbarGroups` when no adapter is wired
  (matches `MarkdownField`).
- `@tiptap/extension-image` (pinned **3.22.4**) wired in `TiptapEditor`
  with `inline: false`, `allowBase64: false`, and the extension's built-in
  resize NodeView when `resizableImages()`.
- Read-side: `renderRichTextToHtml` gains `case 'image'` — emits
  `<img src alt title width height>` with `sanitizeUrl` on `src`,
  HTML-escaped `alt` / `title`, and integer width/height that drops bad
  / negative / non-finite values. Unsafe srcs (`javascript:` etc.) drop
  the `<img>` entirely rather than emitting a broken `src="#"`.

### Phase F — tables  ✅ **DONE 2026-05-04**

- `@tiptap/extension-table` (pinned **3.22.4**) wired in `TiptapEditor` with
  `resizable: true` + `lastColumnResizable: false`. The four nodes ship from
  one peer dep — `Table`, `TableRow`, `TableHeader`, `TableCell` are imported
  individually so we can configure `Table` while leaving the others stock.
- All 12 reserved `table*` ids in `ToolbarButtonId` flipped to `available: true`
  in `toolbarButtons.tsx` with inline-SVG icons, commands, and `isDisabled`
  gates that read `editor.can().<command>()`. Outside of a table the cell-
  action buttons render disabled instead of crashing on a no-op chain.
- New `TableFloatingToolbar` (`react/TableFloatingToolbar.tsx`) — separate
  component from the selection-anchored `FloatingToolbar`, anchored to the
  enclosing `<table>`'s top edge. Visible only while the cursor is inside a
  table. Regroups the 11 cell-management buttons into five logical groups
  (column ops, row ops, merge/split, header toggles, delete table). Mounts
  alongside `FloatingToolbar` and is independent of the `floatingToolbar`
  field setting (which gates the inline-mark variant).
- Read-side: `renderRichTextToHtml` learns `case 'table' | 'tableRow' |
  'tableCell' | 'tableHeader'`. Tables wrap a `<tbody>`; cells honor
  `colspan` / `rowspan` (default `1` is omitted from output); a `<colgroup>`
  is emitted only when at least one cell carries a resolved `colwidth:
  number[]` entry — out-of-the-box tables with no column-resize history stay
  noise-free.
- **65 tests** in `@pilotiq/tiptap` (was 54).

### Phase G — merge tags + mentions  ✅ **DONE 2026-05-04**

- `mergeTags(string[])` — slash-menu group ("Merge tags") surfaces one item
  per id; selecting one inserts a new `mergeTag` inline atom node
  (`{ type: 'mergeTag', attrs: { id: 'firstName' } }`) which renders in the
  editor as a styled `{{ id }}` chip. Read-side,
  `renderRichTextToHtml(content, { mergeTags: { firstName: 'Sleman' } })`
  substitutes from the map (HTML-escaped). Ids missing from the map fall
  back to `<span class="merge-tag" data-id="...">{{ id }}</span>` so
  server-rendered previews stay informative.
- `mentions(MentionProvider[])` — `MentionProvider.make(triggerChar).items([
  { id, label, group? }, … ])` declares one Suggestion plugin per provider.
  Mixing trigger characters in the same editor is supported (`@user`,
  `#room`). Picking an item inserts a `mention` inline atom node
  (`{ type: 'mention', attrs: { id, label, trigger } }`). The editor renders
  it as a styled `${trigger}${label}` chip. Read-side,
  `renderRichTextToHtml(content, { resolveMention: (trigger, id) => latestLabel })`
  refreshes stale labels at display time; without an override the cached
  label (stamped at insert) wins. **Async items landed 2026-05-04 cont'd¹⁴:**
  `MentionProvider.itemsUsing(async (query, ctx) => …)` resolver runs server-side
  per keystroke; pilotiq stamps `mentionsUrl` on the field meta when at least
  one provider is async; new `POST {scope}/_form/{formId}/mentions` route on
  every page-scope (resource-create / resource-edit / global-edit / custom
  page) reuses the same auth gate as the matching `_form/:formId/state`
  endpoint. Walker is duck-typed (`getType()==='richtext'` +
  `hasAsyncMentions` + `withMentionsUrl`) so pilotiq core stays adapter-free.
  Async-mention providers inside Repeater rows still out of scope (path
  doesn't round-trip).

---

## Out of scope for this pass

- Plugin extensibility surface (the reference's `RichContentPlugin`). Revisit
  after Phase E — needs a stable extension contract first.
- Private-image signed URLs.
- `data-id` tamper guard (`preventFileAttachmentPathTampering`) — needs
  pilotiq-side authorization context first.
- `grid` blocks. Cosmetic, low priority.
  (`lead`/`small` shipped 2026-05-05 cont'd⁴; `details` shipped 2026-05-05
  cont'd⁷ — see [details-blocks.md](./details-blocks.md).)

## Post-ship follow-ups (2026-05-04 cont'd)

- **Async mention items** (cont'd¹⁴): `MentionProvider.itemsUsing(async fn)` +
  `_form/:formId/mentions` route — see the Mentions section above for the
  detailed wire shape.
- **Slash-menu Image / Table entries** (cont'd¹⁵): two new built-ins under
  the "Insert" group. Table is unconditional and runs the same
  `insertTable({rows:3,cols:3,withHeaderRow:true})` chain as the toolbar
  button. Image is gated on `RichTextField.uploadUrl` being stamped (mirrors
  the toolbar's `attachFiles` button — only surfaces when an `UploadAdapter`
  is registered) and shares the same `AttachFilesDialog`. The dialog mount
  was hoisted from `Toolbar` to `ClientEditor` so the Image entry works
  even when the toolbar is hidden via `.toolbar(false)`. `SlashCommandOptions`
  gains `hasUpload: boolean` + `onInsertImage: () => void` — `TiptapEditor`
  threads `Boolean(uploadUrl)` and `() => setAttachOpen(true)`.
