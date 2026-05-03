# Import / Export Action factories

Two new pre-built `Action` factories — `Action.export(R, base, opts?)` and `Action.import(R, base, opts?)` — plus their bulk-placement sibling `Action.bulkExport(...)`. Drop-in CSV / JSON in/out for any resource that has `R.model`, with the same factory ergonomics as `Action.create / .delete / .bulkDelete`.

**Status:** PROPOSED. Single ~2-day push.

**Depends on:** `Action.ts` (factory pattern + handler return shape), `dispatchAction.ts` (handler dispatch + route layer), `routes.ts` (resource-scope `_action/:name` already exists), `R.canViewAny / canCreate / canEdit` (Plan #10), `FileUpload` field (Plan #6), `localUpload` adapter (Plan #6), `Notification` (Plan #3), `Resource.table()` (column discovery for export defaults).

**Companion plan:** `admin-gap-audit.md` — last open Tier-3 mainline item ("Import / Export Action factories — CSV/JSON in/out as pre-built bulk Action templates"). Pairs with the existing `actions-tier-1.md` factory family.

**Reference parity:** the reference admin framework's `ExportAction / ExportBulkAction / ImportAction` plus `Importer / Exporter` classes. We collapse the two-class shape into options-bag factories — pilotiq's factory style (`Action.create(R, base)`) makes the `Importer` class redundant for v1; promote it to a class only if the options bag grows past ~6 setters.

---

## Final API surface

### `Action.export(R, basePath, opts?)`

Header-placement download trigger. Iterates the full resource (or the table's currently-active filter+search+sort scope) and streams a CSV / JSON file back.

```ts
Action.export(R, basePath, {
  columns?:    Array<string | { key: string; label?: string; format?: (v, row) => string }>,
                                // default: every Column from R.table() in declaration order,
                                // header label = Column.label, body = formatStateUsing? value : raw
  filename?:   string | (ctx) => string,
                                // default: `${R.slug}-${YYYY-MM-DD}.csv`
  format?:     'csv' | 'json',  // default: 'csv'
  query?:      (q, ctx) => q,   // optional global scope
                                // (defaults to applying the table's active filter + search + sort
                                //  via the same TableContext the list page builds)
  scope?:      'all' | 'filtered' | 'page',
                                // default: 'filtered' — CSV reflects what the user is looking at
  chunkSize?:  number,          // default: 1000 — paginate through the model in chunks
  maxRows?:    number,          // default: 50_000 — hard cap; over → 422 + notify
})
```

Visibility default: `R.canViewAny(user)`. Bulk variant uses `canViewAny` too (export is read-only).

### `Action.bulkExport(R, basePath, opts?)`

Same options + same defaults as `Action.export`, but takes `ctx.records` (the bulk-selected rows) instead of running the table query. `scope` setter is ignored. Drops into `bulkActions([...])`.

### `Action.import(R, basePath, opts?)`

Header-placement form-modal action. Composes `FileUpload` + a "Mode" select + handler that reads the uploaded file, parses, validates per-row, and calls `R.model.create` / `R.model.update` per row.

```ts
Action.import(R, basePath, {
  columns?:    Record<string, string>,    // CSV header → model attribute key
                                          // default: identity (CSV header IS the model key)
  format?:     'csv' | 'json',            // default: 'csv'; auto-detected from filename ext when omitted
  upsertBy?:   string,                    // model attribute used as the upsert key (typically 'id' or 'email')
                                          // omitted = always create
  validate?:   (row, ctx) => string | null | Promise<string | null>,
                                          // per-row guard; non-null skips that row + accumulates as error
  beforeCreate?: (row, ctx) => Record | Promise<Record>,
  beforeUpdate?: (row, existing, ctx) => Record | Promise<Record>,
                                          // mass-mutate before the model write
  maxRows?:    number,                    // default: 10_000
  chunkSize?:  number,                    // default: 100 — write in transactions of N
  onComplete?: (summary, ctx) => void | Promise<void>,
                                          // hook for audit-log writes etc; runs once after all rows
})

// summary shape passed to onComplete + back as the success notification body:
type ImportSummary = {
  created:  number
  updated:  number
  skipped:  number   // failed validate or threw during write
  errors:   Array<{ row: number; message: string }>
}
```

Visibility default: `R.canCreate(user)` AND (when `upsertBy` is set) `R.canEdit(user, undefined)`.

The factory builds the modal-form schema itself — users don't write fields. v1 modal:
- `FileUpload.make('file').accept('.csv,.json').required().maxSize(10_000_000)` (10 MB hard cap)
- `Select.make('mode').options({ create: 'Create only', upsert: 'Create or update' }).default(opts.upsertBy ? 'upsert' : 'create').visible(opts.upsertBy !== undefined)`

Override the modal by chaining: `Action.import(R, base, opts).schema([...customFields])` replaces the auto-built one (the import factory's handler still reads `ctx.values.file`).

---

## Internal mechanics

### CSV codec — `src/io/csv.ts`

```ts
export function encodeCsv(
  rows:    Array<Record<string, unknown>>,
  columns: Array<{ key: string; label: string }>,
): string

export function parseCsv(input: string): {
  headers: string[]
  rows:    Array<Record<string, string>>   // every cell is a string; coerce in the importer
}
```

- Encoder writes RFC 4180: comma-delimited, CRLF line endings, `"` quoting only when value contains `,`/`"`/`\n`/leading or trailing whitespace, double-quote-escapes embedded `"`. Booleans → `'true' / 'false'`. Dates → ISO 8601. `null / undefined` → empty cell. Objects → JSON-stringified (defensive — most won't hit this path because of `formatStateUsing`).
- Parser handles RFC 4180 + Excel-flavored deviations (LF or CRLF, optional trailing newline, BOM-stripped on input, doesn't infer types — every cell stays a string for the importer to coerce).
- v1 is in-memory (string in / string out). Streaming deferred until a consumer actually hits the 50k cap.
- No third-party dep — both functions fit in <150 LOC. Adding `papaparse` (~16 KB minified) only if the in-house parser hits a real-world edge case the test suite doesn't cover.

### JSON codec — inline in handler

JSON export = `JSON.stringify(rows.map(rowToObject), null, 2)`. JSON import = `JSON.parse(text)` then `Array.isArray(parsed) ? parsed : [parsed]`. No new module; six lines in the handler.

### Handler return shape — extend `ActionResult`

```ts
export type ActionResult =
  | void
  | {
      redirect?: string
      notify?:   NotificationLike
      download?: {                   // ← new
        filename:    string
        contentType: string          // e.g. 'text/csv; charset=utf-8'
        body:        string          // v1 buffers the whole payload; revisit if 50k cap pinches
      }
    }
```

`dispatchAction.ts` — extend `DispatchActionSuccess` with `download?: DownloadEnvelope`, mirror it through after `handler(ctx)`. Single line in the existing `if (result && typeof result === 'object')` block.

### Route layer — `routes.ts`

The resource-scope `POST {base}/{slug}/_action/:actionName` handler is the only changed file outside `dispatchAction`. After `dispatchAction` returns:

```ts
if (success.download) {
  const { filename, contentType, body } = success.download
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(filename)}"`)
  return res.end(body)
}
// existing JSON / 303-redirect branch unchanged
```

`sanitizeFilename` strips `\r\n"\\` and falls back to `'export.csv'` on empty.

### Client renderer — `SchemaRenderer.tsx`

`dispatchHandlerAction` (the fetch path used by all non-modal handler actions) currently expects `Accept: application/json`. To trigger a browser download we need a content-sniff branch:

```ts
const r = await fetch(url, { method: 'POST', body, headers: { Accept: '*/*' } })
const ct = r.headers.get('Content-Type') ?? ''
const cd = r.headers.get('Content-Disposition') ?? ''
if (cd.includes('attachment')) {
  const blob = await r.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = (cd.match(/filename="([^"]+)"/) ?? [, 'export'])[1]
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(objUrl)
  return
}
// existing JSON branch unchanged
```

Switching `Accept` from `application/json` to `*/*` is safe — every existing route already chooses its branch from `Accept: application/json` (so `*/*` falls through to the JSON path for non-download responses).

### Importer handler internals

```ts
async function importHandler(ctx: ActionContext) {
  const url = String(ctx.values.file ?? '')
  if (!url) return { notify: { title: 'No file uploaded', type: 'error' } }

  // Read the file the FileUpload field stashed via the configured UploadAdapter.
  // localUpload exposes it at the same URL-prefix on disk; remote adapters need
  // a `fetch(url)` fallback. v1 path: `fetch(url)` — works for both local and
  // remote because the URL is always public-readable (FileUpload's contract).
  const text = await (await fetch(url)).text()

  const rows = opts.format === 'json'
    ? (Array.isArray(JSON.parse(text)) ? JSON.parse(text) : [JSON.parse(text)])
    : parseCsv(text).rows.map(r => mapColumns(r, opts.columns))

  if (rows.length > (opts.maxRows ?? 10_000)) {
    return { notify: { title: `Too many rows (${rows.length} > ${opts.maxRows})`, type: 'error' } }
  }

  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] }
  const upsertBy = opts.upsertBy
  const mode     = ctx.values.mode === 'upsert' ? 'upsert' : 'create'

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const guard = await opts.validate?.(row, { ...ctx, rowIndex: i })
      if (typeof guard === 'string') {
        summary.skipped++
        summary.errors.push({ row: i + 1, message: guard })
        continue
      }

      if (mode === 'upsert' && upsertBy) {
        const existing = await R.model!.query()
          .where(upsertBy, row[upsertBy])
          .paginate(1, 1)
        if (existing.data[0]) {
          const payload = await (opts.beforeUpdate?.(row, existing.data[0], ctx) ?? Promise.resolve(row))
          await R.model!.update(String(existing.data[0].id), payload)
          summary.updated++
          continue
        }
      }

      const payload = await (opts.beforeCreate?.(row, ctx) ?? Promise.resolve(row))
      await R.model!.create(payload)
      summary.created++
    } catch (err) {
      summary.skipped++
      summary.errors.push({ row: i + 1, message: err instanceof Error ? err.message : 'unknown' })
    }
  }

  await opts.onComplete?.(summary, ctx)

  return {
    notify: {
      title: `Import complete: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
      type:  summary.errors.length > 0 ? 'warning' : 'success',
      body:  summary.errors.slice(0, 5).map(e => `Row ${e.row}: ${e.message}`).join('\n'),
    },
  }
}
```

No new transaction wrapper in v1; rudder ORM doesn't expose a pilotiq-facing `transaction()` helper yet. Partial-failure rows accumulate in `summary.errors` rather than rolling back. Document explicitly.

### Exporter handler internals

```ts
async function exportHandler(ctx: ActionContext) {
  const cols = resolveColumns(opts.columns, R)   // uses R.table() when omitted

  // Scope: 'all' = ignore TableContext; 'filtered' = apply current URL state;
  // 'page' = also paginate to the visible page. v1 reads URL state from
  // ctx.request via parseTableQuery so the export matches what the user sees.
  const baseQuery = R.model!.query()
  const scoped = opts.query
    ? opts.query(baseQuery, ctx)
    : applyTableScopeFromRequest(baseQuery, ctx.request, R, opts.scope)

  let collected: unknown[] = []
  let page = 1
  while (collected.length < (opts.maxRows ?? 50_000)) {
    const slice = await scoped.paginate(page, opts.chunkSize ?? 1000)
    collected.push(...slice.data)
    if (slice.data.length < (opts.chunkSize ?? 1000)) break
    page++
  }

  if (collected.length > (opts.maxRows ?? 50_000)) {
    return { notify: { title: `Export too large (${collected.length} > ${opts.maxRows})`, type: 'error' } }
  }

  const rows = collected.map(record => buildRow(record, cols))   // applies col.format / formatStateUsing

  const filename = typeof opts.filename === 'function'
    ? opts.filename(ctx)
    : (opts.filename ?? `${R.getSlug()}-${new Date().toISOString().slice(0, 10)}.${opts.format ?? 'csv'}`)

  const body = (opts.format ?? 'csv') === 'json'
    ? JSON.stringify(rows, null, 2)
    : encodeCsv(rows, cols)

  return {
    download: {
      filename,
      contentType: opts.format === 'json' ? 'application/json' : 'text/csv; charset=utf-8',
      body,
    },
  }
}
```

`applyTableScopeFromRequest` is new — wraps the existing `parseTableQuery` + the model adapter's filter/search/sort application that already runs inside `loadTableRecords`. Extract a shared helper so the list-page route + export action stay in lockstep.

---

## Phasing

Single push, but in this order so each step is independently testable:

| # | Step | Files | Tests target |
|---|---|---|---|
| 1 | CSV codec | `src/io/csv.ts` + `csv.test.ts` | +20 |
| 2 | Extend `ActionResult` + `dispatchAction` to thread `download` | `Action.ts`, `dispatchAction.ts` + tests | +4 |
| 3 | `Action.export` factory + `applyTableScopeFromRequest` helper | `Action.ts`, `pageData.ts` (helper) + tests | +12 |
| 4 | Route layer download branch | `routes.ts` + `routes.test.ts` | +6 |
| 5 | Client `dispatchHandlerAction` content-sniff branch | `react/SchemaRenderer.tsx` | manual + 1 unit (extracted helper) |
| 6 | `Action.bulkExport` factory | `Action.ts` + tests | +4 |
| 7 | `Action.import` factory + handler internals | `Action.ts` + `import.test.ts` | +18 |
| 8 | Playground demo | `playground-pilotiq` `PostResource` | — |
| 9 | Docs | `docs/packages/pilotiq/import-export.md` (new), `resources.md` (cross-ref), `README.md` (one-line mention), `admin-gap-audit.md` (✅ row) | — |

**Tests baseline at plan time: 1663.** Target after this plan: ~1727 (+64). Each step gets its own commit per the existing factory-family rhythm.

---

## Decisions to make explicit

- **Single route, no new endpoint.** Both factories ride the existing `POST {base}/{slug}/_action/:actionName` dispatcher. Extending `ActionResult` with `download` keeps every Action-related concern (visibility, policy, audit logging hooks, dispatch URL stamping) free for both.
- **Sync, in-memory v1.** No queue, no streaming. `maxRows` cap (50k export, 10k import) protects against OOM. When a consumer hits the cap, write a queued follow-up plan rather than baking a queue dep into core.
- **CSV is the default; JSON is opt-in.** Most consumers want CSV. JSON path is a 6-line branch — cheap to ship together — but no Excel / xlsx in v1 (drags in `xlsx` ~700 KB).
- **Importer composes existing primitives.** No new field type. The modal-form auto-built schema is just `FileUpload + Select`, both already shipped. Override surface = `.schema([...])` chained on the factory.
- **No `Importer / Exporter` classes.** Filament's class shape exists because PHP can't pass options bags around as cleanly. Pilotiq's options-bag-on-factory matches `Action.create(R, base)` and stays consistent. Promote to a class iff the options bag grows past ~6 setters.
- **Visibility defaults match write surface.** Export is `canViewAny`. Import is `canCreate` (and `canEdit` when upserting). Users can override by chaining `.visible(...)`.
- **Filename safety.** `sanitizeFilename` strips quote/CR/LF/backslash. Doesn't sanitize path traversal — `Content-Disposition` doesn't expose paths, just suggested filenames; the browser owns the actual save dialog.
- **Per-row partial failure stays soft.** Importer accumulates errors in `summary.errors` and skips, never rolls back. The success notification surfaces the first 5 failures; full breakdown via `onComplete(summary)` for users who want to write an audit-log row.
- **Boot guard.** Panel boot throws when an `Action.import(R, ...)` references a resource without `R.model.create` (or `R.model.update` when `upsertBy` is set). Mirrors Plan #13's boot-time soft-delete probe.

---

## Demo (playground-pilotiq)

`PostResource.table()`:
```ts
.headerActions([
  Action.export(PostResource, basePath, {
    columns: ['id', 'title', 'slug', 'createdAt'],
    filename: 'posts.csv',
  }),
  Action.import(PostResource, basePath, {
    columns: { Title: 'title', Slug: 'slug' },
    upsertBy: 'slug',
  }),
])
.bulkActions([
  Action.bulkExport(PostResource, basePath),
  Action.bulkDelete(PostResource, basePath),
])
```

Visit `/new-admin/articles`, click "Export" → downloads `posts.csv`. Click "Import" → upload a CSV with `Title,Slug` headers → notification surfaces summary.

---

## Out of scope (deferred)

- **Queued imports/exports.** Plays into rudder's `@rudderjs/queue`. Worth its own plan once a consumer hits the 50k / 10k cap or asks for "email me when done".
- **Streaming export.** Buffering the whole CSV in memory caps at 50k rows on a stock model. Switching to `Readable` requires touching `routes.ts` to write chunks, plus rewiring `dispatchAction` to surface a stream rather than a buffer. Defer until needed.
- **Excel (.xlsx).** Big dep (~700 KB), narrow audience. CSV opens cleanly in Excel anyway.
- **Schema-mapped import wizard.** A two-step modal (upload → preview + map columns → submit) is real polish but couples to `Wizard`. v1's identity-default + `columns: { 'CSV Header': 'modelKey' }` covers most cases.
- **Scheduled / recurring exports.** `Pilotiq.use(scheduledExports({ cron }))` plugin shape — out of scope; queue-coupled.
- **Promoting to `Importer / Exporter` classes.** Only if the options bag balloons past ~6 setters or users want to subclass for shared cross-resource logic.
