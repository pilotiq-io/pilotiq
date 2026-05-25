# @pilotiq/tiptap

Tiptap rich-text adapter for `@pilotiq/pilotiq`. Adds a `RichTextField` with always-on toolbar, selection-anchored quick-format toolbar, slash menu (`/`), draggable blocks, and a custom-block API for embedding inline forms inside the document.

## Why a separate package?

Tiptap is modular — extensions, themes, and node views are picked at integration time. Pulling them into `@pilotiq/pilotiq` would penalize apps that don't write long-form content. Mirrors the `@pilotiq/codemirror` pattern: small adapter package, opt-in registration.

## Installation

```bash
pnpm add @pilotiq/tiptap \
  @tiptap/core @tiptap/pm @tiptap/react @tiptap/starter-kit @tiptap/suggestion \
  @tiptap/extension-link @tiptap/extension-placeholder \
  @tiptap/extension-underline @tiptap/extension-subscript @tiptap/extension-superscript \
  @tiptap/extension-text-align @tiptap/extension-text-style @tiptap/extension-color \
  @tiptap/extension-highlight @tiptap/extension-image @tiptap/extension-table
```

## Setup

Register the plugin on your `Pilotiq.make(...)` panel (typically `app/Pilotiq/AdminPanel.ts`):

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { tiptap } from '@pilotiq/tiptap'

Pilotiq.make('Admin').plugins([
  tiptap(),
])
```

The plugin tells pilotiq's `SchemaRenderer` how to render `fieldType: 'richtext'` and wires a server-side renderer for finished HTML on display surfaces. The panel module is imported on both server and client, so a single registration covers both.

> Prefer to register without going through the panel? `import { registerTiptap } from '@pilotiq/tiptap'` and call `registerTiptap()` from your client entry (`pages/+Layout.tsx`). The plugin form is just sugar over this call.

Without one of the two, `RichTextField` form fields render as nothing — `SchemaRenderer` can't find a renderer for the `'richtext'` type.

### Tailwind setup

`@pilotiq/tiptap` ships Tailwind utility **class names**, not compiled CSS, so your
app's Tailwind build must **scan the package** — the same requirement as
`@pilotiq/pilotiq`. Skip it and any class not already used elsewhere in your
project silently won't render.

**Tailwind v4** — add an `@source` alongside the one for `@pilotiq/pilotiq`:

```css
@import "tailwindcss";
@source "../node_modules/@pilotiq/pilotiq/dist";
@source "../node_modules/@pilotiq/tiptap/dist";
```

(Adjust the relative path to resolve to the installed `dist`; workspace setups
can point at `src`.) **Tailwind v3** — add `'./node_modules/@pilotiq/tiptap/dist/**/*.js'` to `content`. The editor's prose styles also expect `@plugin "@tailwindcss/typography"` (or the v3 plugin).

## Usage

```ts
import { RichTextField, Block } from '@pilotiq/tiptap'

