# Repeater.relationship and Builder.relationship

`Repeater.relationship(name)` and `Builder.relationship(name)` are the inline-row alternatives to `RelationManager`. Instead of a separate tab with its own table, rows live ON the parent's form — typed inline, persisted to a real `hasMany` / `morph*` / M2M relation (Repeater) or a discriminator + JSON-payload child table (Builder).

Use these for tight 1-to-few relations where you want inline editing on the parent form: line items on an order, slides in a presentation, blocks in a CMS page.

## `Repeater.relationship` — uniform rows

```ts
Repeater.make('lineItems')
  .relationship('lineItems')
  .schema([
    TextField.make('description').required(),
    NumberField.make('quantity').min(1).required(),
    NumberField.make('unitPrice').step(0.01).required(),
  ])
  .min(1)
  .reorderable()
  .orderColumn('position')                // optional — stamp index on save
```

The parent Model must declare the relation:

```ts
export class Order extends Model {
  static override relations = {
    lineItems: { type: 'hasMany', model: () => LineItem, foreignKey: 'orderId' },
  }
}

export class LineItem extends Model {
  static override table = 'line_items'
  description!: string
  quantity!: number
  unitPrice!: number
  position?: number                       // when orderColumn is set
}
```

How it works:

- **Load** — `applyRelationshipRepeaterFill()` reads rows from `parent.related('lineItems')` via the relation accessor, stamps `__id = String(child.pk)` on each, strips PK + FK from the rendered row.
- **Save** — `dispatchFormSubmit` extracts the field's value before generic field coercion, then after the parent's `save()` returns runs `persistRelationshipRows`:
  - Submitted rows with `__id` matching an existing PK → `M.update(__id, row)`. FK is NOT overwritten (defense against tampered re-link).
  - Submitted rows with `__id` absent or non-matching → `M.create({ ...row, [foreignKey]: parentPk })`.
  - Existing PKs missing from the submitted set → `M.delete(pk)`.
  - When `orderColumn` is set: the row's 0-based index stamps on every create + update payload.

**M2M variant** — when the relation is `belongsToMany` / `morphToMany` / `morphedByMany`, the framework dispatches through `parent[rel]().attach()` / `.detach()` instead. Row-create calls `M.create()` then `accessor.attach([newPk])`. Row-remove calls `accessor.detach([pk])` only — no `M.delete` (the related child may be linked to other parents).

```ts
// On Article: tags via M2M
Repeater.make('tags')
  .relationship('tags')                    // Article.tags = belongsToMany
  .schema([
    SelectField.make('id').options(allTagsAsOptions).required(),
  ])
```

`pivotColumns([…])` adds editable columns on the pivot:

```ts
Repeater.make('tags')
  .relationship('tags')
  .schema([
    SelectField.make('id').options(allTagsAsOptions).required(),
  ])
  .pivotColumns([
    NumberField.make('weight').default(1),    // editable column on article_tag
    TextField.make('note'),
  ])
```

Pivot columns are read from the M2M pivot row, edited inline, persisted via `accessor.sync()` or `attach/detach`-with-pivot APIs.

## `Builder.relationship` — heterogeneous rows

When rows can be ONE OF N block types — paragraph vs heading vs image — `Builder.relationship` persists each row as a child record with a discriminator column + a JSON payload column:

```ts
Builder.make('content')
  .relationship('blocks')                  // parent.blocks = hasMany ContentBlock
  .blocks([
    Block.make('heading').icon('heading').schema([
      TextField.make('text').required(),
      SelectField.make('level').options({ h1: 'H1', h2: 'H2', h3: 'H3' }),
    ]),
    Block.make('paragraph').icon('text').schema([
      MarkdownField.make('body'),
    ]),
    Block.make('image').icon('image').schema([
      FileUpload.make('src').accept('image/*').required(),
      TextField.make('alt'),
    ]),
  ])
  .reorderable()
  .orderColumn('position')
```

Schema for `ContentBlock`:

```ts
export class ContentBlock extends Model {
  static override table = 'content_blocks'
  id!: number
  pageId!: number                          // foreign key
  type!: string                            // 'heading' | 'paragraph' | 'image'
  data!: Record<string, unknown>           // per-block inner-schema values
  position?: number
}
```

Column names are overridable via the options object:

