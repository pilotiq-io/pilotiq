# @pilotiq/tiptap

## Overview

Tiptap rich-text adapter for `@pilotiq/pilotiq`. Adds a `RichTextField` to the form-field catalog with always-on toolbar, selection-anchored floating toolbar, slash menu (`/`), draggable blocks, mention/merge-tag chips, and a custom-block API for embedding inline forms inside a document.

Separate package because Tiptap's extension set is modular and not every app needs long-form content. Mirrors `@pilotiq/codemirror` — small adapter, opt-in registration.

## Setup

```bash
pnpm add @pilotiq/tiptap \
  @tiptap/core @tiptap/pm @tiptap/react @tiptap/starter-kit @tiptap/suggestion \
  @tiptap/extension-link @tiptap/extension-placeholder \
  @tiptap/extension-underline @tiptap/extension-subscript @tiptap/extension-superscript \
  @tiptap/extension-text-align @tiptap/extension-text-style @tiptap/extension-color \
  @tiptap/extension-highlight @tiptap/extension-image @tiptap/extension-table \
  @tiptap/extension-details
```

Register the plugin on the panel:

```ts
// app/Pilotiq/AdminPanel.ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { tiptap } from '@pilotiq/tiptap'

export const adminPanel = Pilotiq.make('Admin')
  .path('/admin')
  .plugins([
    tiptap(),
  ])
```

The plugin form is sugar over `registerTiptap()` — it runs on both server and client through the panel module. Without registration, `RichTextField` form fields render as nothing because `SchemaRenderer` can't find a renderer for `fieldType: 'richtext'`.

## Key Patterns

### Basic usage

```ts
import { RichTextField } from '@pilotiq/tiptap'

Resource.make('Article').form((form) => form.schema([
  TextField.make('title').required(),
  RichTextField.make('body')
    .label('Body')
    .placeholder('Start writing…')
    .required(),
]))
```

The field stores Tiptap JSON by default. Use `.storage('html')` for serialized HTML if your column type is text-only.

### Custom blocks

`Block` defines a reusable embed — a card with its own form schema. Users insert via the slash menu (`/`), edit via the side panel.

```ts
import { Block, RichTextField } from '@pilotiq/tiptap'
import { TextField, TextareaField, SelectField, FileUpload } from '@pilotiq/pilotiq'

RichTextField.make('body')
  .blocks([
    Block.make('callout')
      .label('Callout')
      .icon('💡')                              // emoji or @pilotiq/pilotiq icon registry name
      .schema([
        SelectField.make('variant').options({ info: 'Info', warning: 'Warning', danger: 'Danger' }),
        TextField.make('title').required(),
        TextareaField.make('content').required(),
      ]),

    Block.make('youtube')
      .label('YouTube embed')
      .icon('youtube')
      .schema([
        TextField.make('url').required().placeholder('https://www.youtube.com/watch?v=…'),
      ]),

    Block.make('cta')
      .label('Call to action')
      .icon('zap')
      .schema([
        TextField.make('heading').required(),
        TextField.make('label').default('Learn more'),
        TextField.make('href').required(),
      ]),
  ])
```

Behavior:

- Inserting a block via `/` opens the side panel with the block's `.schema([…])` mounted as a real pilotiq form.
- Edits write back into the block's `attrs.blockData` on every keystroke — no save button.
- The side panel uses `<FormFields>` from `@pilotiq/pilotiq/react`, so every field type from `pilotiq-fields` works (TextField / SelectField / Toggle / Repeater / Builder / FileUpload / etc.).
- `Mod-E` (Cmd/Ctrl-E) on a selected block opens its side panel. `ESC` closes.

The block name (`'callout'`, `'youtube'`, `'cta'`) is the discriminator — **never use `'block'` as a name**, it collides with ProseMirror's schema GROUP and breaks `contentMatchAt`. The framework's built-in node is `pilotiqBlock` so user-supplied names are safe.

### Toolbar customization

```ts
RichTextField.make('body')
  .toolbarButtons([
    ['bold', 'italic', 'underline', 'strike', 'link'],
    ['h2', 'h3'],
    ['textColor', 'highlight'],
    ['bulletList', 'orderedList'],
    ['attachFiles', 'table', 'details', 'grid', 'gridDelete'],
    ['undo', 'redo'],
  ])
```

Or use the incremental setters against the defaults:

```ts
RichTextField.make('body')
  .enableToolbarButtons(['lead', 'small'])      // append to last group
  .disableToolbarButtons(['table'])              // drop from every group
```

Default layout:

```
[
  ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'link'],
  ['h2', 'h3'],
  ['alignStart', 'alignCenter', 'alignEnd'],
  ['blockquote', 'codeBlock', 'bulletList', 'orderedList'],
  ['undo', 'redo'],
]
```

Recognized button ids:

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

Unknown ids are silently dropped — the union is intentionally forward-compatible.

Hide the toolbar entirely with `.toolbar(false)`. Disable the floating selection toolbar with `.floatingToolbar(false)`. Disable the slash menu with `.slashCommand(false)`.

### Merge tags

```ts
RichTextField.make('body')
  .mergeTags(['firstName', 'lastName', 'company', 'unsubscribeUrl'])
```

Each id appears under the **Merge tags** group of the slash menu and inserts a `{{ firstName }}` chip in the editor. On the server, the chip serializes verbatim as `{{ firstName }}` text — your render-time substitution handles the replacement.

### Mentions