Resource.make('Article').form((form) => form.schema([
  RichTextField.make('body')
    .label('Body')
    .placeholder('Start writing…')
    .blocks([
      Block.make('callout').label('Callout').icon('💡').schema([
        TextField.make('title'),
        TextareaField.make('content').required(),
      ]),
    ]),
]))
```

## Builder API

| Method | Default | Notes |
|---|---|---|
| `.placeholder(text)` | `'Start writing…'` | Inherited from `Field`. |
| `.required()` | off | Inherited from `Field`. |
| `.storage('json' \| 'html')` | `'json'` | `'json'` stores Tiptap JSON; `'html'` stores serialized HTML. |
| `.toolbar(false)` | `true` | Hides the always-on top-level toolbar. |
| `.toolbarButtons([groups])` | default groups | Replace the layout. Pass `null` to hide. |
| `.enableToolbarButtons([ids])` | — | Append ids to the last group. |
| `.disableToolbarButtons([ids])` | — | Drop ids from every group. |
| `.floatingToolbar(false)` | `true` | Hides the selection-anchored quick-format toolbar. |
| `.slashCommand(false)` | `true` | Disables the `/` menu. |
| `.blocks([Block...])` | `[]` | Custom-block schemas reachable via `/`. |
| `.textColors([{value, label, dark?}])` | bundled palette | Replace the swatches in the `textColor` button. |
| `.customTextColors()` | off | Enable the free-form color picker below the swatches. |
| `.highlightColors([{value, label}])` | bundled palette | Replace the swatches in the `highlight` button. |
| `.resizableImages()` | off | Drag-resize handle on inserted images (preserves aspect ratio). |
| `.fileAttachmentsAcceptedFileTypes(['image/*'])` | `['image/*']` | MIME-type allowlist for the `attachFiles` picker. |
| `.fileAttachmentsMaxSize(bytes)` | unlimited | Per-file size cap. The upload route also enforces it. |
| `.fileAttachmentsDirectory('articles')` | — | Sub-directory hint forwarded to the panel's `UploadAdapter`. |
| `.fileAttachmentsVisibility('public' \| 'private')` | — | Adapter-defined visibility hint. |
| `.mergeTags(['firstName', 'company'])` | `[]` | Identifiers surfaced under "Merge tags" in the slash menu — each becomes a `{{ id }}` chip in the editor. |
| `.mentions([MentionProvider.make('@').items([…])])` | `[]` | One mention provider per trigger character (`@`, `#`, …). Items can be static (`.items([…])`) or async (`.itemsUsing(async (query, ctx) => […])`); see "Mentions" below. |

## Toolbar buttons

Recognized button ids (use them in `toolbarButtons` / `enableToolbarButtons` / `disableToolbarButtons`):

```
Inline marks   bold italic underline strike subscript superscript code
Size variants  lead small
Headings       paragraph h1 h2 h3 h4 h5 h6
Alignment      alignStart alignCenter alignEnd alignJustify
Block prims    blockquote codeBlock bulletList orderedList horizontalRule
Style          textColor highlight clearFormatting
Files          attachFiles
Tables         table
               tableAddColumnBefore tableAddColumnAfter tableDeleteColumn
               tableAddRowBefore    tableAddRowAfter    tableDeleteRow
               tableMergeCells      tableSplitCell
               tableToggleHeaderRow tableToggleHeaderCell
               tableDelete
Disclosure     details
Layout         grid gridDelete
Editing        link undo redo
```

`lead` and `small` are inline marks: `lead` wraps the selection in `<span class="lead">…</span>` (style with your own `.lead` rule — typically the lede paragraph treatment), `small` wraps in the semantic `<small>…</small>` element. They compose freely with bold/italic/color and are surfaced under the **Style** group of the slash menu (`/lead`, `/small`).

Default layout (matches the reference admin):

```ts
[
  ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'link'],
  ['h2', 'h3'],
  ['alignStart', 'alignCenter', 'alignEnd'],
  ['blockquote', 'codeBlock', 'bulletList', 'orderedList'],
  ['undo', 'redo'],
]
```

Custom palette / palette-popover button ids beyond the ones listed above are silently dropped — the union is intentionally forward-compatible.

### `attachFiles`

The `attachFiles` button opens a Base UI dialog with a file picker, alt-text input, and inline error messages. On submit, the dialog posts multipart to the panel's `_uploads` route (the same route `FileUpload` uses); on success the returned `{ ok, url }` is fed to `editor.chain().setImage({ src, alt })` for image MIME types, or inserted as a link mark on the filename for non-images.

The button is **stripped from the toolbar server-side** when no `UploadAdapter` is registered with `Pilotiq.uploads({ adapter })`, so apps without uploads never see a broken affordance — the same posture as `MarkdownField`'s `attachFiles`. Pair `.enableToolbarButtons(['attachFiles'])` with field options for shape control:

```ts
RichTextField.make('body')
  .enableToolbarButtons(['attachFiles'])
  .resizableImages()
  .fileAttachmentsAcceptedFileTypes(['image/*'])
  .fileAttachmentsMaxSize(2_000_000)
  .fileAttachmentsDirectory('articles')
```

## Slash menu

Opens on `/`. Built-in items:

- **Basic** — Text, Quote, Code block, Divider, Clear formatting
- **Headings** — Heading 1 to 6
- **Lists** — Bullet list, Numbered list
- **Align** — Align left, Align center, Align right
- **Insert** — Table (3×3 with header row), Collapsible block (`<details>`), Two-column grid, Three-column grid, Image *(only when an `UploadAdapter` is registered via `Pilotiq.uploads({ adapter })`)*
- **Style** — Lead, Small
- **Blocks** — every entry in `.blocks([...])`
- **Merge tags** — every entry in `.mergeTags([...])`

The Image entry shares the same upload dialog as the toolbar's `attachFiles` button — picking it deletes the slash range, then opens the dialog (which handles the actual upload + image insertion). The dialog is mounted at the editor level, so the slash entry works even when the toolbar is hidden via `.toolbar(false)`. The Table entry inserts a 3×3 table with a header row at the cursor; the table-floating-toolbar handles row / column / merge / delete operations once the cursor is inside.

Each registered `Block` becomes a slash item that inserts an inline form. The block's `schema([fields])` defines the form layout — use any pilotiq Field type. The result lives in the document as a single ProseMirror node with `attrs.blockType` and `attrs.blockData`.

## Storage

The hidden form input carries either a JSON string or an HTML fragment, depending on `.storage(...)`. The form lifecycle's `coerceFormValues('richtext')` parses JSON before save; HTML mode passes through as a string. Both formats round-trip through Prisma `String` columns.

## Read-side rendering

`registerTiptap()` also wires a server-side renderer so display surfaces (`TextEntry` on `Resource.detail()`, default-text columns in `Table`) auto-render Tiptap content to HTML — without shipping the editor to read-only pages.

```ts
import { renderRichTextToHtml, isRichTextValue } from '@pilotiq/tiptap'
//   or for a server-only import path:
// import { renderRichTextToHtml, isRichTextValue } from '@pilotiq/tiptap/render'

renderRichTextToHtml({ type: 'doc', content: [...] })
// '<p>Hello <strong>world</strong></p>'
```

The renderer is a pure function — no DOM, no Tiptap runtime, no React. Safe to call from any server context. Coverage:

- **Nodes:** doc / paragraph / heading (1-6) / blockquote / codeBlock / bulletList / orderedList / listItem / horizontalRule / hardBreak / image / table / tableRow / tableCell / tableHeader / details / detailsSummary / detailsContent / grid / gridColumn / mergeTag / mention.
- **Marks:** bold / italic / strike / underline / subscript / superscript / code / link / textStyle (color) / highlight (color).
- **Attrs:** heading.level / orderedList.start / codeBlock.language / textAlign on paragraph + heading / image.src + alt + title + width + height / tableCell.colspan + rowspan + colwidth (also on tableHeader) / mergeTag.id / mention.id + label + trigger.
- **Custom blocks:** anything not built-in renders to `<div data-type="..." data-attrs="...">` so consumers can replay or restyle by `data-type`. Override with `renderRichTextToHtml(content, { renderBlock: (node) => ... })`.
- **Sanitization:** text content is HTML-escaped; link hrefs reject `javascript:` / `data:` / `vbscript:` (fall back to `#`); image srcs with the same schemes drop the `<img>` entirely (no broken `src="#"` re-fetch); image dimensions parse to integers and silently drop bad / non-finite / negative values; color values are allowlisted to hex / rgb / hsl / oklch / named. Surrounding markup is constructed by us, not parsed from user input — the posture matches `Markdown` / `Html` display primes (admin-trusted authors).

### Auto-render on `TextEntry` and `Table` columns

