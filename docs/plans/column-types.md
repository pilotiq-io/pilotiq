# Column types

Replace pilotiq's single text-only `Column` with a small hierarchy of typed columns + a shared base. Every list page benefits — formatted dates, money, badges, icons, images, truncation, alignment, server-side custom formatters.

**Status:** PROPOSED → IMPLEMENTING. Single ~2-day push.

**Depends on:** existing `Column.ts`, `Table.ts`, `loadTableRecords` (where per-row server-side eval will plug in), `TableRenderer` in `SchemaRenderer.tsx`.

**Companion plan:** `admin-gap-audit.md` (this is plan #2 in that roadmap).

---

## Final API surface

### Shared on every column

```ts
Column.make('name')      // base — same as TextColumn (default fallback)
  .label('…')
  .sortable() / .searchable()       // existing
  .tooltip('…')                     // hover help
  .alignment('start' | 'center' | 'end')
  .width('60px' | '20%' | 'auto')
  .default('—')                     // shown when value is null/undefined/''
  .placeholder('—')                 // alias
  .wrap()                           // wrap long text instead of truncating
  .lineClamp(2)                     // CSS line-clamp for multi-line truncation
  .formatStateUsing((value, record) => string)   // server-side per-row eval
```

### TextColumn (default — `Column.make()` returns this)

```ts
TextColumn.make('publishedAt')
  .dateTime('PPpp')                 // date-fns format string; default 'PPpp'
  .since()                          // "5 minutes ago" via date-fns formatDistanceToNow
  .money('USD')                     // Intl.NumberFormat currency
  .numeric({ decimals: 2 })         // Intl.NumberFormat decimal
  .limit(40)                        // truncate to N chars + '…'
  .weight('semibold')               // font-weight
  .color('muted' | 'primary' | 'destructive' | 'success')
```

`Column.make()` is an alias for `TextColumn.make()` for back-compat with existing playground code.

### BadgeColumn

```ts
BadgeColumn.make('status')
  .colors({ draft: 'gray', published: 'success', archived: 'warning' })
  // value → badge color preset; falls back to 'gray' when value missing
```

### IconColumn

```ts
IconColumn.make('isAdmin')
  .options({
    true:  { icon: 'shield-check', color: 'success' },
    false: { icon: 'user',         color: 'muted' },
  })
```

### BooleanColumn (sugar over IconColumn)

```ts
BooleanColumn.make('featured')
// equivalent to IconColumn with check-circle/circle-x defaults
```

### ImageColumn

```ts
ImageColumn.make('avatar')
  .circular()                       // border-radius: 50%
  .square()                         // default
  .size(32)                         // width=height in px
```

---

## Internal mechanics

### Server-side `formatStateUsing` eval

`formatStateUsing(fn)` callbacks aren't serializable, so they run server-side in `loadTableRecords`:

1. After rows load, walk each table's columns. For columns with a formatter, evaluate `fn(rowValue, record)` per row.
2. Stash results as `row._formatted[columnName] = formattedString` on each row object.
3. Client checks `row._formatted?.[colName]` first when rendering a cell; falls back to the raw value + client-side built-in formatter.

This mirrors the per-row visibility pattern from Plan #1 step 4.

### Built-in formatters render client-side

`dateTime / since / money / numeric / limit` are pure-function transforms keyed by column meta:

```ts
ColumnMeta.format = { kind: 'dateTime', pattern: 'PPpp' }
ColumnMeta.format = { kind: 'money',    currency: 'USD' }
ColumnMeta.format = { kind: 'numeric',  decimals: 2 }
ColumnMeta.format = { kind: 'since' }
ColumnMeta.format = { kind: 'limit',    chars: 40 }
```

The client `formatCell(value, columnMeta)` switch handles each kind. `date-fns` is already a dep via `@pilotiq/tiptap` indirectly — check before assuming.

### Column-type discriminator

`ColumnMeta.columnType: 'text' | 'badge' | 'icon' | 'boolean' | 'image'` drives the renderer's switch. Default is `'text'` so existing `Column.make(...)` keeps working without modification.

### Empty state on Table

```ts
Table.make()
  .emptyState({ heading: 'No articles yet', description: '…', icon: 'inbox' })
  .heading('Articles')
  .description('Manage published content.')
  .striped()
```

---

## Files touched

- `packages/pilotiq/src/Column.ts` — add base props + `formatStateUsing` + `format` meta. Keep existing `Column.make()` as alias.
- `packages/pilotiq/src/columns/TextColumn.ts` — new file, `extends Column`, adds dateTime/since/money/numeric/limit/weight/color builders.
- `packages/pilotiq/src/columns/BadgeColumn.ts` — new file with `colors(map)`.
- `packages/pilotiq/src/columns/IconColumn.ts` — new file with `options(map)`.
- `packages/pilotiq/src/columns/BooleanColumn.ts` — new file (extends IconColumn with defaults).
- `packages/pilotiq/src/columns/ImageColumn.ts` — new file with `size`, `circular`, `square`.
- `packages/pilotiq/src/columns/index.ts` — barrel.
- `packages/pilotiq/src/index.ts` — re-export.
- `packages/pilotiq/src/elements/dispatchTable.ts` — call `formatStateUsing` per row; stash in `row._formatted`.
- `packages/pilotiq/src/elements/Table.ts` — `emptyState()`, `heading()`, `description()`, `striped()` builders + meta serialization.
- `packages/pilotiq/src/react/SchemaRenderer.tsx` — `formatCell(value, col, row)` switch on `col.columnType` + `col.format`. Empty-state UI when 0 rows. Striped/heading/description chrome.
- Tests: per-column-type test files; dispatchTable test for per-row formatStateUsing.
- Playground `ArticlesTable.ts` — demo each column type.

---

## What we're NOT shipping in v1

- `copyable` (click-to-clipboard cell action) — Tier 2.
- Editable columns (SelectColumn / ToggleColumn / TextInputColumn) — Tier 3, needs PATCH endpoint per cell + optimistic UI.
- `ColorColumn` (renders a color swatch) — niche; defer.
- `since` "live updating" client-side timer — first paint only for now.

---

## Tests delta

Roughly +30 tests across:
- `columns/TextColumn.test.ts` (date/money/since/numeric/limit serialization + meta)
- `columns/BadgeColumn.test.ts`
- `columns/IconColumn.test.ts`
- `columns/BooleanColumn.test.ts`
- `columns/ImageColumn.test.ts`
- `dispatchTable.test.ts` (formatStateUsing per-row eval)
- `Table.test.ts` (emptyState / heading / description / striped serialization)

Goal: ~395 tests at end (up from 364).
