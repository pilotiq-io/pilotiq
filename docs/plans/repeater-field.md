---
name: Repeater Field
description: Plan #14 — Repeater field (array of subschema rows) + reactive / visibility / validation interop
type: plan
---

# Repeater Field

Plan #14, follow-up to Plan #6 (`field-types-expansion.md`) which
deliberately deferred Repeater because it needs reactive-layout
interop and conditional visibility for nested rows. With Plans #5
(reactive fields), #6 (field types), and #8 (schema layouts) all
landed, every dependency is in place.

A Repeater is an array-of-subschema field: the user composes an inner
schema once, and the rendered form lets the end user add / remove /
reorder rows of that schema. Storage is `[{ field1, field2 }, …]`
on the parent record. This is the highest-value missing field type —
order line items, FAQ entries, social links, contact rows, ACL rules,
nutrition labels, environment variables. Today users hit a wall on
the first non-trivial CRUD form that needs more than scalar values.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. `RepeaterField` skeleton — class, `fieldType:'repeater'`, builders | ✅ DONE | Subclass `Field`; `schema()` stores child elements; `defaultItems / minItems / maxItems / reorderable / collapsible / collapsed / cloneable / itemLabel / addActionLabel / columns` |
| 2. `toMeta()` — resolve inner schema once per row | ✅ DONE | `resolveRepeaterRows` in `resolveSchema.ts`; row-scoped `RenderContext` carries `row.index / $get / $set`; `meta.rows` + `meta.template` populated |
| 3. Coercion — recurse into `items.<i>.<name>` keys | ✅ DONE | `walkRepeatersTopLevel` runs before `walkFields` in `coerceFormValues`; recurses into row bodies for both JSON and flat-key shapes; trailing-empty-row trim |
| 4. Validation — keyed by `items.<i>.<name>` | ✅ DONE | `validateRepeater` in `runValidators.ts`; per-row recursion + `min/maxItems` under bare key |
| 5. Plan #5 reactive interop — partial-resolve over rows | ✅ DONE | `applyRepeaterStateUpdate` resolves dotted paths; row-scoped `$get / $set` + dotted-path bridge; `ctx.row` exposed |
| 6. Plan #8 visibility interop — row-scoped `LayoutContext` | ✅ DONE | `LayoutContext.row` propagates from `RenderContext.row`; inner `Section.visible(({ values }) => …)` sees row-scoped values |
| 7. Client renderer — `RepeaterInput` | ✅ DONE | `react/fields/RepeaterInput.tsx`; per-row name prefixing via `prefixFieldNames`; stable `__id` round-trip |
| 8. Drag-reorder a11y | ✅ DONE (v1: buttons) | Up / Down arrow buttons per row; HTML5 drag deferred to v1.1 |
| 9. Collapsed-state persistence | ✅ DONE | `pilotiq.repeater.<formId>.<fieldName>.<rowId>` in localStorage via `FormIdContext` |
| 10. Walker registrations | ✅ DONE | `walkFields / findForms / findActions / findTables / findFieldByName / validateSchema.walk` all stop at Repeater; structural `isRepeaterField` helper for Vite-SSR-dup safety |
| 11. Playground demo | ✅ DONE | `playground-pilotiq/app/Pilotiq/pages/RepeaterDemo.ts` at `/new-admin/repeater-demo`; pinned `formId('repeater-demo')` |
| 12. Docs | ✅ DONE | `docs/guide/repeater.md` + this status table + CLAUDE.md update |

**Tests at completion:** 885 → 966 (+81). Build clean.

Estimated effort: **~3 days**. Steps 1-4 are mechanical. Step 5
(reactive interop) is the conceptual core. Steps 7-8 (drag a11y) are
the long pole; if scope creeps they split into a `repeater-field-dnd.md`
follow-up and v1 ships reorder-via-buttons (up/down arrows on each row).

