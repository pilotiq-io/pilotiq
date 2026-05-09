---
'@pilotiq/pilotiq': minor
---

feat(columns): Column.toggleable() user-visibility chrome

`Column.toggleable()` lets users show / hide individual columns from a
new toolbar **Columns** dropdown. Preference persists per-table to
`localStorage` (key `pilotiq.table.<currentPath>.columns.<col>`), so the
choice sticks across reloads + SPA navigations. Pass `{ initiallyHidden:
true }` to start the column off-screen — useful for technical / debug
columns that the typical viewer doesn't need.

```ts
Resource.table = (t) => t.columns([
  TextColumn.make('name'),
  TextColumn.make('email').toggleable(),
  TextColumn.make('internalId').toggleable({ initiallyHidden: true }),
])
```

The dropdown trigger renders next to the existing Filters / Sort
controls; non-toggleable columns always render and never appear in the
dropdown. Hidden state is purely presentational — the column's data
still loads from the server so sorts / filters that reference a hidden
column keep working, and a re-toggle paints fresh values without a
roundtrip. Toggling multiple columns in one open: the dropdown stays
open between clicks (`closeOnClick={false}`).

`visibleColumns = columns.filter(c => !hidden.has(c.name))` flows
through the TableHead loop, body cells loop, per-group + footer summary
rows, and the empty-state colSpan.

The `toggleable` key is sparse on the wire — only set when a column
opts in.