```ts
Builder.make('content').relationship({
  name:         'blocks',
  typeColumn:   'blockType',               // default 'type'
  dataColumn:   'payload',                 // default 'data'
  orderColumn:  'sortOrder',
})
```

How it works:

- **Load** — `applyRelationshipBuilderFill()` reads `{__id, type, data}` per row, JSON-parses string `data` columns, strips PK + FK + `type` + `data` from each rendered row's inner data.
- **Save** — `persistRelationshipBuilderRows()`:
  - Submitted rows with `__id` matching an existing PK → `M.update(__id, { [typeColumn]: row.type, [dataColumn]: row.data, [orderColumn]: idx })`. FK is NOT overwritten.
  - Submitted rows with `__id` absent → `M.create({ [typeColumn]: row.type, [dataColumn]: row.data, [foreignKey]: parentPk, [orderColumn]: idx })`.
  - Existing PKs missing from submitted set → `M.delete(pk)`.
  - **Type column rewrites on update** — a block can switch types between submits.

Unknown block types in submitted data round-trip verbatim (renderer shows a placeholder, server passes data through) — config rollbacks never silently lose content.

v1 = `hasMany` + `morphMany` / `morphOne` only. M2M is deferred — heterogeneous `{type, data}` envelope doesn't compose cleanly with pivot semantics.

## When to use which

| Pattern | Use when |
|---|---|
| `RelationManager` (separate tab) | Many children (100s+ comments); separate URL feels natural; user expects pagination + search; permissions differ from parent |
| `Repeater.relationship` (inline, uniform) | Tight 1-to-few (10ish line items); users edit children alongside the parent; consistent shape per row |
| `Repeater` (no `.relationship()`, JSON storage) | Same as above but no relation table — rows live as a JSON column on the parent. Simplest setup |
| `Builder.relationship` (inline, heterogeneous) | CMS content blocks, form-builder schemas — rows have varied shape; need querying child records (`pageId`-indexed) |
| `Builder` (no `.relationship()`, JSON storage) | Same shape, JSON-blob storage. Use when you don't need to query children individually |

## Per-row hooks

```ts
Repeater.make('lineItems')
  .relationship('lineItems')
  .schema([...])
  .afterCreate(async (record, ctx) => {
    await audit.log('lineItem.created', { orderId: ctx.parentId, lineItemId: record.id })
  })
  .afterUpdate(async (record, ctx) => {
    // ctx: { parent, parentId, field, index, mode }
    // mode is 'hasMany' | 'morphMany' | 'belongsToMany' | 'morphToMany' | 'morphedByMany'
  })
  .afterDelete(async (record, ctx) => {
    // index is -1 on afterDelete (deleted rows aren't in submitted set)
  })
```

Each setter throws at config time if `relationship()` wasn't called first.

Errors propagate — a throwing handler stops the rest of the persist diff. v1 isn't transactional so earlier rows are already committed.

## Common pitfalls

- **`Repeater.relationship()` without a `static relations[name]` entry on the parent Model** throws a clear error pointing at the override paths. Add `{ type: 'hasMany', model: () => Child, foreignKey: 'parentId' }` to the parent's `static relations`.
- **Mutually exclusive with `simple()` and `dehydrated(false)`** — relationship-backed Repeaters need full row shape. Calling either after `.relationship()` throws.
- **No transaction wrapper in v1** — partial failure leaves the parent saved with some rows persisted and others not. For critical financial / inventory flows, use a separate `Action.handler` that wraps the save in a Model-level transaction explicitly.
- **`orderColumn` rejected on M2M** — ORM has no `orderByPivot` in v1; pivot-ordered relations aren't supported. Use a regular `hasMany` with an explicit join table for ordered M2M.
- **`Builder.relationship` doesn't support M2M** — heterogeneous `{type, data}` envelope doesn't compose with pivot semantics. Use `Repeater.relationship` with M2M, or model as `morphMany` instead.
- **`pivotColumns` outside an M2M relation** is a no-op — the framework can't write pivot extras on a hasMany. The columns silently don't persist.
- **Submitting a row with a tampered `__id`** (pointing at another parent's child) trips the framework's IDOR check — `persistRelationshipRows` re-queries via `parent.related(rel)` and refuses to update a child that doesn't belong. The submit returns a 422 with a clear error.
