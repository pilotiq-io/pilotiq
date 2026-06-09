# Columns

`Column.make(name)` is the base; specialized subclasses (`TextColumn`,
`BadgeColumn`, `IconColumn`, `BooleanColumn`, `ImageColumn`,
`ColorColumn`) handle the
common cell shapes. Every column reads from the row's record property
by default; `formatStateUsing(fn)` overrides per row server-side.

`Column.make(...)` is an alias for `TextColumn.make(...)` — the bare
factory keeps the most common case (plain text) ergonomic, and you
reach for the typed subclass when the cell needs a different shape.

## Setters

Every column type carries the same chrome surface inherited from
`Column`:

```ts
TextColumn.make('publishedAt')
  .label('Published')
  .sortable()
  .searchable()
  .tooltip('When the article went live')
  .alignment('end')         // 'start' | 'center' | 'end'
  .width('120px')           // CSS width (px / % / 'auto')
  .default('—')             // shown when value is null/undefined/''
  .placeholder('Not yet')   // alias for default()
  .wrap()                   // wrap long text instead of truncating
  .lineClamp(2)             // CSS line-clamp for multi-line truncation
  .weight('semibold')       // 'normal' | 'medium' | 'semibold' | 'bold'
  .color('muted')           // 'default' | 'muted' | 'primary' | …
  .formatStateUsing((value, record) => `${value} (${record.lang})`)
  .recordUrl(r => `/posts/${r.id}`)
```

`formatStateUsing` runs server-side per row inside `loadTableRecords`
and stamps the result on `row._formatted[columnName]` — the renderer
prefers it over the bare value. Use it when the rendering logic isn't
serializable or needs to combine multiple fields.

## Built-in column types

| Class | Renders |
|---|---|
| `Column` (or `TextColumn`) | Plain text — supports `.dateTime / .since / .money / .numeric / .limit / .words / .characters / .lineClamp / .color / .weight / .listWithLineBreaks / .bulleted / .copyMessage / .markdown / .html` |
| `BadgeColumn` | Pill — `.colors({ draft: 'warning', published: 'success' })` |
| `IconColumn` | Value → icon — `.options({ true: { icon, color } })` |
| `BooleanColumn` | Sugar over IconColumn — defaults to check / circle |
| `ImageColumn` | Avatar / thumbnail — `.size(48)`, `.circular()` |
| `TextInputColumn` | Inline `<input>` — saves on blur (or after a 500 ms debounce). Supports `.type('number'\|'email'\|...)`, `.placeholder()`, `.step / .min / .max`, `.debounce(ms)`. |
| `ToggleColumn` | Inline switch — saves on every change. Supports `.onColor / .offColor / .onIcon / .offIcon`. |
| `SelectColumn` | Inline `<select>` — saves on every change. Supports `.options({ key: label })` (static) or `.options(record => …)` (per-row resolver, may be async), `.nullable()`, `.selectablePlaceholder(false)`. |

## TextColumn formatters

Built-in formatters serialize as a `format` spec on the column meta and
run client-side, so they're cheap and re-render without a server hop:

```ts
TextColumn.make('publishedAt').dateTime()             // locale date+time
TextColumn.make('createdAt').since()                   // "5 minutes ago"
TextColumn.make('price').money('USD')                  // "$1,234.50"
TextColumn.make('rating').numeric({ decimals: 1 })     // "4.7"
TextColumn.make('body').limit(80)                      // truncate to N chars + …
TextColumn.make('body').characters(80)                 // alias for limit(n)
TextColumn.make('body').words(20)                      // truncate to N words + …
```

`dateTime()` accepts a pattern string for future-compat (the wire shape
preserves it), but the v1 client uses `Intl.DateTimeFormat` defaults.
`since()` paints the relative label on first paint only — no live timer.
`money(currency)` and `numeric()` accept an optional `locale` second
argument to override the user's browser default. `words(n)` splits on
whitespace runs (`/\s+/`) so leading/trailing whitespace doesn't count
toward the cap.

Formatters are mutually exclusive — `words(20).limit(40)` keeps only
the last call (`limit`).

When `formatStateUsing` AND a built-in `format` are set, the per-row
result wins.

## TextColumn rich display

```ts
TextColumn.make('tags').listWithLineBreaks()
TextColumn.make('tags').bulleted()                     // wins over listWithLineBreaks
TextColumn.make('email').copyMessage('Email copied')
TextColumn.make('description').markdown()              // server-renders via marked + sanitize-html
TextColumn.make('legacyHtml').html().sanitize({ allowedTags: ['span'] })
```