Once `registerTiptap()` runs, no extra wiring is needed — the registry-aware display surfaces detect rich-text content and render finished HTML:

```ts
Resource.make('Article').detail((record) => [
  TextEntry.make('body'),                              // auto-renders Tiptap JSON
  TextEntry.make('publishedAt').since(),               // built-in formatter wins
  TextEntry.make('summary').formatStateUsing(plain),   // user formatter wins
])

Resource.make('Article').table((table) => table.columns([
  Column.make('body').lineClamp(3),                    // auto-renders + clamps
  Column.make('publishedAt').dateTime(),               // skipped (has format)
]))
```

The auto-detect is conservative: it only matches the canonical `{ type: 'doc', content: [...] }` shape (object or JSON-encoded string). Plain text, raw HTML strings, and arbitrary JSON columns fall through to the default formatter. Without `registerTiptap()`, the registry has no renderer and these surfaces behave exactly as before.

## Floating toolbars

The selection-anchored toolbar shows when text is selected and offers the inline marks (B / I / Strike / Code / Link). Toggle via `.floatingToolbar(false)`. The top-level toolbar covers the rest.

A separate **table toolbar** appears above the enclosing `<table>` whenever the cursor is inside one — five logical groups: column ops (add before/after, delete), row ops (add before/after, delete), merge/split, header-row + header-cell toggles, and delete-table. The buttons read `editor.can().<command>()` for their disabled state, so options that don't apply to the current cell render greyed out instead of crashing on a no-op chain. The table toolbar is independent of `.floatingToolbar(...)` (which gates the inline-mark variant) and shows whenever `@tiptap/extension-table` is wired.

## Tables

Insert a 3×3 table with a header row via the `table` toolbar button (or by adding it to a `toolbarButtons` group). While the cursor is inside a table:

- The **table toolbar** floats above the table with cell-management buttons.
- All `table*` ids in the toolbar union (`tableAddColumnBefore`, `tableAddRowAfter`, `tableMergeCells`, `tableToggleHeaderCell`, `tableDelete`, …) work in the top-level toolbar too.
- Drag a column-divider to resize. Resize state is stored on the cell as `colwidth: number[]`; the read-side renderer turns it into a `<colgroup>` so `<table>` HTML matches the editor's column proportions.
- `lastColumnResizable: false` is on by default — the right-edge handle won't grow the table beyond its container.

Tables are best for small tabular data inline with the article body. For records-as-rows, use a Resource — its `Table` page has filters, sorting, pagination, and editable columns.

## Collapsible blocks

Insert a native `<details>` block via `/` → **Collapsible block** in the slash menu, or add `'details'` to a `toolbarButtons` group. Each block is a node trio (`details` / `detailsSummary` / `detailsContent`); the editor renders a click-to-toggle disclosure widget, and the read-side renderer emits standard HTML:

```html
<details><summary>Click to expand</summary><p>Hidden content</p></details>
```

The open / closed state is persisted on the document — `Details.configure({ persist: true })` is the default so SSR + reload pick up the state the author left it in. When `attrs.open === true`, the renderer adds the platform `open` attribute to the `<details>` tag.

## Multi-column grids

Insert a 2- or 3-column grid via the slash menu (`/` → **Two-column grid** / **Three-column grid**) or add `'grid'` to a `toolbarButtons` group. Pair `'gridDelete'` to unwrap the enclosing grid back into a flat sequence of paragraphs. Schema constrains column count to 2 or 3 — there's no path to a 1-col or 4+-col grid through any surface (toolbar, slash, paste).

```html
<div class="pilotiq-grid pilotiq-grid-cols-2"><div><p>Left</p></div><div><p>Right</p></div></div>
```

The package ships **no CSS** — pair the class names with a Tailwind rule (`.pilotiq-grid { display: grid; gap: 1rem } .pilotiq-grid-cols-2 { grid-template-columns: repeat(2, 1fr) } .pilotiq-grid-cols-3 { grid-template-columns: repeat(3, 1fr) }`) or whatever your stylesheet shape prefers. Same posture as `lead` / `small` size marks: consumer owns the styling.

