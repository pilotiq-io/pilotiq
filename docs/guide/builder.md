# Builder field

`Builder.make(name).blocks([...])` is the heterogeneous-row sibling of
[`Repeater`](./repeater.md). Each row picks one of N **block types** and
carries that block's own inner schema. Storage on the parent record is
a `{ type, data }` envelope per row:

```json
{
  "content": [
    { "type": "heading",   "data": { "text": "Welcome", "level": "h1" } },
    { "type": "paragraph", "data": { "body": "A short intro paragraph." } },
    { "type": "image",     "data": { "url": "/img/cover.jpg", "alt": "Cover" } }
  ]
}
```

Use it for page builders, newsletter composers, CMS section editors —
anywhere the natural shape is "0 or more of *one of these* little
forms."

## Quick example

```ts
import {
  Form, Builder, Block,
  TextField, TextareaField, SelectField, ToggleField,
} from '@pilotiq/pilotiq'

Form.make()
  .formId('pages-edit')
  .schema([
    Builder.make('content')
      .label('Page content')
      .reorderable()
      .cloneable()
      .collapsible()
      .blockNumbers()
      .addActionLabel('Add block')
      .blocks([
        Block.make('heading')
          .label('Heading')
          .icon('heading')
          .columns(2)
          .maxItems(1)                 // exactly one Hero per page
          .schema([
            TextField.make('text').required(),
            SelectField.make('level').options([
              { value: 'h1', label: 'H1' },
              { value: 'h2', label: 'H2' },
              { value: 'h3', label: 'H3' },
            ]).default('h1'),
          ]),
        Block.make('paragraph')
          .label('Paragraph')
          .icon('paragraph')
          .schema([
            TextareaField.make('body').required(),
          ]),
        Block.make('image')
          .label('Image')
          .icon('image')
          .columns(2)
          .schema([
            TextField.make('url').required(),
            TextField.make('alt'),
            ToggleField.make('fullWidth'),
          ]),
      ]),
  ])
```

The user clicks **Add block**, picks Heading / Paragraph / Image from
the dropdown, and the renderer mounts that block's schema as a fresh
row.

## Block API

```ts
Block.make('name')
  .label('Display label')          // defaults to titlecased name
  .icon('heading')                 // string registry key (lucide / tabler / ...)
  .schema([Field, Field, ...])     // inner schema for this block type
  .columns(2)                      // grid columns inside this block's body
  .maxItems(1)                     // optional cap on how many rows of this type
  .visible(({ user }) => …)        // hide block from the picker conditionally
```

`Block.visible(rule)` accepts the same shape as layout `visible()`:
either a literal `boolean` or a `(LayoutContext) => bool | Promise<bool>`
callback (`ctx.user / record / values / $get / $set`). Hidden blocks
drop from the picker dropdown only — **existing rows of a now-hidden
block keep rendering with their full schema and round-trip on save**,
so toggling visibility on a feature flag never silently destroys
content. Throwing predicates fail closed (block stays hidden).

Blocks are composition primitives — they don't extend `Element`, they
don't render in the schema tree on their own. `Builder.blocks([…])` is
the only place a `Block` is mounted.

## Builder API

| Method | Effect |
|---|---|
| `.blocks([Block…])` | Register the block types the picker offers (order = picker order) |
| `.addBetween()` | Mount thin `+` insertion zones above each row so the user can insert a block mid-stack without scrolling. Additive — the bottom **Add block** button stays. Suppressed in `grid()` mode. |
| `.minItems(n)` / `.maxItems(n)` | Total-row validator + client gate |
| `.reorderable()` | Drag handle + Up / Down buttons |
| `.reorderableWithButtons()` | Force button-only reorder (drag disabled) |
| `.collapsible()` | Per-row collapse chevron |
| `.collapsed()` | Render rows collapsed by default |
| `.accordion()` | One-row-open-at-a-time mode. Picking a row collapses every other row. Auto-arms `collapsible()`. Pair with `.collapsed()` to start with everything closed (default opens the first visible row). Open-row id persists per-form to `localStorage`. |
| `.grid(n)` | Lay the *rows themselves* in an n-column grid (n ≥ 2). Different from `Block.columns(n)`, which grids fields *inside* one block's body. n < 2 is the off sentinel. Drag-drop indicator is suppressed in grid mode; ↑ / ↓ buttons still work. |
| `.cloneable()` | Per-row duplicate button |
| `.addable(false)` | Hide the **Add block** button (UX gate) |
| `.deletable(false)` | Hide per-row delete buttons (UX gate) |
| `.addActionLabel(text)` | Custom add button label (default `Add block`) |
| `.addActionAlignment('start' \| 'center' \| 'end')` | Position of the add button |
| `.blockPickerColumns(n)` | Grid layout of the picker dropdown |
| `.blockNumbers()` | `1.` `2.` `3.` numbering on row headers |
| `.blockIcons(false)` | Hide block icon in row headers (default on) |
| `.itemLabel((data, blockName) => string)` | Dynamic header label per row |
| `.itemHidden(rule)` | Per-row visibility — UX-only, values still round-trip |
| `.defaultBlock('name')` | Block name used for "quick add" UX (advisory) |

