# Grouping rows

`Table.defaultGroup('col')` bands rows by a column. Add a `.groups([...])`
list of `TableGroup` options and the renderer mounts a "Group by"
dropdown above the table so users can switch between groupings. Each
group can be collapsible, date-bucketed, ordered with a custom
comparator, and (opt-in) clickable to drill into a single bucket.

## Quick example

```ts
import { Table, TableGroup } from '@pilotiq/pilotiq'

Table.make()
  .columns([
    Column.make('title').sortable().searchable(),
    Column.make('status'),
    Column.make('createdAt').dateTime(),
  ])
  .groups([
    TableGroup.make('status')
      .label('Status')
      .collapsible(),
    TableGroup.make('createdAt')
      .label('Date')
      .date()
      .collapsible(),
  ])
  .defaultGroup('status')
```

Bare-column form is the minimal opt-in — `defaultGroup('status')` alone
bands rows without exposing a dropdown. Adding entries to `.groups([…])`
unlocks switching plus all the per-group chrome below.

## Per-group chrome

```ts
TableGroup.make('status')
  .label('Status')
  .collapsible()           // chevron on each heading row
  .collapsed()             // start collapsed; per-bucket fold persists
                           //   in localStorage under
                           //   pilotiq.table.<currentPath>.groups.<col>.<value>
  .getTitleFromRecordUsing((r) =>
    r.status === 'draft' ? 'Drafts' : 'Published',
  )
  .getDescriptionFromRecordUsing((r) => `${r.count} records`)
```

`getTitleFromRecordUsing(fn)` runs per row server-side; the first row in
each bucket sets the heading text. `getDescriptionFromRecordUsing(fn)`
shows a smaller line below the title.

## Date bucketing

```ts
TableGroup.make('createdAt').date()
```

Reads the column as a date and buckets rows by day (`YYYY-MM-DD` is the
stable-sort key). The heading auto-formats as "May 4, 2026" unless you
supply your own `getTitleFromRecordUsing`. Buckets are UTC; for timezone-
aware grouping, override `getKeyFromRecordUsing` to return your own
bucket key.

## Group ordering

By default group buckets sort alphabetically by their resolved key.
Override with `.orderUsing(comparator)`:

```ts
import { TableGroup, orderByKeys } from '@pilotiq/pilotiq'

TableGroup.make('status').orderUsing(
  orderByKeys(['draft', 'published', 'archived']),
)
```

`orderByKeys(keys)` is the sugar for "rank these in order; everything
else falls through alphabetically after them." Use a raw
`(a, b) => number` comparator for anything more bespoke. The empty
bucket (rows with no value for the column) always sorts to the bottom
regardless of what your comparator returns for it.

## Click-to-drill: `scopeQueryByKey`

Opt into a clickable group heading that drills the table into just one
bucket. When the user clicks "Status: Draft", the banded layout
collapses, a "Drilled into Status: Draft" chip mounts above the table
with an × to clear, and the visible rows are already narrowed to that
bucket server-side.

```ts
TableGroup.make('status')
  .label('Status')
  .scopeQueryByKey((q, key) => q.where('status', '=', key))
```

`.scopeQueryByKey(fn)` auto-arms `.scopable(true)` since the surface
needs both pieces. The handler receives the raw model query and the
resolved group key (the same value `getKeyFromRecordUsing` produced)
and returns the narrowed query.

### Defaults (no `.scopeQueryByKey(...)` call)

- **Plain groups:** exact-match — `(q, key) => q.where(column, '=', key)`.
- **Date groups (`.date()`):** whole-day range —
  `(q, key) => q.where(col, '>=', '${key} 00:00:00').where(col, '<=', '${key} 23:59:59')`.
  Override with `.scopeQueryByKey(...)` for sub-day buckets or
  timezone-aware ranges.

### Custom bucket key

When the stable bucket key differs from the column's raw value (enum
objects, JSON columns, derived keys), set `getKeyFromRecordUsing`:

```ts
TableGroup.make('priority')
  .getKeyFromRecordUsing((r) => String(r.priority.value))
  .scopeQueryByKey((q, key) => q.where('priorityValue', '=', Number(key)))
```

`.getKeyFromRecordUsing(fn)` also auto-arms `.scopable(true)`.

### URL state

Drill-in uses a dedicated `?groupKey=<value>` URL key, prefix-aware via
`Table.queryStringIdentifier`. Pairs with `?group=<col>`. Clicking a
heading resets `?page` to 1 so drill-in always lands on the first page
of the bucket. The chip's × clears `?groupKey=` and restores the banded
view.

### Composition

- **Filters / search:** chain. Drilled-in rows respect any active filter
  state.
- **`TrashedFilter`:** chains — drill-in into the bucket of records the
  current trashed-filter state surfaces.
- **`persistFiltersInSession`:** drill-in is page-state, not filter-state.
  `<prefix>groupKey` is excluded from the persisted slice, so bare-URL
  visits return to the banded view. The drilled-in URL is still
  shareable directly.
- **`RelationManager` tables:** supported. The same `ctx.groupScope`
  flows through `modelRelationTableRecords`.
- **`Table.queryStringIdentifier('orders')`:** keys parse as
  `orders_groupKey` alongside `orders_group`.

### v1 limits

- One key at a time. Multi-select drill-in is deferred.
- Drill-in is presentation-only state — doesn't survive
  `persistFiltersInSession`.
- Date range default covers a whole calendar day in UTC. Sub-day
  buckets or timezone-aware ranges need a custom `scopeQueryByKey`.
- The chip's display value falls back to the raw key when no visible
  row carries a `_groupTitle` for it (empty drilled-in pages show the
  raw bucket).
- `getKeyFromRecordUsing` default casts to string; object-typed columns
  (JSON blobs grouped by their stringified form) need a custom
  resolver.