The toolbar's `grid` button defaults to 2 columns when clicked — most-common-case UX. The slash entries cover both column counts directly.

## Merge tags

Surface a `{{ tag }}` placeholder for each identifier in the slash menu. Picking one inserts a `mergeTag` inline atom node (`{ type: 'mergeTag', attrs: { id: 'firstName' } }`) that renders in the editor as a small chip:

```ts
RichTextField.make('body').mergeTags(['firstName', 'company', 'unsubscribeUrl'])
```

Read-time substitution happens through `renderRichTextToHtml(content, { mergeTags })`. Pass a `Record<string, string>` and each placeholder is replaced with the value (HTML-escaped):

```ts
renderRichTextToHtml(article.body, {
  mergeTags: {
    firstName:      user.firstName,
    company:        user.company,
    unsubscribeUrl: `https://example.com/u/${user.id}/unsubscribe`,
  },
})
// '<p>Hi Sleman, …</p>'
```

When no map (or no key for a given id) is supplied, the renderer emits `<span class="merge-tag" data-id="...">{{ id }}</span>` so server-rendered previews stay informative — useful for "draft" surfaces that show what the message *will* look like, not what it does for a specific recipient.

## Mentions

Wire one or more mention providers — each owns a single trigger character (`@`, `#`, …) and a static item list. Typing the trigger opens a popover anchored to the cursor; picking an item inserts a `mention` inline atom node carrying `id`, `label`, and `trigger`.

```ts
import { MentionProvider } from '@pilotiq/tiptap'

RichTextField.make('body').mentions([
  MentionProvider.make('@').items([
    { id: 'sleman', label: 'Sleman' },
    { id: 'admin',  label: 'Admin'  },
  ]),
  MentionProvider.make('#').items([
    { id: 'general', label: 'general', group: 'Channels' },
    { id: 'random',  label: 'random',  group: 'Channels' },
  ]),
])
```

Items can declare an optional `group` string — the popover renders matching items together under that heading.

Read-time rendering uses the cached `label` by default (the editor stamps it at insert, so static snapshots stay self-contained). Pass `resolveMention` to refresh stale display names from a directory:

```ts
renderRichTextToHtml(article.body, {
  resolveMention: (trigger, id) => directory.get(`${trigger}${id}`)?.displayName,
})
```

The renderer always emits a styled `<span class="mention" data-trigger="@" data-id="sleman">@Sleman</span>` — the wrapping span carries the structural attributes so consumers can re-style or rewrite each chip downstream.

### Async items — `MentionProvider.itemsUsing(async (query, ctx) => …)`

Static items are declared once at form-build time. For larger or live-changing item sets — search a users table, hit a directory service, gate items by tenant — pass an async resolver instead. The closure runs **server-side** on each keystroke; the editor fetches a tiny per-form endpoint and renders the response.

```ts
MentionProvider.make('@').itemsUsing(async (query, ctx) => {
  const matches = await db.users.search(query, { limit: 10 })
  return matches.map(u => ({ id: u.id, label: u.name }))
})
```

`ctx` carries `{ user, record?, request? }` — the same opaque user object configured via `Pilotiq.user(req => …)`, the loaded record on edit-mode forms, and the raw request for adapters that need cookie / header access.

`items()` and `itemsUsing()` are mutually exclusive; the last call wins and a `console.warn` fires when the previously-set items list is silently dropped. Mixing static + async providers on the same field is supported (`@` async for users, `#` static for a fixed channel list).

The wire path is `POST {scope}/_form/{formId}/mentions` with body `{ field, trigger, query }`. Pilotiq stamps the URL onto the field meta when at least one provider has `itemsUsing(fn)` — fields with only static providers stay URL-less and the client never makes a network call.

