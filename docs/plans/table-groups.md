# Table.groups([...])

Tier-2 follow-up to Batch B (`Table.defaultGroup` + `Column.summarize`,
shipped 2026-05-04). Adds the rich grouping surface: multiple group
options selectable via a dropdown, per-group labels / descriptions /
collapsibility, and record-derived group titles (so a `status` value of
`draft` can render as `"Drafts"`).

**Status:** SHIPPED 2026-05-03. `TableGroup` primitive + `Table.groups([…])`
+ `defaultGroup(string | TableGroup)` widening + `?group=` URL key +
per-row `_groupTitle / _groupDescription` stamping + date bucketing +
collapsible heading rows with localStorage persistence + group selector
dropdown all landed in a single pass. Tests 1608 → 1644 (+36).

**Follow-up (2026-05-03 cont'd):** per-group summarizers. When an active
group is set AND at least one column has `summarize([…])`, the dispatcher
also computes summaries within each group bucket and stamps
`TableMeta.groupSummaries: Record<groupValue, Record<colName, SummaryResult[]>>`.
Renderer emits an inline summary row at the END of each group band,
aligned to the same columns as the global `<tfoot>` and suppressed when
the group is collapsed. Tests 1644 → 1649 (+5).

**Companion:** the bare-column form (`Table.defaultGroup('col')`)
remains supported — it's a one-liner alias for the new richer API and
keeps the existing wire shape intact when the rich form isn't used.

---

## Why now

Today's `Table.defaultGroup('column')` stable-sorts rows so shared
column values cluster together and renders a banded heading row whenever
the value changes. That's the minimum viable group banding. The audit
(`docs/plans/admin-gap-audit.md`) explicitly calls out the deferred
upgrade:

> Rich `Table.groups([Group.make().label().collapsible()])` deferred
> (extends Batch B).

Things missing today:

- **Custom labels** — `'draft'` always renders as `'draft'`. Can't map
  to `'Drafts'`.
- **Multiple group options** — only one column can ever be the active
  group. Users want a dropdown to switch between e.g. "By Status",
  "By Author", "By Created Date".
- **Collapsible groups** — heading rows have no chevron; clicking does
  nothing. Big tables with 10+ groups can't be collapsed.
- **Per-group descriptions / icons / counts** — no way to add chrome
  next to the label.
- **Date bucketing** — can't group by day extracted from a timestamp
  column.

---

## Naming — `TableGroup`, not `Group`

`Group` is already exported from `@pilotiq/pilotiq` as the schema-layout
chrome-less container (see `src/schema/Group.ts`). The new
table-grouping primitive lives at `src/elements/TableGroup.ts` and
exports as `TableGroup`. No collision; the call sites read clearly.

---

## API

```ts
import { Table, TableGroup, Column } from '@pilotiq/pilotiq'

Table.make()
  .columns([
    Column.make('title'),
    Column.make('status'),
    Column.make('author.name').label('Author'),
    Column.make('createdAt').label('Created'),
  ])
  .groups([
    TableGroup.make('status')
      .label('Status')
      .getTitleFromRecordUsing(r => r.status === 'draft' ? 'Drafts' : 'Published')
      .collapsible(),
    TableGroup.make('author.name')
      .label('Author')
      .collapsible()
      .collapsed(),                         // start folded
    TableGroup.make('createdAt')
      .label('Created date')
      .date()                                // bucket by day
      .collapsible(),
  ])
  .defaultGroup('status')                   // accepts a string OR a TableGroup ref
```

### Surface (v1)

| Setter | Description |
|---|---|
| `TableGroup.make(column)` | Column to band on. The same column name appears as the dropdown URL key (`?group=status`). |
| `.label(text)` | Display label in the group selector dropdown. Falls back to the column's own label, then to the column name. |
| `.collapsible(v=true)` | Allow folding individual groups. Adds a chevron in the heading row. |
| `.collapsed(v=true)` | Start collapsed by default. Per-group state is persisted client-side in localStorage. |
| `.getTitleFromRecordUsing((record) => string)` | Custom heading text per row. Receives the full record. Falls back to the raw column value when omitted. Stamped per row server-side as `_groupTitle`. |
| `.getDescriptionFromRecordUsing((record) => string)` | Subtitle below the title. Stamped per row as `_groupDescription`. |
| `.date(v=true)` | Sugar for grouping by day — the column is read as a date and bucketed to `YYYY-MM-DD`. Uses `_groupValue` for the bucket key (so stable-sort still works) and a default `getTitleFromRecord` formatter ("May 4, 2026"). User-supplied title formatter wins. |

### `Table.defaultGroup` widening

Today: `defaultGroup(column: string)`. Becomes:

```ts
defaultGroup(group: string | TableGroup): this
```

When passed a `TableGroup` instance, `Table.groups([...])` is auto-
populated with that group if it isn't already there (so users can
shorthand `defaultGroup(TableGroup.make('status').label('Status'))`
without repeating the registration). Bare-string form still works
identically — it's the no-metadata case (no label, no collapse, no
record-derived title).