**Prereqs:** all landed.
- Plan #5 reactive fields — Repeater inherits `live()` / `afterStateUpdated`.
- Plan #6 field types — every inner field type works inside Repeater
  rows because Repeater never inspects child field shape; it just
  delegates to `resolveSchema`.
- Plan #8 schema layouts — `Group / Section / Grid` work as inner
  containers; `columnSpan` etc. emit per-row.

**Companion memories:**
- `feedback_pilotiq_live_forms_pin_formid.md` — the demo page pins
  `formId` because the live re-resolve POST needs a stable form id.
- `feedback_vite_ssr_module_dup_instanceof.md` — Repeater's walker
  helpers MUST use `getType()` not `instanceof`.
- `feedback_per_row_server_eval_convention.md` — same `_visibleActions`
  / `_formatted` convention does NOT apply (rows are form fields, not
  table rows); but the same disposition — server resolves, client
  renders — does.

## Why we want it

Three concrete forms that fail today, one from each playground:

1. **Order line items.** A list of `{ product, quantity, unitPrice }`
   rows on a Purchase Order resource. Today: a `KeyValue` field with
   stringified JSON, which loses the per-item validation, conditional
   visibility ("show discount only if quantity > 5"), and per-item UI
   chrome. Repeater is the natural fit.
2. **FAQ block on a marketing page.** `{ question, answer, category }`
   list on a CMS page. Today: a separate FAQ resource with parent FK.
   Plan #11 relations make that workable but heavyweight for content
   that's never queried independently.
3. **Environment variables on a deployment.** `{ key, value, secret }`
   list. Today: `KeyValue` works for two columns but breaks the
   moment a third boolean per row is needed.

