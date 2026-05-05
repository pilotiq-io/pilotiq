---
name: Builder Field
description: Plan #14 follow-up — heterogeneous-row Repeater (Builder) with named Block schemas
type: plan
---

# Builder Field

Plan #14 follow-up. The last open piece of the Repeater work: a
heterogeneous-row variant where each row picks one of N **block types**,
and each block type carries its own inner schema. Storage on the parent
record is `[{ type: 'hero', data: { …block fields } }, …]`.

This is the field type behind every "page builder", "block-based content"
or "section composer" admin UI — landing pages, newsletters, CMS pages,
question banks. Repeater alone can't do it because all rows share one
schema.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. `Block` class — block-type definition | ⏳ TODO | `Block.make(name).label().icon().columns().schema().maxItems().visible()/.hidden()` |
| 2. `BuilderField` skeleton — class, `fieldType:'builder'`, builders | ⏳ TODO | Subclass `Field`; `blocks([Block…])` + `blockPickerColumns / blockNumbers / blockIcons / addable / deletable / addActionAlignment` + Repeater-shared `reorderable / collapsible / cloneable / min/maxItems / itemHidden / itemLabel / addActionLabel` |
| 3. `toMeta()` — resolve per-row by block.type | ⏳ TODO | `resolveBuilderRows` in `resolveSchema.ts`; row-scoped `RenderContext` with `row.index / row.blockType / $get / $set`; `meta.rows: { id, type, children }[]` + `meta.blocks: BlockMeta[]` for the picker; per-block `template` lazy-resolved |
| 4. Coercion — recurse into `name.<i>.data.<child>` keys | ⏳ TODO | `walkBuildersTopLevel` runs alongside `walkRepeatersTopLevel`; row-shape is `{ __id, type, data: {…} }`; flat-key fold splits top-level (`__id`, `type`) from `data.*` keys; trim-trailing-empty mirrors Repeater (now keyed on `data` body) |
| 5. Validation — keyed `name.<i>.data.<child>` | ⏳ TODO | `validateBuilder` in `runValidators.ts`; per-row recursion against the row's resolved block schema; row missing `type` or `type` not in registry → row-level error under `name.<i>` |
| 6. Reactive interop — partial-resolve over rows | ⏳ TODO | `applyBuilderStateUpdate`; dotted path `name.<i>.data.<leaf>` resolves into the right block schema via the row's `type`; row-scoped `$get / $set` (data-scoped) + `ctx.row.blockType` |
| 7. Walker boundaries | ⏳ TODO | `findForms / findActions / findTables / findFieldByName / coerce walkFields / validate walk` all stop at Builder via structural `isBuilderField` (Vite-SSR-dup safe) |
| 8. Client renderer — `BuilderInput` | ⏳ TODO | `react/fields/BuilderInput.tsx`; per-row name-prefixing (`name.<i>.type` + `name.<i>.data.<child>`); block-picker dropdown (`Add` button menu w/ icons + columns); reuses `reorderRows` helper; collapsed-state per-row + per-form persistence; inner-field live re-resolve roundtrip via container-level delegate |
| 9. Filament-parity ergonomics (also retrofitted onto Repeater) | ⏳ TODO | `addable / deletable / addActionAlignment / itemNumbers / reorderableWithButtons` (the trivial-gate ones). Bigger-surface ones (`extraItemActions`, `relationship`, `grid`, `simple`, `table`, `accordion`, `distinct`) tracked in `repeater-polish.md` for a follow-up pass. |
| 10. Tests | ⏳ TODO | `BuilderField.test.ts` + `Block.test.ts` + walker-stop tests + coerce JSON/flat + validate per-block + live re-resolve dotted + per-block `maxItems` enforcement |
| 11. Playground demo | ⏳ TODO | `playground-pilotiq/app/Pilotiq/pages/BuilderDemo.ts` at `/new-admin/builder-demo`; 4–5 block types (Heading, Paragraph, Image, Quote, Embed) |
| 12. Docs | ⏳ TODO | `docs/guide/builder.md` user guide + repeater-field.md status update + CLAUDE.md + memory + admin-gap-audit tick |

## Design

### Storage shape

Per row: `{ __id, type, data: { …block-specific fields } }`.