### URL key — `?group=…`

Reserved query keys today: `search / sort / page / perPage`. Adds
`group`. Selection rules:

| URL state | Active group |
|---|---|
| `?group=status` | The `status` group, if it's in `groups([])` (or the bare-column fallback). |
| `?group=` (empty) | No grouping — overrides `defaultGroup`. |
| absent | Falls back to `defaultGroup`. |

`?group=unknownColumn` is treated as `?group=` (empty) so a stale
bookmark to a removed group doesn't crash the page.

### Wire shape

`TableMeta` gains:

```ts
groups?: TableGroupMeta[]      // dropdown options
activeGroup?: string            // resolved active column name
```

`TableGroupMeta`:

```ts
interface TableGroupMeta {
  column:        string
  label:         string
  collapsible?:  true
  collapsed?:    true            // default-collapsed
}
```

Existing `defaultGroup?: string` stays — it now means "the resolved
active group's column when one is active", populated per request from
either `?group=` or the user's `defaultGroup(...)` config. The renderer
keeps reading from this single field; the new `groups` array only
drives the dropdown.

Per-row stamping:

| Key | When | Source |
|---|---|---|
| `_groupValue` | active group is set | raw column value (date-bucket key when `date()`) |
| `_groupTitle` | `getTitleFromRecordUsing` is set OR `date()` is on | resolved title text |
| `_groupDescription` | `getDescriptionFromRecordUsing` is set | resolved subtitle text |

The existing `_groupValue` semantics are unchanged — it's still the
stable-sort key, still empty-string for nullish.

---

## Implementation plan

### 1. `TableGroup` primitive (`src/elements/TableGroup.ts`)

