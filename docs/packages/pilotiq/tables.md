# Tables

Resource list pages render a `Table` with columns, filters, sorting,
search, pagination, and bulk actions — all server-driven. The author
declares `static table()` on the Resource; the framework wires loading
and URL-state for free.

```ts filename="app/Pilotiq/Resources/PostResource.ts"
static table(table: Table) {
  return table
    .columns([
      Column.make('title').sortable().searchable(),
      Column.make('author').sortable(),
      BadgeColumn.make('status').colors({ draft: 'warning', published: 'success' }),
      Column.make('createdAt').dateTime().sortable(),
    ])
    .filters([
      SelectFilter.make('status').options(['draft', 'published', 'archived']),
    ])
    .recordActions([Action.edit, Action.view, Action.delete])
    .defaultSort('createdAt', 'desc')
    .perPage(25)
}
```

## Topics

- **[Columns](./columns)** — `TextColumn`, `BadgeColumn`, `IconColumn`,
  `BooleanColumn`, `ImageColumn`. `sortable()`, `searchable()`,
  `formatStateUsing()`, `summarize()`.
- **[Filters](./filters)** — `SelectFilter`, `MultiSelectFilter`,
  `BooleanFilter`, `TernaryFilter`, `DateRangeFilter`, `TrashedFilter`,
  `FormFilter`.
- **[Actions](./actions)** — header / row / bulk action placement, modal
  forms, conditional visibility, ActionGroup dropdowns.

## Tabs on the list page

```ts
ListPage.getTabs() {
  return [
    ListTab.make('all').label('All').default(),
    ListTab.make('drafts')   .label('Drafts')   .modifyQuery(q => q.where('status', 'draft')),
    ListTab.make('published').label('Published').modifyQuery(q => q.where('status', 'published')),
  ]
}
```

## Group banding

```ts
Table.make().defaultGroup('status')
```

Stable-sorts rows by the group column server-side; the renderer inserts
a heading row whenever the value changes between adjacent rows.

### Manual group ordering

Pass a `TableGroup` with `orderUsing(...)` (or the `orderByKeys([…])`
helper) to override the default alphabetic ordering of group buckets.
Useful for pinning enums in a meaningful sequence:

```ts
import { Table, TableGroup, orderByKeys } from '@pilotiq/pilotiq'

Table.make()
  .groups([
    TableGroup.make('status').orderUsing(
      orderByKeys(['draft', 'published', 'archived']),
    ),
  ])
  .defaultGroup('status')
```

Empty / null group values still sink to the bottom — that's structural,
not policy. Within a group the original row order is preserved.

> [!TIP]
> Combine `defaultGroup('category')` with `Column.summarize([Sum, Count])`
> for ledger-shaped reports.
