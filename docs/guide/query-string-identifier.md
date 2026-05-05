# Query-string identifier

`Table.queryStringIdentifier(id)` namespaces a table's URL state under a
prefix so multiple tables on one page don't collide on `?search=` /
`?sort=` / `?page=` / filter keys. With it set, every reserved key and
every filter name is read and written as `${id}_${key}`:

```
?orders_search=pizza&orders_sort=date:desc&orders_status=open
&invoices_page=4&invoices_sort=amount:asc
```

Off by default — resource list pages have one `Table` per page and
don't need a prefix. The intended use is custom pages (and the rare
resource page) that mount more than one table.

## Quick example

```ts
import { Page, Heading, Table, Column } from '@pilotiq/pilotiq'

export class OperationsPage extends Page {
  static override slug  = 'operations'
  static override label = 'Operations'

  static override async schema() {
    return [
      Heading.make('Operations'),
      Table.make<Order>()
        .queryStringIdentifier('orders')
        .columns([
          Column.make('id'),
          Column.make('total').sortable(),
        ])
        .records(loadOpenOrders),
      Table.make<Invoice>()
        .queryStringIdentifier('invoices')
        .columns([
          Column.make('id'),
          Column.make('amount').sortable(),
        ])
        .records(loadOpenInvoices),
    ]
  }
}
```

Now the two tables sort, paginate, search, and filter independently.

## What gets prefixed

Every URL key the framework writes for a table:

| Concept       | Bare key   | With `queryStringIdentifier('orders')` |
| ------------- | ---------- | -------------------------------------- |
| Search        | `search`   | `orders_search`                        |
| Sort          | `sort`     | `orders_sort`                          |
| Page          | `page`     | `orders_page`                          |
| Per-page      | `perPage`  | `orders_perPage`                       |
| Active group  | `group`    | `orders_group`                         |
| Filter values | `<name>`   | `orders_<name>`                        |

A bare key on the URL no longer matches a prefixed table — it belongs
either to another table on the page or to some unrelated app param,
and either way `loadTableRecords` ignores it.

## Validation

Identifiers must match `[A-Za-z0-9_-]+`:

```ts
Table.make().queryStringIdentifier('')      // throws — empty
Table.make().queryStringIdentifier('a b')   // throws — whitespace
Table.make().queryStringIdentifier('a/b')   // throws — separator
Table.make().queryStringIdentifier('a_b')   // ok
Table.make().queryStringIdentifier('orders-2025')  // ok
```

Empty identifiers are rejected so that calling
`queryStringIdentifier('')` (e.g. from a typo'd computed value) doesn't
silently fall back to the bare-key path while implying namespacing.

## Composition

- **`persistFiltersInSession`** — page-key skipping in the session
  helper recognises both `page` and `<prefix>_page`, so a prefixed
  page number doesn't get persisted and clobber the next bare-visit
  restore. Filter / sort / search keys persist verbatim under their
  prefixed names.

- **`deferLoading`** — composes naturally. The deferred fetch sends
  `tableUrl + window.location.search`, and the JSON endpoint's
  re-run of `loadTableRecords` reads the prefixed slice the same way
  the SSR pass would have.

- **List-page tabs (`ListTabs`)** — tab state lives at the
  page-level `?tab=` key, not on any individual table. Tabs continue
  to work without a prefix.

## v1 limitations

- **One namespace per table.** A table opts in or out as a whole — you
  can't prefix only `?search` while leaving `?sort` bare.

- **Filter names must not collide with reserved keys after
  prefixing.** A filter literally named `page` on a table with
  `queryStringIdentifier('a')` would write to `?a_page`, which the
  framework reads as the table's pagination cursor. Filter names that
  match `search`, `sort`, `page`, `perPage`, or `group` were already
  rejected at registration time and that hasn't changed.

- **`persistFiltersInSession` heuristic.** The session writer drops
  any URL key ending in `_page` to handle prefixed pagination. A
  filter named `something_page` would also be dropped from the
  persisted slice — unusual, but worth knowing if you have one.
