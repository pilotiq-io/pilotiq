# SelectField.multiple() + .relationship() — multi-select with M2M sync

**Status:** in progress (2026-06-05)

## Problem

Pilotiq has no "pick many from a list" field. `SelectField` is single-value;
`CheckboxListField` renders a flat checkbox stack (unusable past ~15 options);
`TagsInputField` is free-text (values aren't constrained to options). The
canonical CMS shapes — post authors, post categories, related posts — all need
a searchable multi-select whose value is a `string[]` of related-record ids,
persisted through a belongsToMany pivot.

Filament equivalent: `Select::make('categories')->multiple()->relationship(...)`.

## Surface

```ts
SelectField.make('categories')
  .label('Categories')
  .multiple()                          // string[] value, chips + searchable dropdown
  .options(async () => {               // options stay user-supplied (v1)
    const rows = await Category.query().paginate(1, 200)
    return rows.data.map(c => ({ value: c.id, label: c.name }))
  })
  .relationship('categories')          // M2M-backed: fill from + sync to the pivot
```

- `.multiple(v = true)` — flips the field to array mode. Wire format mirrors
  `TagsInput`: the client serializes the selected ids as a JSON-encoded array
  in a single hidden input; `coerceFormValues` parses back to `string[]`.
- `.relationship(name | { name })` — opts the field's value out of the parent
  record's columns and into the named relation:
  - **Fill (edit):** read current ids via `resolveRelatedQuery(parent, name)`,
    stamp `values[name] = ids`.
  - **Persist (create + edit):** extract the ids out of `data` before the
    parent save (the parent has no such column), then after `persist()`
    returns, `resolveM2MAccessor(record, name).sync(ids)`.
  - v1 requires `.multiple()` — a single-value `.relationship()` (belongsTo
    sugar) is deferred; throw a config error at meta-build.

## Wire shape

`FieldMeta` gains sparse `multiple: true`. `relationship` stays server-only
(the renderer doesn't need it — values arrive filled like any other field).

## Touch points

1. **`src/fields/SelectField.ts`** — `_multiple` / `_relationship` + setters,
   accessors `isMultiple()` / `getRelationship()`, `toMeta` emits sparse
   `multiple`. Meta-build throws on `relationship()` without `multiple()`,
   and on `createOptionForm()` + `multiple()` (inline-create deferred for
   multi mode).
2. **`src/elements/dispatchForm.ts`**
   - `coerceFormValues`: `case 'select'` branch — when `isMultiSelectField(f)`,
     parse JSON-array string → `string[]` (same normalization as `tagsInput`).
     Structural check (`fieldType === 'select' && f.isMultiple?.()`), not
     `instanceof` (Vite SSR module-dup).
   - `extractRelationshipSelects(children, data)` — walk top-level fields
     (recurse through layout containers, stop at Repeater/Builder), pull
     relationship-backed multi-select values out of `data`, return deferrals.
   - After `persist()`: for each deferral, `resolveM2MAccessor(record, name)`,
     throw a clear config error when no `sync` is exposed, else
     `await accessor.sync(ids)`. Runs alongside the Repeater/Builder
     relationship persists, BEFORE `afterCreate/afterUpdate` hooks. Does not
     need `ctx.parentModel` — the accessor hangs off the saved record.
3. **`src/validation/rules.ts`** — `isEmpty` widened: `[]` (real array) and
   `'[]'` (JSON-encoded empty array, the multi-select/tags wire shape) count
   as empty. Makes `required()` fail on an empty multi-select; also fixes
   `required()` on an empty `TagsInput` (previously passed on `'[]'`).
4. **`src/pageData/helpers.ts`** — `applyRelationshipSelectFill(form, values,
   record, parentModel)`: for each relationship-backed multi-select, load ids
   via `resolveRelatedQuery` + `paginate(1, 1000)`, map PKs to strings. Failed
   lookups fall back to existing values (mirror Repeater fill posture).
   `findRelationshipSelects` walker exported alongside.
5. **`src/pageData/resourcePages.ts`** — call the new fill in
   `resourceEditData` next to `applyRelationshipRepeaterFill`.
6. **`src/react/schemaRenderer/form/renderField.tsx`** — `case 'select'`
   dispatches to `MultiSelectFieldInput` when `meta.multiple`.
7. **`src/react/fields/MultiSelectFieldInput.tsx`** (new) — trigger styled
   like `SelectTrigger` showing selected-option chips (per-chip ×), opening a
   Popover with a filter input + checkbox option list (crib
   `FilterMultiSelect`). Hidden input carries the JSON-encoded id array.
   `useFieldState` integration + `triggerLive` on change (controlled +
   uncontrolled paths), mirroring `SelectFieldInput`.

## v1 limitations (documented in the guide)

- `relationship()` requires `multiple()` — single-value belongsTo sugar later.
- No `createOptionForm` in multi mode.
- No pivot ordering (`orderByPivot` gap, same as Repeater.relationship M2M).
- Options list is user-supplied — no auto-derive from the relation +
  `recordTitleAttribute` yet.
- `sync()` only — no `syncWithoutDetaching` mode.

## Tests

- SelectField meta: `multiple` sparse flag; relationship-without-multiple and
  createOption+multiple config errors.
- Coerce: JSON string → `string[]`; array passthrough; empty/garbage → `[]`;
  single-select untouched.
- `required()` fails on `[]` / `'[]'`.
- dispatchFormSubmit: relationship select stripped from parent payload;
  `sync` called with submitted ids on create + edit; clear error when the
  accessor is missing.
- Fill: edit-page values stamped from related rows' PKs.

## Consumer

`playground` PostResource: `authors` (post_author → User), `categories`
(category_post → Category), `relatedPosts` (post_related → Post, explicit
`foreignPivotKey: 'postId'` / `relatedPivotKey: 'relatedId'`).