```ts
import { RichTextField, MentionProvider } from '@pilotiq/tiptap'

RichTextField.make('body')
  .mentions([
    MentionProvider.make('@')
      .items([
        { id: 'alice', label: 'Alice', subtitle: 'Engineering' },
        { id: 'bob',   label: 'Bob',   subtitle: 'Design' },
      ]),

    MentionProvider.make('#')
      .itemsUsing(async (query, ctx) => {
        const tags = await Tag.query()
          .where('name', 'LIKE', `%${query}%`)
          .paginate(1, 10)
        return tags.data.map(t => ({ id: t.slug, label: t.name }))
      }),
  ])
```

Static items render immediately. Async items POST to a per-form `_mentions/:provider` endpoint with the typed query and the form's render context. Async resolvers see the current user + record + parent (when inside a `Repeater` / `Builder` row).

The chip serializes as `@alice` / `#performance` in HTML output and as a node attr in JSON. Your display layer chooses how to resolve / link the chip.

### File attachments

`attachFiles` toolbar button uploads via the panel's registered `UploadAdapter`:

```ts
RichTextField.make('body')
  .fileAttachmentsAcceptedFileTypes(['image/*', 'application/pdf'])
  .fileAttachmentsMaxSize(5 * 1024 * 1024)       // 5 MB cap
  .fileAttachmentsDirectory('articles')          // sub-directory hint
  .fileAttachmentsVisibility('public')           // adapter-dependent
  .resizableImages()                              // drag-handle resize on images
```

The upload route also enforces `maxSize` server-side (tampered client can't bypass). Without an `UploadAdapter` registered on the panel, the `attachFiles` button silently hides — wire one with `panel.uploads({ adapter: localUpload(...) })`.

### Storage format

```ts
RichTextField.make('body')
  .storage('json')        // default: Tiptap JSON document
  .storage('html')        // serialized HTML string
```

Use JSON for editor-round-trip fidelity (lossless across save/load). Use HTML when the column is plain `TEXT` and you don't need the editor to read it back perfectly (the editor parses HTML back but loses some node-level attrs).

### Server-side rendering

For display surfaces (`TextEntry`, `Column` with `.markdown()` / `.html()`), use the pure renderer:

```ts
import { renderRichTextToHtml } from '@pilotiq/tiptap'

const html = renderRichTextToHtml(article.body)
//   safe to call from any server context — no DOM, no Tiptap runtime
```

The renderer is a pure function in `src/render.ts` with zero Tiptap runtime deps — usable in workers, edge functions, etc.

### Floating toolbar + slash menu

These are on by default. The floating toolbar mounts on text selection with the most-used inline marks (bold / italic / link / clearFormatting); the slash menu opens cursor-anchored on `/` with groups: **Insert**, **Style**, **Format**, **Merge tags** (when set), plus any user `blocks([…])`.

Both can be disabled per field:

```ts
RichTextField.make('body')
  .floatingToolbar(false)
  .slashCommand(false)
```

### Collab mode

When the host panel's `collab` slot is wired (via `@pilotiq-pro/collab`), `RichTextField` automatically participates in record-room collaborative editing — peers see each other's cursors, edits merge via Y.js CRDT, no opt-in needed on the field itself. The pro package handles the awareness + sync wiring.

## Common Pitfalls

- **Forgetting `registerTiptap()` / `.plugins([tiptap()])`** — `RichTextField` form fields render as nothing because `SchemaRenderer` can't find a renderer for `fieldType: 'richtext'`. The plugin form is the recommended path; register from `AdminPanel.ts` (loads on both server + client).
- **`Block.make('block')` collides with PM's schema GROUP** — never use the literal name `'block'`. Any other name is fine.
- **Drag handles missing the snap-back-to-origin three steps** — if you're writing a custom block with external drag UX, the drop handler must `setNodeSelection(pos)` AND set `view.dragging` AND call `serializeForClipboard`. Missing any of the three is the snap-back bug.
- **Mentions inside a `Repeater` / `Builder` row** need the form-state URL stamper to recognize the row-relative dotted path. The framework handles `items.0.body` (Repeater) and `blocks.0.data.body` (Builder) automatically; non-standard nesting needs manual `tagRichTextMentionUrls` walker extension.
- **`storage('html')` loses some node-level attrs on round-trip.** HTML doesn't preserve the full Tiptap JSON node tree — custom block attrs survive (they serialize to `data-*` attributes) but ordering of marks in edge cases can change. Use `'json'` if perfect round-trip matters.
- **`@pilotiq/tiptap` peer dep** — the package declares `@pilotiq/pilotiq` as a peer with the literal range `">=0.7.0 <1.0.0"` (not `workspace:^`). Pre-1.0 caret on workspace:^ would break on every pilotiq minor bump. devDep stays on `workspace:^` for local resolution.
- **Tiptap module identity** — `@tiptap/core` and `@tiptap/pm` keep state on module-level singletons. Multiple copies break the editor. Add them to `resolve.dedupe` in your Vite config: `dedupe: ['@tiptap/core', '@tiptap/pm', '@tiptap/react']`.

## Key Imports

```ts
import {
  RichTextField,              // the form field
  Block,                      // custom block primitive
  MentionProvider,            // mention dropdown source
  registerTiptap,             // installs the renderer (alternative to .plugins([tiptap()]))
  renderRichTextToHtml,       // pure server-side JSON → HTML serializer
  tiptap,                     // plugin factory for .plugins([])
} from '@pilotiq/tiptap'
```
