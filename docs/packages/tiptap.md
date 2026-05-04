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
  @tiptap/extension-highlight
```

## Setup

One call in your client entry (e.g. `pages/+Layout.tsx`):

```ts
import { registerTiptap } from '@pilotiq/tiptap'

// Tells pilotiq's SchemaRenderer how to render fieldType: 'richtext'.
registerTiptap()
```

Without `registerTiptap()`, `RichTextField` form fields render as nothing — `SchemaRenderer` can't find a renderer for the `'richtext'` type.

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

## Toolbar buttons

Recognized button ids (use them in `toolbarButtons` / `enableToolbarButtons` / `disableToolbarButtons`):

```
Inline marks   bold italic underline strike subscript superscript code
Headings       paragraph h1 h2 h3 h4 h5 h6
Alignment      alignStart alignCenter alignEnd alignJustify
Block prims    blockquote codeBlock bulletList orderedList horizontalRule
Style          textColor highlight clearFormatting
Editing        link undo redo
```

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

Reserved button ids land in later releases — `attachFiles`, `table*`. Configs that target them today are silently dropped.

## Slash menu

Opens on `/`. Built-in items:

- **Basic** — Text, Quote, Code block, Divider, Clear formatting
- **Headings** — Heading 1 to 6
- **Lists** — Bullet list, Numbered list
- **Align** — Align left, Align center, Align right
- **Blocks** — every entry in `.blocks([...])`

Each registered `Block` becomes a slash item that inserts an inline form. The block's `schema([fields])` defines the form layout — use any pilotiq Field type. The result lives in the document as a single ProseMirror node with `attrs.blockType` and `attrs.blockData`.

## Storage

The hidden form input carries either a JSON string or an HTML fragment, depending on `.storage(...)`. The form lifecycle's `coerceFormValues('richtext')` parses JSON before save; HTML mode passes through as a string. Both formats round-trip through Prisma `String` columns.

## Floating toolbars

The selection-anchored toolbar shows when text is selected and offers the inline marks (B / I / Strike / Code / Link). Toggle via `.floatingToolbar(false)`. The top-level toolbar covers the rest.

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

The block's NodeView mounts the schema as an inline form. Editing fills `attrs.blockData`. Removing the block deletes the node.

## Migration from `@pilotiq/lexical`

Same shape — `RichTextField.make().blocks([Block.make()...])`. Lexical's `RichTextEditor` and Tiptap's `RichTextField` both store JSON; you can flip the field type and the form keeps working as long as you're not introspecting the JSON shape elsewhere.