- `listWithLineBreaks()` and `bulleted()` apply when the cell value is
  an array. `listWithLineBreaks()` separates entries with `<br>`;
  `bulleted()` mounts a `<ul>` with bullet markers. When both are set,
  `bulleted()` wins.
- `copyMessage(message?)` mounts a small copy-to-clipboard trigger after
  the cell value. The optional string is the toast text shown after a
  successful copy (default `"Copied!"`). Reads as `Filament`-parity.
- `markdown()` server-renders the cell value via `marked` (already a
  dep) and stamps the resulting HTML on `row._formatted[name]` with
  `_richtextCells[name] = true`; the renderer paints the cell via the
  existing prose-sm `dangerouslySetInnerHTML` path.
- `html()` skips the Markdown step — useful for legacy CMS columns that
  already store rendered HTML.
- Both rich-text setters are sanitized by default against the same
  `DEFAULT_SANITIZE_CONFIG` allowlist as the `Markdown` / `Html` schema
  primes. Use `.allowRaw()` (admin-trusted source AND reader) or
  `.sanitize({ allowedTags: [...] })` to widen the allowlist.

## BadgeColumn

```ts
BadgeColumn.make('status').colors({
  draft:     'gray',
  published: 'success',
  archived:  'warning',
})
```

Color presets: `gray` · `primary` · `success` · `warning` · `destructive`
· `info`. Unknown values fall back to `gray`. Successive `.colors()`
calls merge instead of replace.

## IconColumn / BooleanColumn

```ts
IconColumn.make('isAdmin').options({
  true:  { icon: 'shield-check', color: 'success' },
  false: { icon: 'user',         color: 'muted'   },
})

// BooleanColumn is sugar — defaults to:
//   true  → check-circle-2 (success)
//   false → circle         (muted)
BooleanColumn.make('featured')
```

Icon names resolve through pilotiq's icon registry — register custom
packs via `registerIcons({ Name: Component })`.

## ImageColumn

```ts
ImageColumn.make('avatar')
  .size(48)        // width = height in px (default 32)
  .circular()      // border-radius: 50%
// or .square()    // default — rounded-md corner radius
```

Pair with `.placeholder('—')` for rows where the URL is null.

## ColorColumn

Renders a CSS color string (HEX / HSL / RGB / RGBA / named) as a swatch
beside the value. Pairs with `ColorPickerField` for round-trip display.

```ts
ColorColumn.make('accent')
  .square()        // 'rounded' (default) | 'square' | 'circle'
  .hideValue()     // chip-only, no text beside
```

## Table chrome

```ts
Table.make()
  .heading('Articles')
  .description('Manage published content, drafts, and archived posts.')
  .striped()
  .emptyState({
    heading:     'No articles yet',
    description: 'Create your first article to get started.',
    icon:        'inbox',
  })
  .filteredEmptyState({
    heading:     'No matching articles',
    description: 'Try a different search or clear filters.',
    icon:        'search',
  })
  .columns([ /* … */ ])
```

`emptyState` renders when the table has zero rows AND no filter or search is active. `filteredEmptyState` is an optional second slot — when set AND a search query or any URL filter key is present, the renderer prefers it. Falls back to `emptyState` (or the framework defaults — "No matching records" with a clear-filters hint) when unset, so opting in is purely additive. Both icons resolve through the icon registry.

## Editable cell columns

`TextInputColumn`, `ToggleColumn`, and `SelectColumn` turn the cell into
an inline edit control. Each change PATCHes a single column on a single
record via `POST {base}/{slug}/:id/_cell/:column`; the row never enters
a full edit form.

```ts
Resource.table = (t) => t.columns([
  TextInputColumn.make('title')
    .validate(minLength(3))
    .placeholder('Untitled'),
  SelectColumn.make('status')
    .options({ draft: 'Draft', published: 'Published' })
    .nullable(),
  ToggleColumn.make('featured')
    .onColor('success'),
])
```

**Auth.** Per-row `Resource.canEdit(user, record)` gates every cell —
forbidden rows render the read-only formatter. Pair with
`disabled(record => …)` for finer-grained per-row gating that doesn't
require a separate policy method.

**Validators.** Same surface as `Field.validate(...)`. Reuses the
built-in rules (`required`, `email`, `minLength`, `unique`, …). Errors
land under `{ ok: false, errors: { value: string[] } }` (HTTP 422).