```ts
post.content = [
  { __id: 'a1', type: 'heading',   data: { text: 'Welcome' } },
  { __id: 'a2', type: 'paragraph', data: { body: '…' } },
  { __id: 'a3', type: 'image',     data: { url: '…', alt: '…' } },
]
```

`{ type, data }` mirrors Filament. Three reasons over a flat
`{ _block, …fields }` shape:

1. **No collision with reserved keys** — `__id` / `type` always live at
   the top of the row; block fields can use any name including `id` / `__id`.
2. **JSON serialization round-trips cleanly** — Prisma `Json` columns
   accept the wrapper without flat-key acrobatics.
3. **Block authors don't have to think about reserved names** — the
   `data` envelope is its own namespace.

### Wire format (flat / urlencoded)

```
content.0.__id=a1
content.0.type=heading
content.0.data.text=Welcome
content.1.__id=a2
content.1.type=paragraph
content.1.data.body=…
```

The fold recognizes `__id` and `type` as top-level row fields; everything
under `data.*` goes inside `row.data`. The trailing-empty trim runs
against `row.data` (a row with `type` + `__id` but empty `data` is still
"untouched" if the user hasn't typed anything yet).

### `Block` class

```ts
import { Block } from '@pilotiq/pilotiq'

const Heading = Block.make('heading')
  .label('Heading')                     // optional, defaults to titlecased name
  .icon('heading')                      // string registry key OR component
  .schema([
    TextField.make('text').required(),
    SelectField.make('level').options({ h1: 'H1', h2: 'H2', h3: 'H3' }),
  ])
  .columns(2)                           // grid columns for this block's schema
  .maxItems(1)                          // optional ceiling on row count for this type (e.g. one Hero)
```

`Block` does **not** extend `Element` — it's a schema-author primitive,
not a layout element. Mirroring `Tab`, `Step`, and `ListTab`. Its
`.toMeta()` emits `{ name, label, icon, columns?, maxItems? }` for the
picker UI, with `children` resolved on-demand per row by
`resolveBuilderRows`.

### `BuilderField`

```ts
ContentField = Builder.make('content')
  .blocks([Heading, Paragraph, Image, Quote, Embed])
  .blockPickerColumns(2)                // picker dropdown grid layout
  .blockIcons(true)                     // show icons in row header
  .blockNumbers(true)                   // show 1/2/3 numbering in row header
  .reorderable()
  .collapsible()
  .cloneable()
  .columns(1)                           // not used; per-block columns wins
  .minItems(1).maxItems(20)
  .addActionLabel('Add block')
  .addActionAlignment('center')         // 'start' | 'center' | 'end'
```

Inherits Repeater's `.live()` / `afterStateUpdated` / row-scoped `$get`
behavior, just keyed on the row's block schema.

### Per-block `maxItems`

`Block.maxItems(n)` caps how many of *that* block can appear on a single
form. Enforced both server-side (validator) and client-side (block
picker greys out the option once the cap is hit). Useful for "exactly
one Hero" or "at most three callouts".

### Reuse vs. RepeaterField

Builder is a **sibling** of Repeater, not a subclass. Reasons:

- `RepeaterField.getInnerSchema()` returns one `Element[]` — Builder's
  inner schema is per-row, picked by `block.type`. Subclassing would
  require overriding every read site.
- The walker stop-at sites (`coerceFormValues`, `findForms`,
  `findActions`, `findFieldByName`, `applyStateUpdate`,
  `validateSchema`) currently `instanceof RepeaterField`. Adding a
  sibling `instanceof BuilderField` check at each site is mechanical
  and keeps each field's pass independently readable. We DON'T extract
  a shared `walkArrayRows` primitive in this pass — Builder ships, then
  if the duplication starts paying off in a third array-row consumer
  (Repeater + Builder + ???), we extract.

### Step 9 — Filament-parity ergonomics

The Repeater audit against Filament surfaced a handful of trivial gaps
that any array-row field wants. We retrofit them onto `RepeaterField`
in this pass (so `BuilderField` can inherit them via shared cosmetic
plumbing in the renderer):

| Method | Behavior |
|---|---|
| `.addable(bool\|fn)` | Hides the "Add row" button. `maxItems` is the validator; this is a separate UX gate. |
| `.deletable(bool\|fn)` | Hides per-row delete button. `minItems` is the validator gate. |
| `.addActionAlignment('start' \| 'center' \| 'end')` | Position of the Add button in the field footer. Default `start`. |
| `.itemNumbers(bool=true)` | Prefixes the per-row label with its 1-based index. |
| `.reorderableWithButtons(bool=true)` | Forces button-only reorder (default is drag-with-button-fallback). |

The bigger-surface gaps (`grid`, `simple`, `table`,
`accordion`, `disableOptionsWhenSelectedInSiblingRepeaterItems`)
are tracked separately and out of scope for this plan.
**`extraItemActions` shipped 2026-05-04 cont'd** — see
`docs/guide/repeater.md` and `project_pilotiq_extra_item_actions.md`.
**`distinct()` shipped 2026-05-04 cont'd** — see `docs/guide/repeater.md`
("Cross-row uniqueness").
**`relationship()` shipped 2026-05-05 cont'd** — heterogeneous-row
sibling of `Repeater.relationship`; rows persist as child records
carrying a `type` discriminator + JSON `data` payload (column names
configurable). hasMany only in v1. See `builder-relationship.md` and
`docs/guide/builder.md` ("Relationship-backed rows").

## Out of scope

- **Block previews** (Filament's `Block::preview('view.path')`) — read-only
  card render of a block's resolved data. Defer until at least one
  consumer wants it; the React equivalent (a per-block render component)
  is a separate API surface.
- **`addBetweenAction`** — Filament's "insert row between rows" affordance.
  Out of scope; users `Add` then drag.
- **Block-level conditional visibility** (e.g. only show Hero block in
  the picker for admins). Out of scope; the user's own
  `Builder.make().blocks(user.isAdmin ? […incl. Hero] : […])` covers it.
- **Per-block authorization** (`canAdd / canDelete / canEdit`). Out of
  scope; admin-trusted authors today.
- **Pivot / belongsToMany / relation-stored Builder rows.** Builder
  always stores into a JSON column on the parent record (or arbitrary
  user-handled storage via form lifecycle hooks). Relation-stored
  Repeater is RelationManager territory; same call here.

## Test plan

| Area | Tests |
|---|---|
| `Block.make().label().icon().schema().columns().maxItems()` | each builder method round-trips through meta |
| `Builder.make().blocks([…])` builders | `blockPickerColumns / blockIcons / blockNumbers / addable / deletable / addActionAlignment / itemNumbers / reorderableWithButtons` round-trip |
| `toMeta` zero rows | emits `rows: []`, `blocks: BlockMeta[]` populated |
| `toMeta` N rows | each row has `type` + resolved `children` from the matching block's schema |
| `toMeta` row with unknown `type` | `_unknownType: true` flag + bare children = `[]`; surfaces a warning, never throws |
| Coercion — JSON shape | `[{ type, data: {…} }]` round-trips with inner field types coerced |
| Coercion — flat keys | `content.0.type=hero&content.0.data.heading=…` → `[{ type: 'hero', data: { heading: '…' } }]` |
| Coercion — empty trailing rows | dropped before validators run |
| Validation — inner `required` | error keyed `content.0.data.heading` |
| Validation — `minItems` / `maxItems` | bare `content` key error |
| Validation — `Block.maxItems` | bare `content` key error when too many of a single type |
| Validation — unknown `type` | row-level error keyed `content.<i>` |
| Live re-resolve — inner field | `POST .../_form/.../state { changed: 'content.1.data.text', values }` resolves into the right block schema |
| Live re-resolve — `afterStateUpdated` | row-scoped `$get` / `$set` work; `ctx.row.blockType` exposed |
| Walkers stop | `findForms / findActions / findTables / findFieldByName` don't dive into Builder rows |
| Client renderer — picker | clicking Add opens a dropdown of blocks; choosing one creates a row of that type |
| Client renderer — reorder | row order updates; ids preserved |
| Client renderer — clone | new row has fresh UUID + same type + cloned data |
| Client renderer — collapse | per-row + per-form localStorage persistence |
| Client renderer — block.maxItems | already-hit blocks greyed out in picker; client also gates the cap |
| Demo wiring | `/new-admin/builder-demo` exercises 4–5 block types incl. nested Builder-in-Repeater (or vice versa) |
