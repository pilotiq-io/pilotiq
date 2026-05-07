# Import / Export

Drop-in CSV / JSON in/out for any resource backed by `R.model`. Three
factories — `Action.export`, `Action.bulkExport`, `Action.import` —
that compose into the same `headerActions / bulkActions` slots as
`Action.create`, `Action.delete`, etc.

```ts
PostResource.table()
  .headerActions([
    Action.create(PostResource, base),
    Action.export(PostResource, base, { columns: ['id', 'title', 'createdAt'] }),
    Action.import(PostResource, base, { upsertBy: 'slug' }),
  ])
  .bulkActions([
    Action.bulkExport(PostResource, base),
    Action.bulkDelete(PostResource, base),
  ])
```

## `Action.export(R, basePath, opts?)`

Header-placement download trigger. Iterates the resource's `R.table()`
records handler in pages and streams the result as a CSV (default) or
JSON file. Visibility defaults to `R.canViewAny(user)`.

```ts
Action.export(R, base, {
  columns?:    Array<string | { key: string; label?: string; format?: (v, row) => string }>,
                              // default: every Column from R.table() in declaration order
  filename?:   string | ((ctx) => string),
                              // default: `${R.slug}-${YYYY-MM-DD}.csv`
  format?:     'csv' | 'json',
                              // default: 'csv'
  scope?:      'all' | 'filtered' | 'page',
                              // default: 'filtered' — exports what the user is looking at
  maxRows?:    number,        // default: 50_000
  chunkSize?:  number,        // default: 1_000 — pagination chunk
})
```

Column shape:
- `'name'` — bare key. Header label = key, body = raw cell.
- `{ key, label?, format? }` — `format(value, record) => string` lets
  you transform the cell before write (e.g. money, dates, status badges).

Scope behavior:
- `'all'` — ignore the URL query; export every row.
- `'filtered'` — apply the current filter / search / sort URL state
  (default). The CSV reflects what the user is looking at.
- `'page'` — only the visible page.

The factory walks the table's `records()` handler in pages of
`chunkSize`. For resource opts-in `R.model`, that's the auto-installed
`modelTableRecords` adapter; for resources with a custom
`Table.records(fn)`, it's that function. Either way, filters / search /
sort / tab-query all flow through the same path the list page uses.

When the row count exceeds `maxRows`, the export aborts with an error
notification. Bump the cap explicitly if you need more — but consider
the queue follow-up first (see "Out of scope" below).

## `Action.bulkExport(R, basePath, opts?)`

Same options as `Action.export` minus `scope` (always operates on
`ctx.records` — the bulk-selected rows).

```ts
.bulkActions([
  Action.bulkExport(R, base, {
    columns: ['id', 'title', 'status'],
  }),
])
```

## `Action.import(R, basePath, opts?)`

Header-placement form-modal. Auto-builds the modal schema with a
`FileUpload` (and a "Mode" select when `upsertBy` is set). On submit,
fetches the uploaded file, parses, and walks each row through
`R.model.create` (or `R.model.update` for matching upserts).

Visibility defaults to `R.canCreate(user)`.

```ts
Action.import(R, base, {
  columns?:    Record<string, string>,
                              // CSV header → model attribute key
                              // default: identity
  format?:     'csv' | 'json',
                              // default: 'csv'; auto-detected from .json filename
  upsertBy?:   string,        // model attribute used as upsert key
                              // omitted = always create
  validate?:   (row, ctx) => string | null | Promise<string | null>,
                              // per-row guard; non-null skips + records error
  beforeCreate?: (row, ctx) => Record | Promise<Record>,
  beforeUpdate?: (row, existing, ctx) => Record | Promise<Record>,
                              // mass-mutate before the model write
  maxRows?:    number,        // default: 10_000
  onComplete?: (summary, ctx) => void | Promise<void>,
                              // hook after the import loop
})
```

Summary shape returned from the handler + emitted as the success
notification:

```ts
type ImportSummary = {
  created:  number
  updated:  number
  skipped:  number   // failed validate or threw during write
  errors:   Array<{ row: number; message: string }>
}
```

The success notification surfaces the first 5 row failures in its
body — full breakdown via `onComplete(summary)` for users who want to
write an audit-log row.

Override the auto-built modal by chaining `.schema([...])` after the
factory — your schema replaces the default. The handler still reads
`ctx.values.file` and `ctx.values.mode` (when upsertable), so any
custom schema must keep those names.

## CSV format

The CSV codec lives at `@pilotiq/pilotiq` `src/io/csv.ts` (`encodeCsv`,
`parseCsv`). RFC 4180:
- Comma-delimited, CRLF line endings on emit, LF or CRLF accepted on parse.
- Cells containing `,` / `"` / newlines / leading-or-trailing whitespace
  are quoted; embedded `"` doubled.
- BOM stripped on input.
- Every cell is parsed as a string — type coercion happens later (in
  the ORM or your `beforeCreate` hook).
- `null` / `undefined` / missing keys → empty cell.
- `Date` values → ISO 8601 string.

## Demo (playground)

`PostResource.table()` ships export + import in `headerActions` plus a
bulk export in `bulkActions`. Visit `/new-admin/posts`, click
**Export** to download the table; click **Import** to upload a CSV.

```ts
.headerActions([
  Action.create(PostResource, ADMIN),
  Action.export(PostResource, ADMIN, {
    columns:  ['id', 'title', 'status', 'authorId', 'createdAt'],
    filename: () => `posts-${new Date().toISOString().slice(0, 10)}.csv`,
  }),
  Action.import(PostResource, ADMIN, {
    columns: { Title: 'title', Status: 'status', Author: 'authorId' },
  }),
])
```

## Out of scope

- **Queued imports / exports.** v1 is sync, in-memory. Hits the
  `maxRows` cap → write a queue follow-up.
- **Streaming export.** v1 buffers the full payload in memory. Switch to
  `Readable` when a real consumer needs >50k rows.
- **Excel (.xlsx).** Big dep, narrow audience. CSV opens fine in Excel.
- **Schema-mapped import wizard.** Two-step modal (upload → preview +
  map → submit). v1's identity-default + `columns: { 'CSV Header':
  'modelKey' }` covers most cases.