**Optimistic UI.** The local cell updates immediately; on validation or
network failure it rolls back to the persisted value and shows an error
toast.

## User-toggleable columns — `toggleable()`

Let users show / hide columns from the table toolbar's **Columns** dropdown.
Preference persists per-table to `localStorage` (key
`pilotiq.table.<currentPath>.columns.<col>`) so the choice sticks across
reloads + SPA navigations.

```ts
Resource.table = (t) => t.columns([
  TextColumn.make('name'),
  TextColumn.make('email').toggleable(),                          // user can hide
  TextColumn.make('internalId').toggleable({ initiallyHidden: true }), // starts off-screen
  TextColumn.make('createdAt').dateTime().toggleable(),
])
```

The dropdown trigger renders in the toolbar next to Filters / Sort. Each
toggleable column is listed with a checkbox; non-toggleable columns
always render and never appear in the dropdown. Hidden state is purely
presentational — the column's data still loads from the server, so
sorts / filters that reference a hidden column keep working and a
re-toggle paints fresh values without a roundtrip.

`initiallyHidden` flips the default state so the column starts off until
the user opts in — useful for technical / debug columns that the typical
viewer doesn't need but power users might.

**Per-row select options.** Pass a function to `SelectColumn.options(...)`
to resolve the option list per row. Useful when valid choices depend on
record state (assignees scoped to a team, statuses filtered by current
state, etc.). The resolver may be async; resolvers across the visible
rows run in parallel.

```ts
SelectColumn.make('assigneeId')
  .options(async (row) => {
    const team = await Team.find(row.teamId)
    return team.members.map(m => ({ value: String(m.id), label: m.name }))
  })
```

A throwing resolver leaves the slot unset on that row only — the cell
falls back to whatever static `.options()` was set (or empty list) so
one bad row doesn't break the whole table. Resolvers run inside the
same `canEdit` gate as the rest of the editable-cell pipeline; rows
where `canEdit` denies don't pay the resolver cost.

**Confirm-gating.** Add `.confirm('Are you sure?')` to wrap the PATCH
in a Dialog before firing.

**Lifecycle hooks.** `beforeStateUpdated((value, { record, user }) => …)`
runs after validators pass and before the DB write — use for
cross-cell invariants, audit-log writes that must precede the update,
or async availability checks. `afterStateUpdated` mirrors the same
shape but fires after the DB write succeeds — use for notifications,
broadcasts, or follow-up writes that should fire only on a confirmed
save. Throw an `Error` from either to halt; the message lands under
the reserved `_cell` error key in the 422 response so the renderer
can surface it next to the cell.

```ts
TextInputColumn.make('title')
  .beforeStateUpdated(async (value, { record, user }) => {
    if (await Lock.exists({ post: record['id'], holder: user?.id })) {
      throw new Error('Another editor is holding this row.')
    }
  })
  .afterStateUpdated(async (value, { record }) => {
    await ActivityLog.create({ post: record['id'], change: { title: value } })
  })
```

**Boot guard.** Declaring an editable column on a Resource without
`R.model.update(id, data)` throws a clear error at panel boot — every
inline-edit column needs an ORM behind it.

> [!NOTE]
> Bulk inline-edit, async per-row select options, and per-cell ETag
> concurrency control are deferred. Last write wins (Filament parity).

## Footer summaries

```ts
Column.make('amount')
  .money('USD')
  .summarize([Sum.make().label('Total'), Average.make().label('Avg')])
```

The footer aggregate covers the **full filtered set**, not just the rows
on screen — so a "Total" over 4,000 filtered rows is the real total, not
page 1's. For model-backed resources this runs as a second aggregate
query (`SUM`/`AVG`/`MIN`/`MAX`; `Count` reuses the row count) that
respects the active search, filters, tab, and group drill-in. The result
is stamped on `meta.summaries` for the `<tfoot>` row.

> [!NOTE]
> Columns that aren't real database columns — virtual columns,
> `formatStateUsing` outputs, relationship columns — and tables with a
> custom `Table.records()` handler fall back to summarizing the rendered
> page (the previous behaviour). Per-group (banded) summary rows are also
> per-page for now; the global footer is the cross-page one.

## Per-cell links

By default, every data cell wraps its content in an `<a href>` so plain
left-clicks SPA-nav, modified clicks fall through (cmd/ctrl/shift), and
keyboard nav works. Disable per-column with `.recordUrl(false)`.

> [!NOTE]
> Action and bulk-select cells stay unwrapped — the row-link doesn't
> swallow action button clicks.
