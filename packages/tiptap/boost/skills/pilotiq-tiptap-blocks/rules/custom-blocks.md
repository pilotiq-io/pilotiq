# Custom Blocks

A `Block` is a reusable, form-driven embed inside a `RichTextField` document. Users insert one via the slash menu (`/`), see an inline summary card in the editor, and edit its data in a right-docked side panel that mounts the block's schema as a real pilotiq form.

This is **the** primitive that sets `@pilotiq/tiptap` apart from a plain rich-text editor — long-form documents become composable surfaces (callouts, embeds, CTAs, structured media) without leaving the form.

## Defining a block

```ts
import { Block, RichTextField } from '@pilotiq/tiptap'
import { TextField, TextareaField, SelectField } from '@pilotiq/pilotiq'

Block.make('callout')                              // discriminator — see "Naming"
  .label('Callout')                                // slash-menu display label
  .icon('💡')                                      // emoji OR pilotiq icon registry name
  .schema([
    SelectField.make('variant').options({
      info: 'Info',
      warning: 'Warning',
      danger: 'Danger',
    }).default('info'),
    TextField.make('title').required(),
    TextareaField.make('content').required(),
  ])
```

Attach to a field:

```ts
RichTextField.make('body')
  .blocks([
    calloutBlock,
    youtubeBlock,
    ctaBlock,
  ])
```

Each block appears under its own slash-menu entry below the **Insert / Style / Format / Merge tags** built-in groups. The order in `.blocks([…])` is the order in the menu.

## Naming — pick anything but `'block'`

The block name is the discriminator stored in `attrs.blockType`. Both `BlockNodeView` and `BlockSidePanel` look up the active block against `RichTextField.toMeta().blocks` by that string.

**Never use `'block'`.** Tiptap's underlying ProseMirror schema reserves the name `'block'` as a *schema GROUP* — defining a node with that name breaks `contentMatchAt` and silently corrupts the editor's content matching. Any other identifier is safe; the framework's own node type is `pilotiqBlock` so it can't collide with user blocks.

Use kebab-case or camelCase: `'callout'`, `'youtube-embed'`, `'productCard'` all fine. Don't change a block's name after data exists in production — old documents will render through the unknown-block fallback path (a placeholder card preserving `attrs.blockData` verbatim — config rollbacks never lose content, but the user can't edit until the name is restored or the data is migrated).

## How the side panel works

When the user clicks the **Edit** button on a `BlockNodeView` (or hits `Mod-E` with a block selected):

1. `BlockNodeView` calls `extension.options.onEdit(getPos())` — the callback was plumbed in via `BlockNodeExtension.configure({ onEdit })`. Tiptap mounts NodeViews in a separate React tree, so `useContext` doesn't cross that boundary — the bridge has to ride extension options.
2. The host (`TiptapEditor`) opens `<BlockSidePanel>`, keyed on `pos:blockType` so swapping blocks fully remounts.
3. The panel renders `<FormFields elements={block.schema} values={initialBlockData} />` inside a `<form>` — same renderers pilotiq uses everywhere else.
4. A container-level `onChange`/`onInput` handler snapshots the **entire form**: `new FormData(formEl)` → `parseFormDataToNested(...)` (rebuilds nested arrays/objects from dotted-path inputs like `items.0.title`) → `coerceBlockValues(raw, schema)` (per-fieldType JSON parse / boolean / number coerce).
5. The coerced object dispatches as `state.tr.setNodeMarkup(pos, null, { blockType, blockData })` directly through the editor view — every keystroke updates the document.
6. The panel listens to every editor `transaction` and remaps its tracked `pos` so concurrent edits elsewhere in the doc don't desync. If the node disappears at the mapped pos (different type, or null), the panel closes itself.

## Field-type coverage inside a block

Everything in pilotiq's field catalog works inside a block. Each field serializes through hidden inputs in the form DOM, which `parseFormDataToNested` + per-fieldType coerce captures.

- **Primitives:** text, textarea, select, radio, toggleButtons, date, dateTime, email, color, number, slider, toggle, checkbox.
- **JSON-encoded:** tagsInput (`string[]`), checkboxList (`string[]`), keyValue (`Record<string, unknown>`), fileUpload (URL string, or `string[]` when `.multiple()`).
- **Plain text:** markdown (raw markdown source — server-renders via `marked` if you display it through a `Markdown` element).
- **Nested array fields:** repeater (array of subschema rows; each row's children coerce recursively against `field.template`) and builder (heterogeneous `{type, data}` rows; `row.data` coerces against the block matching `row.type` from `field.blocks[]`; unknown block types pass through verbatim).

`coerceBlockValues(raw, schema)` is exported from `@pilotiq/tiptap` for testing — a pure helper with no DOM, no React.

## Keyboard, focus, and width

These all ship out of the box — don't try to wire them yourself:

- **`Mod-E`** (Cmd+E on macOS / Ctrl+E elsewhere) — when the current selection is a `NodeSelection` on a `pilotiqBlock`, opens its side panel. Wired via `BlockNodeExtension.addKeyboardShortcuts()`. Returns `false` (yields to browser default) when no block is selected, so Safari's *Use Selection for Find* still works in plain text.
- **`Esc`** closes the panel via a bubble-phase `document` listener. Slash and mention menus listen capture-phase + `stopPropagation`, so `Esc` inside an open slash menu only closes the menu — never bubbles down to the panel.
- **Focus management.** On open, the previously focused element is captured and the first focusable inside the panel is focused. While the panel is mounted, `Tab` / `Shift+Tab` cycles within the panel's focusables (soft trap — clicks elsewhere still work). On close, the previously focused element is re-focused.
- **Width memory.** The panel has a 1-px hover-highlighted left-edge resize handle and persists its width to `localStorage` under `pilotiq.tiptap.sidePanel.width`, clamped `[240, 600]` (default 320). The pure helper `clampPanelWidth(value)` is exported for tests; it falls back to the default for `null` / `undefined` / empty-string / non-finite values, otherwise clamps numeric strings + numbers into range.

## Common authoring mistakes

- **Forgetting `.schema([…])`** — a block with no schema renders as a card with no editable fields. Always declare at least one field, even if it's just `TextField.make('content')`.
- **Reusing field names across blocks.** Each block has its own isolated schema — `Block.make('a').schema([TextField.make('title')])` and `Block.make('b').schema([TextField.make('title')])` are completely independent. Inside a single block, `name` collisions break the form like anywhere else.
- **Mutating `blockData` directly from outside the side panel** — don't. The panel is the single writer (via `setNodeMarkup`). If you need to programmatically update a block's data, dispatch a Tiptap transaction.
- **Async work inside a field's `live()` hook in a block.** It works, but every keystroke fires a partial-resolve to the panel's enclosing form `stateUrl`. Heavy DB queries should debounce (`.live({ debounce: 300 })`). The panel re-mounts the field on the response — keep the round-trip fast.

## See also

- `slash-menu-and-mentions.md` — how blocks appear in the slash menu alongside built-ins, mentions, and merge tags.
- `toolbar-and-extensibility.md` — toolbar customization, drag-handle gotcha, opt-in primitives (`details`, `grid`, `lead` / `small`).
- Pilotiq side: [[pilotiq-fields]] (`pilotiq-fields/rules/field-catalog.md`) for the inner-field types you can use inside `Block.schema([…])`.
