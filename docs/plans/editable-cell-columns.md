# Editable cell columns

Three new column subclasses — `SelectColumn`, `ToggleColumn`, `TextInputColumn` — that turn a list-page cell into an inline edit control. Every change PATCHes a single column on a single record; the row never enters a full edit form.

**Status:** PROPOSED. Single ~2-day push.

**Depends on:** `Column.ts` (base + meta), `dispatchTable.ts` (per-row server-side eval), `routes.ts` (resource scope, policy preludes), `R.canEdit(user, record)` (Plan #10), `validation/validators.ts` (reused as-is), `TableRenderer` in `SchemaRenderer.tsx`.

**Companion plan:** `admin-gap-audit.md` (Tier 3 row in §1 / explicit deferral in §2 — "deserve their own doc").

**Filament parity:** `Tables\Columns\SelectColumn / ToggleColumn / TextInputColumn` — same names, same shape. Verbatim public API (`.options()`, `.boolean()`, `.type()`, `.rules()` mapped to our `.validate()`).

---

## Final API surface

### Shared on every editable column

```ts
Column.editable()                                  // marks the column editable (base flag — internal)
Column.editable().disabled()                       // render the control read-only client-side
Column.editable().confirm('Are you sure?')         // gate the PATCH behind a confirm dialog
Column.editable().validate(rule | [rule, rule])    // server-side validators (reuses Field validators)
Column.editable().required()                       // sugar — adds the existing `required()` rule
```

`disabled()` is a server-resolved boolean OR `(record) => boolean` so per-row gating on field-level state works (e.g. "can't edit status on archived rows"). Independent from `R.canEdit(user, record)` — auth wins.

### TextInputColumn

```ts
TextInputColumn.make('title')
  .type('text' | 'number' | 'email' | 'url' | 'tel')   // default 'text'
  .placeholder('Untitled')                              // input placeholder (NOT the empty-cell fallback)
  .step(0.01)                                           // numeric only
  .min(0).max(100)                                      // numeric only
  .debounce(500)                                        // ms after last keystroke; default 500
```

Wire format: PATCH body `{ value: string }`, server coerces `'number' | 'email' | 'url' | 'tel'` against `type`. Empty string saved as `null` when the column is nullable on the underlying model (we trust the validator + ORM to reject otherwise).

### ToggleColumn

```ts
ToggleColumn.make('featured')
  .onColor('success')                                   // default 'primary'
  .offColor('muted')                                    // default 'muted'
  .onIcon('check').offIcon('x')                         // optional — when set renders icon switch instead of native toggle
```

Wire format: PATCH body `{ value: boolean }`. No debounce — every toggle is one round-trip.

### SelectColumn

```ts
SelectColumn.make('status')
  .options({ draft: 'Draft', published: 'Published', archived: 'Archived' })
  .nullable()                                           // adds a "—" option for null
  .selectablePlaceholder(false)                         // hide the placeholder once a value is set
```

`options(map)` and `options([{ value, label }])` both accepted (mirrors `SelectField`). v1 is **static options only** — no async resolver yet (defer until a consumer hits it). Wire format: PATCH body `{ value: string | null }`.

---

## Internal mechanics

### Column-type discriminators

Three new values added to `ColumnType`:

```ts
export type ColumnType =
  | 'text' | 'badge' | 'icon' | 'boolean' | 'image'
  | 'textInput' | 'toggle' | 'select'
```

Each subclass calls `setColumnType(...)` in its constructor and contributes its specific shape to `ColumnMeta` via the existing `serializeExtras(meta)` hook. New base meta fields:

```ts
ColumnMeta.editable?:  true                  // sentinel: "this column wants per-row edit URLs"
ColumnMeta.confirm?:   string                // confirm-dialog message
ColumnMeta.disabled?:  true                  // static disable; per-row stamps land on the row
ColumnMeta.rules?:     SerializedRule[]      // mirrors FieldMeta.rules — for client-side hints
```

Subclass-specific meta lands under `ColumnMeta` directly (consistent with how `badgeColors`, `iconOptions`, `imageSize` are already inlined):

```ts
ColumnMeta.inputType?:      'text' | 'number' | 'email' | 'url' | 'tel'
ColumnMeta.inputPlaceholder?: string
ColumnMeta.inputStep?:      number
ColumnMeta.inputMin?:       number
ColumnMeta.inputMax?:       number
ColumnMeta.debounceMs?:     number
ColumnMeta.toggleOnColor?:  ColumnColor
ColumnMeta.toggleOffColor?: ColumnColor
ColumnMeta.toggleOnIcon?:   string
ColumnMeta.toggleOffIcon?:  string
ColumnMeta.selectOptions?:  Array<{ value: string; label: string }>
ColumnMeta.selectNullable?: true
```

### Per-row server-side eval

`dispatchTable.ts` already gates row mutation on a `needsRowMutation` boolean that ORs together "this table needs per-row stamping for X". Add **one new branch**:

```ts
const editableColumns = (table.getChildren() ?? [])
  .filter((c): c is Column => c instanceof Column && c.isEditable())

const needsRowMutation =
  rowActionsWithRules.length > 0
  || columnsWithFormatter.length > 0
  || columnsWithRecordUrl.length > 0
  || recordUrlFn !== undefined
  || recordClassesFn !== undefined
  || groupColumn !== undefined
  || editableColumns.length > 0   // ← new
```

Inside the row-mutation loop, stamp **two** parallel maps under reserved keys (no Promise.all over the columns themselves — `R.canEdit` is one call per row, not per column):

```ts
if (editableColumns.length > 0 && R) {
  const id = primaryKey(row)                    // existing helper
  const allowed = await R.canEdit(user, row)    // already cached upstream? no — first eval here
  if (allowed && id !== undefined) {
    const editableMap: Record<string, true> = {}
    const editUrls:    Record<string, string> = {}
    const disabledMap: Record<string, true> = {}
    for (const col of editableColumns) {
      // resolve per-column static-or-fn `disabled`
      const colDisabled = col.isDisabledFor(row)
      if (colDisabled) disabledMap[col.name] = true
      editableMap[col.name] = true
      editUrls[col.name]    = `${basePath}/${slug}/${id}/_cell/${col.name}`
    }
    out['_cellEditable']      = editableMap
    out['_cellEditUrls']      = editUrls
    if (Object.keys(disabledMap).length > 0) out['_cellDisabled'] = disabledMap
  }
}
```

`R.canEdit(user, row)` is called **once per row** regardless of how many editable columns the table has — same record, same answer. List-page `canEdit` overrides that branch on `record === undefined` (per `feedback_per_row_server_eval_convention.md` and the reorderable-rows decision) won't fire — we have a real record here.

`basePath` + `slug` need to thread into `loadTableRecords`. They already thread in for action dispatch URL stamping (`tagRowActionDispatchUrls` in `pageData.ts`). Cleaner to add a parallel **`tagCellEditUrls(elements, base, slug)`** helper in `pageData.ts` that runs AFTER `loadTableRecords` and stamps URLs per row — keeps `dispatchTable` ORM-agnostic. Reverse the order proposed above:

1. `dispatchTable` stamps `_cellEditable: { [col]: true }` + `_cellDisabled: { [col]: true }` (no URLs).
2. `pageData.tagCellEditUrls(...)` walks the rows post-dispatch and adds `_cellEditUrls`.

Mirrors how `tagTableReorderUrls` and `tagFormStateUrls` work (URL building stays in `pageData.ts`).

### PATCH route

```
POST {base}/{slug}/:id/_cell/:column
Body: { value: string | number | boolean | null }
Auth: R.canAccess(user) + R.canEdit(user, record)
```

Response shapes:

```ts
// Success
200 { ok: true, value: <coerced new value>, notifications: NotificationMeta[] }

// Validation
422 { ok: false, errors: { value: string[] } }

// Auth fail
403 { ok: false, error: 'forbidden' }

// Bad column / not editable / column not found
400 { ok: false, error: 'unknown column' | 'column not editable' }

// Model.update throws
422 { ok: false, error: <message> }
```

Reuses the `Accept: application/json` JSON path from form-modal actions. URL handler (`routes.ts`):

```ts
router.post(`${indexUrl}/:id/_cell/:column`, async (req, res) => {
  await checkPolicy(() => R.canAccess(user))
  const record = await R.model!.find(req.params.id)
  if (!record) return notFound(res)
  await checkPolicy(() => R.canEdit(user, record))

  const col = R.table(Table.make()).getChildren()
    .find(c => c instanceof Column && c.name === req.params.column && c.isEditable()) as Column | undefined
  if (!col) return res.status(400).json({ ok: false, error: 'unknown column' })

  const raw   = req.body.value
  const value = coerceCellValue(col, raw)              // type-aware coerce
  const errs  = await runColumnValidators(col, value, record)
  if (errs.length) return res.status(422).json({ ok: false, errors: { value: errs } })

  try {
    await R.model!.update(req.params.id, { [col.name]: value })
  } catch (e) {
    return res.status(422).json({ ok: false, error: errorMessage(e) })
  }

  return res.json({ ok: true, value, notifications: [] })
})
```

`coerceCellValue` is a thin switch on `column.getColumnType()` — strings stay strings for `textInput type='text' | 'email' | 'url' | 'tel'`, parsed via `Number()` for `'number'`, boolean cast for `'toggle'`, string-or-null for `'select'`. No new generic-coerce hook on Column needed.

`runColumnValidators` reuses `Field.runValidators`'s exact loop — easiest path is to have `Column.editable()` build an internal `_validators: Validator[]` array on the column itself (parallel to `Field._validators`) and expose `getValidators(): Validator[]` + `runValidators(value, ctx)`. Validators see a `ValidatorContext { record, user, value }`.

Boot-time guard: registering an editable column on a Resource without `R.model?.update` throws a clear error at panel boot (mirrors Plan #13's restore/forceDelete check + Plan #14's reorder check). No editable column can ship without an ORM.

### Renderer

`TableRenderer` cell switch in `formatCell`:

```ts
const editable = col.editable && row._cellEditable?.[col.name]
const editUrl  = row._cellEditUrls?.[col.name]
const disabled = col.disabled || row._cellDisabled?.[col.name] || !user-can-edit

if (editable && editUrl && !disabled) {
  switch (col.columnType) {
    case 'textInput': return <CellTextInput url={editUrl} value={raw} col={col} />
    case 'toggle':    return <CellToggle    url={editUrl} value={raw} col={col} />
    case 'select':    return <CellSelect    url={editUrl} value={raw} col={col} />
  }
}

// fall through to read-only formatter
```

New file: `src/react/cells/EditableCell.tsx` exporting `CellTextInput`, `CellToggle`, `CellSelect`. Each:

- Holds local `value` state, seeded from props; updates optimistically.
- POSTs to `editUrl` with `Accept: application/json`.
- On success: drains notifications via `useToast()`. No SPA-nav (the row stays as-is — `recordUrl` would conflict).
- On 422: rolls back local value, shows inline error tooltip + toast with the validator message.
- On 5xx / network: rolls back, error toast `"Couldn't save"` (mirrors reorderable-rows).
- Confirm-gated: opens a Dialog before firing the PATCH; rollback on cancel.

`CellTextInput` debounces by `col.debounceMs ?? 500`; commits on blur regardless. `CellToggle` and `CellSelect` PATCH immediately.

**Row navigation interaction:** wrap each cell in `data-no-row-nav` so the editable control doesn't trigger the row's `<a href>` link wrapper (mirrors how the actions cell is wrapped today). Editable cells lose `recordUrl` semantics by design — the cell IS the affordance.

**Bulk-select interaction:** unchanged — bulk-select column stays leftmost, editable columns sit in the data area.

**Reorder DnD interaction:** the reorder grip is already leftmost. Editable cells inside reorderable tables work — the user just can't drag from inside an input (correct behavior; the grip is the affordance).

---

## Files touched

- `packages/pilotiq/src/Column.ts` — add `editable() / disabled() / confirm() / validate() / required()` base setters + `_validators` array + `_editable / _confirm / _staticDisabled / _disabledFn` slots + `isEditable / isDisabledFor / runValidators / getValidators` getters + meta serialization (`editable / confirm / disabled / rules`).
- `packages/pilotiq/src/columns/TextInputColumn.ts` — new file.
- `packages/pilotiq/src/columns/ToggleColumn.ts` — new file.
- `packages/pilotiq/src/columns/SelectColumn.ts` — new file.
- `packages/pilotiq/src/columns/index.ts` — barrel re-export.
- `packages/pilotiq/src/index.ts` — top-level re-export.
- `packages/pilotiq/src/elements/dispatchTable.ts` — new editable-columns branch in `needsRowMutation` + per-row `_cellEditable / _cellDisabled` stamping.
- `packages/pilotiq/src/pageData.ts` — new `tagCellEditUrls(elements, base, slug)` helper, called after `loadTableRecords` in `resourceIndexData`.
- `packages/pilotiq/src/routes.ts` — new `POST {indexUrl}/:id/_cell/:column` handler. Boot-time guard for editable column without `R.model.update` (alongside the existing reorderable check).
- `packages/pilotiq/src/cells/coerce.ts` — new `coerceCellValue(col, raw)` (small file, separate so the route handler stays thin).
- `packages/pilotiq/src/react/SchemaRenderer.tsx` — extend `formatCell` switch.
- `packages/pilotiq/src/react/cells/EditableCell.tsx` — new file with `CellTextInput / CellToggle / CellSelect`.
- Tests: `columns/TextInputColumn.test.ts`, `columns/ToggleColumn.test.ts`, `columns/SelectColumn.test.ts`, `Column.test.ts` (editable/validate/disabled additions), `dispatchTable.test.ts` (per-row `_cellEditable` stamping + canEdit gate), `pageData.test.ts` (`tagCellEditUrls`), `routes.test.ts` (happy path, 400 unknown column, 400 not editable, 403 canEdit fail, 404 missing record, 422 validator fail, 422 ORM throw, boot guard).
- Playground demo: `playground-pilotiq` `PostResource.table()` — `status` as `SelectColumn`, `featured` as `ToggleColumn`, `title` as `TextInputColumn` (with a real validator).
- Docs: `docs/plans/admin-gap-audit.md` (✅ row in §1 + scrub the "deserve their own doc" line in §2), `docs/packages/pilotiq/resources.md` (new "Editable cell columns" subsection), `docs/packages/pilotiq/schema.md` (`ColumnMeta` shape diff), `README.md` (mention in CRUD-pages bullet), `packages/pilotiq/CLAUDE.md` (one-line update under the `src/columns/` bullet).

---

## What we're NOT shipping in v1

- **Async per-row select options.** Static `options(map)` only. Add an `options(fn)` resolver later if a consumer hits it.
- **Per-cell history / audit log.** Out of scope. Apps that need it wrap `R.model.update` themselves.
- **Optimistic concurrency control** (ETag / `updated_at` check). PATCH overwrites; last write wins. Filament does the same.
- **Multi-cell editing** (Excel-style). Not on the gap-audit; defer.
- **Cell-level visible/hidden** based on user. `disabled()` and `R.canEdit` cover the practical cases.
- **Dropdown placement collisions** with reorder grip / bulk-select / row actions. They live in different cells; v1 trusts existing column ordering.

---

## Decisions to lock in before implementing

1. **Route shape.** `POST {base}/{slug}/:id/_cell/:column` — mirrors `_form / _action / _uploads / _search / _reorder` reserved-prefix convention. Underscore reserves the segment. ✅
2. **Auth gate.** `R.canEdit(user, record)` — same as Action.edit / EditPage. Per-cell auth NOT introduced (`canEditCell(user, record, column)` is overkill; `disabled(record => …)` covers the per-row case without expanding the policy surface).
3. **Validator surface.** Reuse `Validator` type + `ValidatorContext` as-is. Column inherits the same `.validate()` API as Field, no new validation primitive.
4. **Optimistic UI.** Yes — every cell control updates local state immediately and rolls back on failure. Mirrors reorderable-rows. Toast on rollback.
5. **TextInput debounce default.** 500ms after last keystroke + commit on blur. Filament defaults to "on blur only"; we add the debounce because admins rarely tab out of cells.
6. **Confirm gating.** Opt-in via `.confirm(message)`. Defaults off — Toggle and Select rarely need it.
7. **Server-side coerce.** Per-`columnType` switch in `cells/coerce.ts`; do NOT extend `coerceFormValues` — different shape (single key/value, not a form body), no benefit from sharing the loop.
8. **Per-row eval cost.** ONE `R.canEdit(user, row)` call per row regardless of how many editable columns; per-column `disabled(fn)` evaluations inside the loop are sync (no async-disabled in v1). Tables without editable columns pay zero cost (gated on `editableColumns.length > 0`).
9. **Boot guard.** Throw at panel boot when an editable column's resource lacks `R.model?.update` — same shape as reorderable rows / soft deletes.
10. **No notification on success by default.** PATCH response carries `notifications: []`. Mutations are silent — toast spam if every keystroke saved would trigger one. Apps can still emit a notification from a custom column's validator/handler later.

---

## Tests delta

Roughly +35 tests:

- `columns/TextInputColumn.test.ts` (+8): meta serialization (default + each option), `setColumnType('textInput')`, debounceMs / step / min / max round-trip.
- `columns/ToggleColumn.test.ts` (+6): meta + on/off color/icon round-trip.
- `columns/SelectColumn.test.ts` (+8): static options as map + as array, nullable round-trip, selectablePlaceholder default.
- `Column.test.ts` (+5): `editable() / required() / validate() / confirm() / disabled(fn)` setters and `isEditable / runValidators / isDisabledFor` getters.
- `dispatchTable.test.ts` (+4): `_cellEditable` stamped only on rows that pass `canEdit`, `_cellDisabled` per static + per-row, gating off when no editable columns, boot guard fires.
- `pageData.test.ts` (+2): `tagCellEditUrls` stamps `_cellEditUrls` only when `_cellEditable` is set.
- `routes.test.ts` (+8): happy path, 400 unknown column, 400 not editable, 403 canEdit fail, 404 missing record, 422 validator fail, 422 ORM throw, 422 invalid JSON body, boot guard.

Goal: ~1431 tests at end (up from 1396).

---

## Followups (not in v1)

- `ColorColumn` (color swatch, native picker on edit).
- Async select options + dependent-on-row.
- "Save" / "Discard" inline button instead of debounce, for noisy fields.
- Cross-page edit audit (who-edited-what trail).
- Bulk inline-edit (Filament has none — defer until a consumer asks).