The pattern keeps recurring. Without Repeater we either:
- Push the user to model the relation as its own resource (heavy,
  surfaces in the sidebar even when it shouldn't).
- Leave them with `KeyValue` (only works for `{ string: string }`).
- Have them write a custom field renderer (defeats the purpose of a
  schema-driven admin).

## API

### Repeater builder

```ts
import { Repeater } from '@pilotiq/pilotiq'
import { TextField, ToggleField, NumberField } from '@pilotiq/pilotiq'

Repeater.make('lineItems')
  .label('Line items')
  .schema([
    TextField.make('product').required(),
    NumberField.make('quantity').default(1).required(),
    NumberField.make('unitPrice').prefix('$').required(),
    ToggleField.make('discounted'),
  ])
  .columns(2)                         // grid layout for inner schema
  .defaultItems(1)                    // initial empty rows on create
  .minItems(1)                        // validator: at least 1 row
  .maxItems(50)                       // validator: at most 50 rows
  .reorderable()                      // drag handle + ↑/↓ buttons
  .collapsible()                      // per-row chevron
  .collapsed()                        // default-collapsed
  .cloneable()                        // duplicate-row button
  .itemLabel(row => row.product || 'New item')
  .addActionLabel('Add line item')
```

### Repeater meta (JSON shape)

```ts
interface RepeaterFieldMeta extends FieldMeta {
  fieldType: 'repeater'
  /** Resolved children for each row, in submission order. */
  rows: Array<{
    id:       string                   // stable UUID; survives reorder
    children: ElementMeta[]            // resolved inner schema with values bound
  }>
  /** Resolved zero-row blueprint for the "Add" button to clone client-side. */
  template:        ElementMeta[]
  columns?:        number              // grid columns for inner schema
  minItems?:       number
  maxItems?:       number
  reorderable?:    boolean
  collapsible?:    boolean
  defaultCollapsed?: boolean
  cloneable?:      boolean
  addActionLabel?: string
  /**
   * itemLabel evaluated server-side when collapsed; client falls back
   * to the row index when missing. Eval'd once per row at meta-build.
   */
  itemLabels?:     string[]
}
```

`rows[i].children` is just resolved schema metadata — exactly what
`SchemaRenderer` already knows how to render. The client doesn't
special-case row content; it iterates `rows` and renders each one's
`children` array via the existing renderer.

### Server-side hooks (deferred)

```ts
// Out of scope for v1 — track for v1.1
.itemVisible((row, ctx) => row.published)   // hide entire rows by predicate
.itemCanDelete((row, ctx) => row.user_id === ctx.user.id)
```

These belong in their own micro-plan once we have a real-world request.

### Cross-field plumbing

Every inherited cross-field method works on the inner fields without
extra wiring (`prefix`, `suffix`, `helperText`, `default`, `dehydrated`,
`formatStateUsing`). They live on `Field`, and Repeater rows are just
fields — `resolveSchema` handles them.

`Field.live()` on an inner field re-resolves the **whole form** as
today (Plan #5 contract). The change-detection path stays:
`POST {…}/_form/:formId/state { changed: 'lineItems.0.quantity', values }`.
Server's `applyStateUpdate` finds the field by walking into Repeater
rows; runs that field's `afterStateUpdated`; returns the dirty values.

## Implementation notes

### Per-row resolve

```ts
// schema/resolveSchema.ts — Repeater branch (sketch)
async function resolveRepeater(field: RepeaterField, ctx: RenderContext) {
  const submitted = ctx.values?.[field.name] as unknown[] | undefined
  const rowsInput = submitted ?? Array(field._defaultItems).fill({})

  const rows = await Promise.all(rowsInput.map(async (rowValues, i) => {
    const rowCtx: RenderContext = {
      ...ctx,
      values: rowValues,
      // $get inside this row's afterStateUpdated reads the ROW values,
      // not the parent form's. Cross-row reads still go through the
      // top-level $get with `lineItems.<i>.<name>` keys.
      ...(ctx.values && { row: { index: i, $get: (n: string) => rowValues[n] } }),
    }
    const children = await resolveSchema(field._children, rowCtx)
    return { id: rowIdFor(field, i), children }
  }))

  // Template = zero-row resolution with empty values, used for "Add row"
  const template = await resolveSchema(field._children, { ...ctx, values: {} })

  return { rows, template, /* …other meta… */ }
}
```

`rowIdFor(field, i)` derives a stable id. On submit, the client posts
the existing `id` if present (we round-trip it through a hidden field
in the row meta), otherwise the server generates a fresh UUID for new
rows. The id is only used for client React keys + collapsed-state
localStorage scoping — never persisted to the record.

### Coercion

The form body for a Repeater can arrive in two shapes:

1. **Flat-key form-encoded** (HTML form fallback path):
   `lineItems.0.product=Widget&lineItems.0.quantity=2&lineItems.1.product=…`
2. **JSON** (the client's `fetch+JSON` path — the SPA default since
   `feedback_action_dispatch_fetch_vs_303.md`):
   `{ lineItems: [{ product, quantity, … }] }`

`dispatchForm.coerceFormValues` already handles flat scalar keys.
We extend the path that runs before per-field coercion: detect
Repeater fields, gather sibling keys with the `<name>.<i>.` prefix,
group by index, then recurse into per-row coercion using the inner
schema. Empty trailing rows get trimmed.

JSON-shaped bodies skip the gather step and go straight to per-row
recurse.

### Validation

`validateSchema` recurses into each row's child fields using
`<repeaterName>.<i>.<childName>` as the error key. The Repeater
itself contributes two validators when set: `minItems` and `maxItems`,
landing under the bare `<repeaterName>` key.

### Walkers

`findForms / findActions / findFields` (`schema/walk.ts` — promote it
out of `dispatchForm.ts` if it isn't already) gain a Repeater branch:

```ts
function walkChildren(el: Element): Element[] {
  if (el.getType() === 'repeater') return el._children ?? []
  return el._children ?? []
}
```

(There's nothing Repeater-specific structurally — `_children` is the
shape. The note here is that we should NOT use `instanceof RepeaterField`
because of the Vite SSR module-cache duplication trap.)

### Live re-resolve

The `applyStateUpdate` helper currently walks one level. We extend its
"find the changed field" pass to descend into Repeater rows when the
changed key includes a `.`. Path resolution is mechanical:

```ts
const segments = changed.split('.')
// e.g. ['lineItems', '2', 'quantity']
// → walk: form → repeater 'lineItems' → row 2 → field 'quantity'
```

The `afterStateUpdated` hook on the inner field gets a per-row
`$get` / `$set` so authoring stays clean: `$get('quantity')` reads
the current row, not the parent. Cross-row reads still go through the
top-level `$get('lineItems.0.quantity')`.

## Client renderer

```ts
// react/fields/RepeaterInput.tsx
function RepeaterInput({ meta, value, onChange }: Props) {
  const rows = value ?? meta.rows.map(r => /* extract values from r.children */)

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <RepeaterRow
          key={row.__id}
          index={i}
          children={meta.rows[i]?.children ?? meta.template}
          collapsible={meta.collapsible}
          defaultCollapsed={meta.defaultCollapsed}
          itemLabel={meta.itemLabels?.[i]}
          onMoveUp={…}
          onMoveDown={…}
          onClone={…}
          onRemove={…}
        />
      ))}
      <Button onClick={addRow} disabled={atMax}>
        {meta.addActionLabel ?? 'Add'}
      </Button>
    </div>
  )
}
```

`RepeaterRow` is a thin wrapper that:
- Renders the row's chrome (drag handle, collapse chevron, item label,
  clone / delete buttons).
- Delegates inner content to `<SchemaRenderer elements={children} />`.
- Persists collapsed state to localStorage keyed by the row's id.

The form-state context (Plan #5) needs to know about row-scoped names.
We extend `useFieldState(name)` to support nested paths
(`useFieldState('lineItems.0.quantity')`) — the provider already stores
the whole form values map; the path lookup is just `pathGet(values, name)`.

## Failure modes

| Scenario | UI response | Notes |
|---|---|---|
| Inner field validation fails | Inline per-row error keyed by `lineItems.0.product` | Standard validation path; no special UI |
| `minItems` violated | Form-level error under `lineItems` key | Renders as the Repeater's `helperText`-position message |
| User adds a row past `maxItems` | Add button disabled at limit | No 422 path; client gates first |
| User reorders rows mid-typing | New order lands in the values map; uncontrolled inputs survive via stable row id keys | Inner inputs are controlled when parent form is `live()`, uncontrolled otherwise |
| Repeater inside Repeater | Works recursively — `resolveSchema` is already recursive | `lineItems.0.modifiers.1.name` keys; coercion / validation still flat-keyed |
| `live()` on an inner field of a row that's about to be removed | Re-resolve completes, then row removal lands; transient in-flight state harmless | Same in-flight seq cancellation as Plan #5 |
| Submitted body has rows with the same `__id` | Server regenerates ids for duplicates | Edge case if a clone op races a save |
| Collapsed-state localStorage quota exceeded | Silent fallback to "all expanded" | Try/catch around localStorage in RepeaterRow |
| Drag from one Repeater into another | Not supported in v1 — drag bounded to the field | Cross-field drag is its own design conversation |

## Out of scope

- **`Builder`** — heterogeneous-row Repeater (each row picks from a
  set of block types). Different mental model: rows have a discriminator
  field that picks the inner schema. Builder is its own plan once
  Repeater proves out the shape.
- **Per-row visibility / authorization** (`itemVisible`,
  `itemCanDelete`) — track for v1.1 with a real use case.
- **Cross-field drag** between two Repeaters — niche; defer.
- **Inline-add patterns** (typeahead-creates-row) — TagsInput territory,
  not Repeater.
- **Server-driven row reorder** — reordering is purely client-side
  in v1; the new order lands on save.
- **Pagination of rows** (display only N at a time on the form) —
  defer; if a Repeater needs pagination it's probably a relation.
- **Row-level dirty tracking** — the form-level dirty bit is enough.
- **Partial-save individual rows** — Repeater submits with the rest
  of the form. If we ever want auto-save per row, that's a different
  feature surface.

## Test plan

| Area | Tests |
|---|---|
| `Repeater.make().schema(…)` builders | each builder method round-trips through meta; `defaultItems` default = 1 |
| `toMeta` zero rows | emits `rows: []` and a non-null `template`; `Add` button still renders |
| `toMeta` N rows | emits N entries; row ids stable across re-resolves with same submitted values |
| Inner schema resolves with row values | `$get('quantity')` inside `afterStateUpdated` returns the row's quantity, not parent's |
| Coercion — flat keys | `lineItems.0.product=Widget` → `{ lineItems: [{ product: 'Widget' }] }` |
| Coercion — JSON body | already-nested body round-trips |
| Coercion — empty trailing rows | dropped before validators run |
| Validation — inner `required` | error keyed `lineItems.0.product`; surfaces inline on the right row |
| Validation — `minItems` | bare `lineItems` key error when `rows.length < min` |
| Validation — `maxItems` | bare `lineItems` key error when `rows.length > max` |
| Live re-resolve — inner field | `POST .../_form/.../state { changed: 'lineItems.1.quantity', values }` finds the field and re-resolves |
| Live re-resolve — `afterStateUpdated` | row-scoped `$get` works; row-scoped `$set` mutates the right row |
| Visibility — `Section.visible` inside row | sees `ctx.values` scoped to row |
| Walkers — `findForms` recursing | returns inner forms (none in v1, but the recursion path runs) |
| Walkers — `findFields` recursing | flattens row children into the result; correct order |
| Reorder UI — drag | row order updates; ids preserved |
| Reorder UI — keyboard | ↑/↓ on handle moves row; focus stays on handle |
| Add row | new row gets a fresh UUID; row count respects `maxItems` |
| Remove row | gone from values; `minItems` blocks below threshold |
| Clone row | new row has a fresh UUID and the source row's values; respects `maxItems` |
| Collapsed state — persist | toggling chevron writes localStorage; reload restores |
| Collapsed state — defaultCollapsed | initial render starts collapsed; expanding writes localStorage `false` |
| Collapsed state — quota error | falls back gracefully (try/catch path covered) |
| Nested Repeater | one Repeater inside another resolves correctly; coercion handles `lineItems.0.modifiers.1.name` |
| `Field.dehydrated(false)` on inner field | dropped from the row payload before validators |
| `Field.formatStateUsing` on inner field | `formattedValue` populated per row |
| Multi-form pages with one Repeater | works; demo pins `formId` |
| Vite SSR module-cache duplication | `findFields` walker uses `getType()` — covered by import from a duplicated module path in test |

## Rollout

1. Steps 1-4 in one PR — the foundation, no UI yet (server-only,
   unit-tested via meta + coercion + validation).
2. Steps 5-6 in a follow-up PR — reactive + visibility interop.
3. Steps 7-9 in a third PR — client renderer + drag a11y +
   collapsed persistence.
4. Steps 10-12 close the plan: walkers, demo, docs.

Each PR is independently mergeable: server steps don't crash without
a renderer (they emit meta the renderer doesn't yet read), and the
renderer steps no-op without server-emitted Repeater meta.

## Open questions

- **Row identity persistence on reload.** v1: regenerate row ids on
  every server re-resolve when no submitted values exist. On submit,
  the client posts the current ids; the server preserves them. This
  is enough for collapsed-state continuity within a session. Persisting
  row ids across page reloads (so collapsed state survives a refresh)
  needs the ids to land on the saved record — track separately.
- **Sortable column on the saved record.** v1: row order is the array
  order; if the user wants explicit `position` they add a `NumberField`
  to the inner schema. Don't auto-inject.
- **Repeater inside a Wizard step.** Should work — Wizard's per-step
  validation already runs `validateSchema` over the active step's
  children. Add a test case to confirm.