The endpoint reuses each scope's existing auth gate: resource-create routes through `R.canAccess + R.canCreate`, resource-edit through `R.canAccess + R.canEdit`, global-edit through `G.canAccess + G.canEdit`, custom pages through `Page.canAccess`. A throwing resolver returns `422` with the error message; the popover degrades to "no matches" rather than crashing.

> Async-mention providers inside a Repeater or Builder row are supported. The client posts the row-relative dotted path (`items.0.body` for a Repeater leaf, `blocks.0.data.body` for a Builder leaf); the route handler parses the prefix and looks up the field against the Repeater's template / each Builder block's schema. Field config (providers + resolver) is shared across rows, so the `<index>` segment is informational — any row resolves to the same template field. **Builder caveat:** when two blocks define a RichTextField with the same leaf name and different async providers, only the first block in declaration order is reachable from the dispatcher. Give them distinct names if you need per-block resolution.

## Custom blocks

```ts
Block.make('callout').label('Callout').icon('💡').schema([
  TextField.make('title'),
  TextareaField.make('content').required(),
  SelectField.make('tone').options([
    { value: 'info',    label: 'Info' },
    { value: 'warning', label: 'Warning' },
  ]),
])
```

Each inserted block renders as a compact summary card inside the document — block icon, label, and a one-line preview of the filled fields. Clicking **Edit** opens a side panel docked to the right of the editor; the panel mounts the block's schema as a real pilotiq form (via the `<FormFields>` renderer from `@pilotiq/pilotiq/react`) so every field type that pilotiq supports works consistently across the rest of your forms. Editing writes back into `attrs.blockData` on every keystroke — no save button, no roundtrip.

The panel tracks its position through every editor transaction, so live edits elsewhere in the document don't desync the panel. If the block is deleted while the panel is open, the panel closes itself.

**Field-type coverage:** every pilotiq field type works inside a custom block. Flat fields (`TextField`, `TextareaField`, `SelectField`, `ToggleField`, `CheckboxField`, `RadioField`, `ToggleButtonsField`, `DateField`, `DateTimePickerField`, `EmailField`, `NumberField`, `SliderField`, `ColorPickerField`) flow through directly. Nested-shape fields (`RepeaterField`, `BuilderField`, `FileUploadField`, `MarkdownField`, `KeyValueField`, `TagsInputField`, `CheckboxListField`) round-trip too: the panel snapshots the entire form's DOM state, rebuilds nested arrays / objects from dotted-path inputs, and coerces JSON-encoded hidden inputs (TagsInput, KeyValue, FileUpload-multi) back to their canonical wire shapes before writing into `attrs.blockData`.

**Layout caveat:** the panel is positioned `absolute` to the right of the editor wrapper. On narrow form layouts it may extend into adjacent content; this is intentional — the panel doesn't push the editor sideways or reflow the page.

## AI suggestions

`@pilotiq/tiptap` ships an always-on `AiSuggestionExtension` that turns
any range in the document into an **inline-diff hunk**: strikethrough on
the original text, a chip-widget at the range end carrying a preview of
the replacement, and per-hunk Approve / Reject buttons. The extension
is idle until the host calls `editor.commands.addAiSuggestion(...)` or
the cross-package suggestion bridge pushes one in.

```ts
editor.commands.addAiSuggestion({
  id:          'seo-1',
  from:        12,
  to:          18,
  replacement: 'better',
  source:      { agentLabel: 'SEO' },
})

// User clicks ✓ on the chip, or the host calls programmatically:
editor.commands.approveAiSuggestion('seo-1')
```

### Command surface

| Command | What it does |
|---|---|
| `addAiSuggestion(s)` | Add or replace a suggestion (matched by id). |
| `addAiSuggestions(s[])` | Add or replace many in one transaction. |
| `approveAiSuggestion(id)` | Replace the range with the suggestion's text + drop from state. |
| `rejectAiSuggestion(id)` | Drop from state without touching the document. |
| `approveAllAiSuggestions()` | Apply every replacement in highest-`from`-first order so earlier replacements don't shift later positions. |
| `rejectAllAiSuggestions()` | Drop every suggestion. |
| `clearAiSuggestions()` | Alias for `rejectAllAiSuggestions`. |