New class with the fluent setters above. Not an `Element` (it doesn't
sit in the schema tree — it's a value object owned by `Table`). Plain
class with `getColumn() / getLabel() / isCollapsible() / isCollapsed() /
getTitleHandler() / getDescriptionHandler() / isDate()` getters and
`toMeta(): TableGroupMeta` for serialization.

### 2. `Table` extensions (`src/elements/Table.ts`)

- `private _groups: TableGroup[] = []`
- `private _activeGroup?: string` — render-time, set by `loadTableRecords`
- `groups(items: TableGroup[]): this` — replaces the list
- `defaultGroup(group: string | TableGroup): this` — overload; extract
  column when given a TableGroup, auto-add to `_groups` if missing
- `withActiveGroup(column: string | undefined): this` — render-time setter
- `getGroups(): TableGroup[]`
- `getActiveGroup(): TableGroup | undefined` — resolves `_activeGroup`
  back to a `TableGroup`, falling back to a synthetic bare-column group
  when the active column has no rich registration
- `toMeta()` emits `groups: TableGroupMeta[]` only when `_groups.length > 0`

### 3. `dispatchTable.ts`

- Add `'group'` to `RESERVED_QUERY_KEYS`.
- New `parseActiveGroup(query, table)` — reads `?group=`, validates
  against `table.getGroups()`, falls back to `defaultGroup`. Empty
  string explicitly disables.
- `loadTableRecords` calls it, then resolves the `TableGroup` instance
  (synth one for bare columns).
- Replace `groupColumn` lookup with `activeGroup?.getColumn()`.
- Per-row stamping: when active group has a `getTitleFromRecordUsing`
  handler OR `isDate()`, stamp `_groupTitle` (try/catch silent on
  throw — falls back to raw value). Same posture for description. Date
  bucketing: convert `Date | string | number` → `YYYY-MM-DD` for both
  the sort key (`_groupValue`) and the default title (locale-formatted
  via `Intl.DateTimeFormat`).
- Mirror `withActiveGroup(activeColumn)` after the table loads so
  `toMeta()` emits the resolved column.

### 4. Renderer (`src/react/SchemaRenderer.tsx`)

- Read `groups: TableGroupMeta[]` and `activeGroup?: string` off the
  meta. When `groups.length >= 2` (or `>= 1 && hasRichMetadata`),
  render a select dropdown above the table — labelled "Group by",
  options = `[None, ...groups]`. Selecting an option SPA-navigates to
  `pathname + ?group=col + …existingFilters`.
- Heading row: read `_groupTitle ?? groupValue` for display,
  `_groupDescription` underneath. Existing `groupColumnLabel` becomes
  the active group's `.label()`.
- Collapsible: when the active group's meta has `collapsible: true`,
  show a chevron in the heading row. State lives in
  `useState<Record<string, boolean>>(...)` keyed by `_groupValue`.
  Initial state: `collapsed: true` from meta + localStorage override.
  `pilotiq.table.<currentPath>.groups.<column>.<value>` localStorage
  key. Collapsed groups: hide the data rows that follow until the next
  group heading. Implementation: extra `if (collapsedGroups.has(value))
  return null` inside the existing `rows.map(...)`, AFTER emitting the
  heading row.

### 5. Tests

`packages/pilotiq/src/elements/TableGroup.test.ts` — new file:

- Fluent setters round-trip on `toMeta()`.
- `getTitleFromRecordUsing` evaluates with the full record.
- `getDescriptionFromRecordUsing` evaluates.
- `date()` bucketing converts ISO strings, Date instances, timestamps.

`packages/pilotiq/src/elements/dispatchTable.test.ts` — extend the
existing `Table.defaultGroup + summaries` describe:

- `?group=col` switches the active group.
- `?group=` explicitly disables grouping (overrides defaultGroup).
- `?group=unknownColumn` falls back to no grouping.
- Active group with `getTitleFromRecordUsing` stamps `_groupTitle`.
- `date()` bucketing stamps `_groupValue` as `YYYY-MM-DD`.
- Throwing title/description handlers stay silent.

`packages/pilotiq/src/elements/Table.test.ts` — extend:

- `groups([...])` round-trips on `toMeta().groups`.
- `defaultGroup(TableGroup.make('col').label('X'))` auto-adds to groups.
- `defaultGroup('col')` bare-string still works (no groups serialized).

Estimate: +25-30 tests.

### 6. Playground demo

`playground-pilotiq/app/Pilotiq/Articles/Tables/ArticlesTable.ts`:

- Add three group options: status (with custom title labels), author,
  created date (with `.date()`).
- Set `defaultGroup('status')` + `.collapsible()` + `.collapsed(false)`.

### 7. Docs

- `docs/guide/tables.md` — new "Grouping" section (or extend if the
  existing one only covers `defaultGroup`).
- `packages/pilotiq/CLAUDE.md` — extend the `src/elements/` Table
  entry with the `groups([...])` surface.
- `README.md` — surface `Table.groups()` in the tables bullet.
- `docs/plans/admin-gap-audit.md` — flip the row to ✅.

---

## Out of scope (deferred to v2)

- ~~**Manual group ordering**~~ ✅ shipped 2026-05-03 cont'd —
  `TableGroup.orderUsing((a, b) => number)` overrides the default
  alphabetic comparator on group keys. Sugar helper `orderByKeys([…])`
  handles the common "pin these in order" case. Empty-bucket-last rule
  is structural and still applies after the user's comparator.
- **`scopeQueryByKey()`** — clicking a group name to navigate to a
  filtered view of just that group. Still deferred — needs renderer
  work (clickable heading) + URL-param wiring; coupled enough to
  filtering that it deserves its own pass.
- **Group counts in the dropdown** — `"Status (3)"`. Needs a separate
  count query per group; defer.
- **Server-side query-driven grouping** — today the row order comes
  from the user's `records()` and we cluster client-side via stable-
  sort. Filament can do `ORDER BY status, created_at DESC` natively;
  we emulate with stable-sort. Acceptable for v1; revisit when the
  page-size grows past a few hundred.

---

## How this fits the audit

`docs/plans/admin-gap-audit.md` Tables row currently reads:

> ✅ `defaultGroup` (group-by row banding) DONE — Rich
> `groups([...])` (collapsible/labeled) deferred.

Post-shipping this plan, that row flips to fully ✅ and the deferred
text drops to a v2 callout (manual ordering, per-group summarizers).

---

## Estimated size

~400-500 LOC across 6-7 files. Single session. Tests +25-30 (1608 →
~1635).