Live updates, validation, dehydration, and visibility all work the same
as inside `Repeater` — see [`reactive-fields`](../plans/reactive-fields.md)
and [`schema-layouts`](../plans/schema-layouts.md). The
**dotted path** addressing is `name.<index>.data.<field>` (the literal
`data` segment separates the row envelope from the block schema):

```ts
TextField.make('text')
  .live()
  .afterStateUpdated((value, ctx) => {
    // ctx.row.index, ctx.row.blockType, ctx.row.$get / $set are row-scoped.
    // ctx.$get('content.0.data.text') reads cross-row.
  })
```

## Per-block `maxItems`

`Block.maxItems(n)` caps how many of *that* block can appear in a single
`Builder` field. The picker greys out the option once the cap is hit;
the server enforces the same cap as a validator. Useful for "exactly
one Hero" or "at most three callouts."

```ts
Block.make('hero').label('Hero').maxItems(1).schema([…])
```

## Storage shape

```ts
[
  { __id?: string, type: 'block-name', data: { …block fields } },
  …
]
```

- `__id` is a stable client-side id round-tripped through a hidden
  input. Optional on first save; the client generates one on Add and
  preserves it across reorder / clone / collapse.
- `type` is the row's block discriminator. The server uses it to look
  up the matching `Block.schema()` for resolution + validation +
  partial re-resolve.
- `data` holds the block's own field values. Inner field names live
  inside this envelope, so two blocks can both declare a `title` field
  without collision.

The flat / urlencoded form-post fallback uses dotted keys:

```
content.0.__id=…
content.0.type=heading
content.0.data.text=Welcome
content.0.data.level=h1
content.1.type=paragraph
content.1.data.body=…
```

`coerceFormValues` folds them back into the envelope shape. Trailing
empty rows (no values entered in `data`) are trimmed before validation
runs, matching `Repeater` semantics.

## Comparison with Repeater

| Need | Use |
|---|---|
| Same shape per row (line items, FAQs, contacts) | `Repeater` |
| Different shapes per row, picked from a fixed set | `Builder` |
| One-of-many *plus* free-form text | `Builder` (each block is a flavor) |
| User-defined block types | Out of scope — both fields take a fixed schema |

## Cross-row uniqueness — `distinct()`

`Field.distinct()` works inside a Builder block's schema the same way
it does inside a Repeater, with one extra wrinkle: comparison is
**scoped to rows of the same block type**. Two `heading` rows with
the same title conflict; a `heading.title = "X"` never conflicts with
a `paragraph.body = "X"`.

```ts
Builder.make('content').blocks([
  Block.make('embed').schema([
    TextField.make('url')
      .required()
      .distinct({ caseInsensitive: true, message: 'Each embed URL must be unique' }),
  ]),
  // ... other blocks
])
```

Same option set as Repeater (`caseInsensitive / ignoreNulls /
message`) — see the [Repeater guide](./repeater.md) for full
discussion.

## Stale block types

If a previously-used block name is removed from `.blocks([…])`, existing
rows with that `type` are still loaded. They render with a placeholder
("Unknown block type — save will preserve the row's data unchanged")
and round-trip through coercion verbatim, so a config rollback never
silently loses data.

## Limitations (v1)

- **Nested array-row inside a block.** `Repeater` or `Builder` inside
  a block's schema works at SSR but the client-side reactive
  re-resolve doesn't address paths past `data.<leaf>`. Surface the
  inner content via `.live()` on a leaf field.
- **Per-row authorization.** `canAdd / canDelete` per row aren't
  exposed yet. Use `Resource.canEdit` for the page-level gate.
- **Block previews.** Filament's read-only `Block::preview('view.path')`
  isn't implemented. Track via a separate plan if a consumer needs it.

See the working demo at `/new-admin/builder-demo` (run
`playground-pilotiq`).