### Suggestion shape

```ts
import type { AiSuggestion } from '@pilotiq/tiptap'

interface AiSuggestion {
  id:          string                 // stable; re-adding replaces
  from:        number                 // inclusive document position
  to:          number                 // exclusive position; from===to = pure insertion
  replacement: string                 // plain text in v1
  source?:     { agentSlug?: string; agentLabel?: string }
}
```

Plain-text replacement only in v1 — marks and structure are not carried
on the inserted text node. Document marks at the original range are
preserved by ProseMirror when the chip is approved.

### Range remapping

Suggestion ranges remap through every doc transaction's `tr.mapping`
(left-bias `from`, right-bias `to`). Ranges that collapse past each
other (`to < from`) drop automatically — if the user types over the
suggested range and obliterates it, the chip vanishes silently.

### Styling

The package stays CSS-free — consumers ship the matching styles. Default
classes:

| Class | Where |
|---|---|
| `pilotiq-ai-suggestion-original` | Inline decoration on the original `from..to` range (typically strikethrough + muted color). |
| `pilotiq-ai-suggestion-chip` | Widget root at `to`. |
| `pilotiq-ai-suggestion-replacement` | Inline preview of the suggested text inside the chip. |
| `pilotiq-ai-suggestion-accept` | The ✓ button. |
| `pilotiq-ai-suggestion-reject` | The ✕ button. |

The class prefix is configurable via the extension's `classPrefix`
option (`'pilotiq-ai-suggestion'` by default).

### Cross-package bridge — `useAiSuggestionBridge(editor, fieldName)`

For the typical AI use case, the editor's suggestion list is mirrored
to/from pilotiq core's [`PendingSuggestionsContext`](/docs/pro/ai-suggestions)
— that context is what the chat-sidebar pending pill, FieldShell overlay,
and out-of-tree approve actions read. `TiptapEditor` mounts the bridge
automatically, so the typical pilotiq install gets the round-trip for
free.

For a custom editor mount (e.g. a standalone Tiptap instance outside
pilotiq's field renderer), wire the bridge yourself:

```tsx
import { useAiSuggestionBridge } from '@pilotiq/tiptap'

function MyEditor() {
  const editor = useEditor({ /* … */ })
  useAiSuggestionBridge(editor ?? null, 'myField')
  return <EditorContent editor={editor} />
}
```

The bridge:

- **Context → editor**: every queue entry whose
  `meta.editorRange = { from, to }` is set and whose `suggestedValue`
  is a string gets pushed into the editor as an inline-diff hunk via
  `addAiSuggestion`. Entries that leave the queue are removed via
  `rejectAiSuggestion` (no document edit).
- **Editor → context**: when a chip's Approve / Reject button removes
  a hunk from the editor's plugin state, the matching id is dismissed
  from the queue (`dismiss(id)`) so other surfaces (chat-pill,
  FieldShell overlay registered by another plugin) clear in lock-step.

The bridge is cycle-protected via an internal `pushedRef: Set<string>`
so direct `editor.commands.addAiSuggestion(...)` calls (host code) don't
echo back through a context that never knew about them.

### Pure helpers (testing)

For consumers that want to unit-test producer logic without spinning up
an editor, the extension's pure helpers are exported:

| Helper | Purpose |
|---|---|
| `upsertSuggestion(list, next)` | Append or replace by id. |
| `upsertSuggestions(list, nexts)` | Fold multi-add over `upsertSuggestion`. |
| `removeSuggestion(list, id)` | Filter by id. |
| `remapSuggestions(list, mapFn)` | Drop collapsed ranges; remap survivors. |
| `sortForApproveAll(list)` | Highest-`from`-first order. |
| `clampPos(pos, max)` | Bound a position into `[0, max]`. |
