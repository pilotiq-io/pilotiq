---
name: Schema Layouts
description: Plan #8 — Wizard / Step, Fieldset, Split, Group, columnSpan/columnStart on Grid, Section description+icon+badge, layout visibility, dense/gap polish
type: plan
---

# Schema Layouts

Plan #8 from `admin-gap-audit.md`. Today's `schema/` folder ships
`Heading / Text / Alert / Divider / Card / Section / Tabs / Tab / Grid`
— enough for "stack of fields under a card" and not much else. Mature
admin frameworks expose Wizards (multi-step forms with per-step
validation), Fieldsets (grouped fields with a thin border + label),
Split layouts (two-column main/aside), positional control inside
Grids (`columnSpan / columnStart`), and a small pile of cosmetic
upgrades on Section (description, icon, badge, collapsible
disclosure, persisted state).

This plan adds those layout primitives and folds the cross-cutting
plumbing (visibility callbacks on layouts, `dense()` /
`gap(false)` polish, Section icons/badges) so layout authoring
catches up with field authoring after Plan #6.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. Layout-level visibility — `visible / hidden` on container Elements | ⏳ NOT STARTED | Today only `Field` and `Action` evaluate visibility in `resolveSchema`; layouts are unconditional |
| 2. `Group` — logical container, no chrome | ⏳ NOT STARTED | Tiny wrapper; mostly an export so users don't reach for `<></>` from app code |
| 3. `Fieldset` — labeled border container | ⏳ NOT STARTED | Static label + border + optional `columns(n)`; lighter than Section |
| 4. Section polish — `description / icon / badge / aside / compact / collapsed / persistCollapsed` | ⏳ NOT STARTED | `description` lands; `icon` reuses Plan #8.5 icon system; `aside` is a layout flag; `persistCollapsed` keys on Section title + page slug |
| 5. `columnSpan / columnStart / columnOrder` on every Element | ⏳ NOT STARTED | Mounted as `Element.columnSpan(n) / columnStart(n) / columnOrder(n)`; meta carries `_layout` bag the renderer maps to Tailwind `col-span-*` / `col-start-*` / `order-*` |
| 6. `Split` — horizontal flex layout | ⏳ NOT STARTED | Sugar over `Grid.columns(2)` with semantic intent; renders `flex flex-col @md:flex-row gap-N`; supports `from('right' \| 'left')` for aside placement |
| 7. `Wizard` + `Step` — multi-step form layout | ⏳ NOT STARTED | New file; per-step validation gate before advancing; reuses Plan #5 reactive plumbing for cross-step `$get` |
| 8. `Wizard` server endpoint — step-validate POST | ⏳ NOT STARTED | `POST {…}/_form/:formId/wizard` returns `{ ok, errors? }` for the current step's fields; client gates `next()` on it |
| 9. Renderer extraction — per-layout components in `react/layouts/schema/` | ⏳ NOT STARTED | Mirrors the `react/fields/` extraction from Plan #6; `SchemaRenderer`'s switch shrinks to a dispatcher |
| 10. Playground demo | ⏳ NOT STARTED | `playground-pilotiq/app/Pilotiq/pages/LayoutsDemo.ts` — Wizard with three steps + Split with aside + Fieldset inside Section + columnSpan inside Grid; pinned `formId('layouts-demo')` |

**Tests at start:** 698/698. Build clean.
**Target at completion:** ~750 (+50). Suite grows with one block per
new primitive plus the cross-cutting visibility + columnSpan tests.

Estimated effort: **~2 days** (matches the audit estimate). Steps 1-6
are mechanical once #1 lands. Step 7 (Wizard) is the long pole and
could split into `schema-layouts-wizard.md` if it grows past a day —
the rest of the plan is independently useful without it.

**Prereqs:**
- Plan #5 reactive-fields ✅ DONE — Wizard step branching reads cross-step
  values via `$get`. Layout-level `visible(({ $get }) => …)` reuses the
  same `ConditionContext` shape from Plan #5.
- Plan #6 field-types-expansion ✅ DONE — Fieldset and Section polish
  benefit from the per-fieldtype renderer extraction (we mirror it for
  layouts in step 9).
- Plan #8.5 icon-system ✅ DONE — Section/Fieldset `icon()` accepts the
  same string-or-Component shape as Resource/Page icons.

**Companion memories:**
- `feedback_pilotiq_live_forms_pin_formid.md` — Wizard demo must pin
  `formId('layouts-demo')` because the step-validate endpoint matches
  by formId, same constraint as the partial-resolve endpoint.
- `feedback_baseui_collision_avoidance.md` — Wizard's step-indicator
  popover (when steps overflow horizontally) needs the same
  `{ side: 'flip', align: 'none' }` treatment as Select/Popover.

## Why we want it

Three concrete forms today fail to express their actual layout with
the existing primitives:

1. **Settings pages with side-by-side fields.** Today every Section
   stacks vertically. Authors reach for `Grid.columns(2)` but lose
   the heading/description chrome that makes the page readable.
   `Split` keeps Section semantics + columnar layout.
2. **Onboarding / multi-step forms.** Article publish wizard, user
   onboarding, billing setup — every admin needs a 3-5 step Wizard
   eventually. Without it, authors split into multiple page routes
   with hand-rolled "Next" / "Back" navigation and per-route policy
   gates.
3. **Address fields nested inside an article form.** Today the only
   way to group "Shipping Address" together with a thin border is to
   use `Section` (which has a heavy heading + description treatment).
   `Fieldset` is the lighter alternative — single label, single
   border, no description.

Beyond the missing primitives, the cross-cutting plumbing closes
these gaps:

- `columnSpan(2)` so a single Textarea spans both columns of a
  `Grid.columns(2)` — currently impossible without breaking out of
  the Grid.
- `Section.collapsible()` + `persistCollapsed()` so users keep their
  expand/collapse state across page nav (today `defaultCollapsed`
  exists but the runtime resets on every render).
- Layout-level `visible(({ $get }) => $get('kind') === 'business')`
  to swap entire Sections in/out without authoring sibling fields
  with N copies of `hideWhen`.

These all live in `schema/` so every container inherits them.

## API

### Layout-level visibility — added to `Element`

```ts
class Element /* abstract */ {
  // …existing methods…

  /**
   * Show this element only when the predicate returns true. Receives
   * the same `ConditionContext` as Field.showWhen (Plan #5) — record,
   * values, $get, $set, user. Evaluated at every resolve cycle.
   */
  visible(rule: boolean | ((ctx: ConditionContext) => boolean | Promise<boolean>)): this

  /** Inverse of visible(). */
  hidden(rule: boolean | ((ctx: ConditionContext) => boolean | Promise<boolean>)): this

  /**
   * Positional control inside a parent Grid / Split. No-op outside
   * grid containers. `columnSpan(n)` makes the element occupy `n`
   * columns; `columnStart(n)` places it starting at column `n`;
   * `columnOrder(n)` sets CSS `order` for reordering on small
   * viewports.
   */
  columnSpan(n: number): this
  columnStart(n: number): this
  columnOrder(n: number): this
}
```

`ElementMeta` gains an optional `_layout?: { columnSpan?, columnStart?,
columnOrder? }` bag. Renderers map it onto `col-span-*` / `col-start-*` /
`order-*` Tailwind classes.

`resolveSchema` learns the same Field-style "drop hidden elements"
short-circuit it does today, just widened from `Field` to all
Elements with a visibility rule. Existing Field/Action paths are
unchanged because they still own their own visibility logic — we
only add the layout-element branch.

### `Group`

```ts
Group.make().schema([
  TextField.make('title'),
  TextField.make('subtitle'),
])
```

Renders as a `<div>` with no chrome. Useful for grouping for
visibility (`Group.make().visible(…).schema([...])`) without adding
a border, heading, or padding. `getType(): 'group'`. The renderer
just passes children through.

### `Fieldset`

```ts
Fieldset.make('Address')
  .schema([
    TextField.make('street'),
    TextField.make('city'),
    Grid.make().columns(2).schema([
      TextField.make('state'),
      TextField.make('zip'),
    ]),
  ])
```

Renders as `<fieldset><legend>Address</legend>…</fieldset>` with a
thin border + small horizontal padding. Lighter than Section — no
description, no collapsible state, no badge. Optional `.columns(n)`
shortcut equivalent to wrapping children in a Grid. `getType():
'fieldset'`.

### Section polish

```ts
Section.make('Publication')
  .description('When and where this article is visible.')
  .icon('calendar')
  .badge('Draft')
  .collapsible()
  .persistCollapsed()         // ← new — keys on (page slug, section title)
  .aside()                    // ← new — render as right-rail aside instead of stacked
  .compact()                  // ← new — tighter padding, smaller heading
```

`description` ships today; `icon / badge / aside / compact /
persistCollapsed` are new. `aside` flips the section to render as
a right-rail card when nested inside a `Split` parent (no-op
otherwise).

`persistCollapsed()` writes the open/closed state to
`localStorage` under a key built from page-slug + section-title +
field-list-hash so the key is stable across renders but distinct
across resources. Server-rendered initial state still respects
`defaultCollapsed()`; client-side hydration overrides from
localStorage if present.

### `columnSpan / columnStart / columnOrder`

```ts
Grid.make().columns(3).schema([
  TextField.make('title').columnSpan(2),       // first row: spans 2/3
  TextField.make('status'),                    // first row: 1/3
  TextareaField.make('body').columnSpan(3),    // second row: full width
])
```

Lives on `Element`, so any container or leaf can carry the hint.
Outside a Grid/Split, the meta is emitted but the renderer ignores it.

### `Split`

```ts
Split.make()
  .from('right')      // optional: aside is on the right (default)
  .schema([
    Section.make('Article').schema([
      TextField.make('title'),
      RichTextField.make('body'),
    ]),
    Section.make('Publication').aside().schema([
      DateField.make('publishedAt'),
      SelectField.make('status'),
    ]),
  ])
```

Two-column flex layout. Children are split based on which one carries
`.aside()`: that's the right-rail (or left, when `from('left')`).
Without `aside()` markers, the first child is main and the second is
aside. `getType(): 'split'`.

Renders as `flex flex-col @md:flex-row gap-6`. Aside child gets
`@md:w-80 shrink-0` (or similar shadcn-flavoured sidebar width).
Container query (`@container`) so nested Splits behave.

### `Wizard` + `Step`

```ts
Wizard.make()
  .steps([
    Step.make('Account')
      .icon('user')
      .description('Login details.')
      .schema([
        TextField.make('email').required(),
        TextField.make('password').required(),
      ]),

    Step.make('Profile')
      .icon('id-card')
      .schema([
        TextField.make('name').required(),
        TextField.make('bio'),
      ]),

    Step.make('Confirm')
      .icon('check')
      .schema([
        Text.make('Review the details above.'),
      ]),
  ])
  .skippable()                  // optional — allow jumping ahead
  .startOnStep(0)               // optional — skip to step n on initial render
```

Wraps a list of `Step` containers with per-step navigation chrome.
Each Step has its own children resolved when it's the active step;
inactive steps don't render their fields (avoids fields without
labels confusing screen readers, and avoids re-rendering hidden
RichTextField iframes).

`Wizard.persist(true)` (default) stores progress in form-state via
the Plan #5 channel — refreshing the page or navigating away and
back keeps the user on the same step.

Submit semantics: the Save action only fires on the *final* step.
Earlier steps render Next/Back buttons. Next runs the per-step
validation gate (see endpoint below) before advancing — only fields
inside the current step are validated; later-step fields ignore.

`getType(): 'wizard'` and `getType(): 'step'` for children.

### Method reference

| Surface | Signature | Default | Notes |
|---|---|---|---|
| `Element.visible(rule)` | `boolean \| (ctx) => bool \| Promise<bool>` | always visible | Same `ConditionContext` as Field; resolver drops hidden elements before recursing |
| `Element.hidden(rule)` | inverse | always visible | Sugar; `hidden(true)` = `visible(false)` |
| `Element.columnSpan(n)` | `number` | unset | Emitted under `_layout.columnSpan`; clamp to parent column count at render |
| `Element.columnStart(n)` | `number` | unset | Same shape |
| `Element.columnOrder(n)` | `number` | unset | Same shape |
| `Group.make()` | `() => Group` | — | Chrome-less container |
| `Fieldset.make(label)` | `(label: string) => Fieldset` | — | `.columns(n) / .schema(...)` |
| `Section.icon(name)` | `string \| Component` | unset | Reuses icon system (Plan #8.5) |
| `Section.badge(text)` | `string` | unset | Renders as right-aligned pill in header |
| `Section.aside()` | `() => this` | false | Layout flag for Split parent |
| `Section.compact()` | `() => this` | false | Tight padding variant |
| `Section.persistCollapsed(key?)` | `(key?: string) => this` | autocomputed | Auto-key combines page slug + title + field-name list |
| `Split.make()` | `() => Split` | — | `.from('left' \| 'right') / .schema(...)` |
| `Wizard.make()` | `() => Wizard` | — | `.steps(Step[]) / .skippable() / .startOnStep(n) / .persist(false)` |
| `Step.make(label)` | `(label: string) => Step` | — | `.icon() / .description() / .schema(...)` |

## Where the resolve happens

### 1. Initial render — minor delta

`resolveSchema` already walks every Element. We add a single new
branch at the top of `resolveOne`:

```ts
// Layout-level visibility (Plan #8). Field/Action paths still own their
// own gates above; this catches everything else with a rule.
if (!(el instanceof Field) && !(el instanceof Action) && hasVisibilityRule(el)) {
  const ctxRich = buildConditionContext(ctx)
  if (ctxRich) {
    const visible = await evaluateVisibility(el, ctxRich)
    if (!visible) return null
  }
}
```

Where `hasVisibilityRule(el)` reads a flag on the Element base, and
`evaluateVisibility(el, ctx)` resolves the function/boolean rule.
Same ergonomics as `Action.evaluate` — throwing → hidden, async
supported.

`columnSpan / columnStart / columnOrder` emit onto `meta._layout`
unconditionally. The renderer reads them; the resolver is otherwise
unchanged.

### 2. Wizard step-validate — new endpoint

```
POST {base}/{slug}/_form/{formId}/wizard          # resource forms
POST {base}/{pageSlug}/_form/{formId}/wizard      # custom-page forms
```

Body:

```json
{
  "step":     0,
  "values":   { "email": "x@y", "password": "" },
  "recordId": "42"
}
```

Response (200):

```json
{ "ok": true }
```

Response (422 — current step has invalid fields):

```json
{
  "ok": false,
  "errors": { "password": ["Required"] }
}
```

The handler reuses the same prelude as the form-state endpoint
(Plan #5):

```ts
const user = await pilotiq.resolveUser(req)
if (!await checkPolicy(() => R.canAccess(user))) return forbidden(...)
if (!await checkPolicy(() => R.canEdit(user, record))) return forbidden(...)

const ctx     = { mode, record, basePath: base, user, values }
const elements = await callPageSchema(PageClass, ctx)
const form     = selectForm(findForms(elements), formId)
const wizard   = findWizards(form.getChildren()).at(0)
const step     = wizard?.getSteps()[body.step]
if (!step) return res.status(404).json({ ok: false, error: 'Step not found' })

const stepFields = collectFields(step.getChildren())
const errors     = await validateFields(stepFields, body.values, ctx)
if (Object.keys(errors).length > 0) {
  return res.status(422).json({ ok: false, errors })
}
return res.json({ ok: true })
```

The endpoint validates only fields inside the requested step. The
final-step submit goes through the existing form-submit handler
unchanged — Wizard doesn't intercept submit, only Next-button
advancement.

`findWizards` and `collectFields` are small walkers added to
`elements/dispatchForm.ts` alongside the existing `findForms /
findActions / collectFieldDefaults`.

### 3. Reactive cross-step `$get`

A Wizard's children are all resolved on every cycle — even
inactive steps — so `$get('email')` in step 2's `Section.visible`
predicate sees step 0's value. We don't ship a per-step resolve
toggle: the cost is one async walk over all steps' fields, and the
`live()` machinery already gates roundtrips to actually-changed
fields. If profiling later shows resolve cost dominating, we can
add `Wizard.lazy()` that resolves only the active step + downstream
visibility-checks; not in v1.

Inactive-step *rendering* is gated client-side — the renderer hides
inactive Step `<div>`s but the meta is fully resolved. RichTextField
iframes inside hidden steps don't mount because the renderer
short-circuits on `step.active === false` (set by the active-step
tracker in `WizardState`).

## Backwards compatibility

Layout-level `visible / hidden` is purely additive — every existing
Element subclass starts with no rule, behavior unchanged.

`columnSpan / columnStart / columnOrder` emit onto a new
`_layout` meta key. Existing renderers ignore unknown keys. No
migration.

Section's new `icon / badge / aside / compact / persistCollapsed`
methods are additive. The existing `description / collapsible /
defaultCollapsed` keep their meanings.

Tabs already exists and Wizard doesn't replace it. The audit
deliberately kept them distinct: Tabs is for cosmetic tabbed
content (no validation gate); Wizard is for sequential workflows
with per-step validation. Authors pick by intent.

## What about validation across steps?

Plan #8 v1: each step validates only its own fields when advancing.
Final submit revalidates the full form (existing behavior). This
means a user could finish step 1, advance, edit step 2, and step 1
might no longer cross-validate against step 2 (e.g.
`password === confirmPassword` where `confirmPassword` is in step 2).

Two ways to handle this in v2 (not in scope here):

1. `Wizard.crossStepValidate(fn)` — a wizard-level validator run
   on every Next click against the full values map. Catches simple
   cases like cross-step matching.
2. Filament-style `Step.afterValidation(fn)` — hook fires when a
   step's validation passes, can throw to block advancement based on
   cross-step rules.

We default to "validate-this-step-only" because it's the 90% case
(Wizards usually don't have cross-step constraints) and because the
final form-submit path already revalidates everything end-to-end.

## Failure modes

| Scenario | UI response | Notes |
|---|---|---|
| `Wizard.steps([])` | Renderer shows empty state "No steps configured" | Don't 500; treat like an empty Tabs |
| `Step` with all-hidden fields | Renders the step with just chrome (label/description); Next still works | Authors can use this intentionally for "review" steps |
| `Section.persistCollapsed` on first paint | Initial server-rendered state respects `defaultCollapsed`; client hydration overrides from localStorage | No flicker because the override happens in `useEffect` after mount; if needed, gate with `data-hydrated` to defer reveal |
| `Element.visible(fn)` throws | Treat as visible: false, log warning | Same posture as `Action.evaluate` — fail-closed for visibility |
| `Wizard` step-validate 422 | Inline errors stamped into form state; user fixes and clicks Next again | Reuses 422 path from form-submit |
| `Wizard.skippable()` + click step indicator past current | Validate-and-advance through every intermediate step; if any fails, stop on the failing step | Keeps Wizard semantics intact even when "skipping ahead" |
| `Split.from('left')` with two non-aside children | Renderer treats first child as aside, second as main | Documented; `aside()` markers take precedence |
| `columnSpan(99)` outside a Grid | Meta emits, renderer ignores | No-op silently |
| `columnSpan(99)` inside `Grid.columns(2)` | Renderer clamps to 2 (the parent column count) | Tailwind generates `col-span-{1..N}` only up to N |

## Out of scope

- **Per-step `afterStateUpdated`** — Wizard step transitions don't
  fire field-level reactive hooks. Step-validate only runs validators
  for now; reactive hooks fire on field change as today.
- **Wizard step-level routing (`/admin/articles/create/step/1`)** —
  v1 keeps the Wizard fully client-side; the URL doesn't reflect
  step number. Authors who need shareable per-step URLs can build
  it on top with custom routes; this is a roadmap item if demand
  surfaces.
- **`dense()` / `gap(false)` polish** — covered as part of the
  per-component method additions but the audit also called out a
  panel-level density toggle; that's a Theme concern, not a layout
  primitive, and lands in a polish PR after Plan #6's theme audit.
- **Container queries (`@md` breakpoints)** — Split uses `@container`
  out of the box, but exposing breakpoint-specific
  `Element.columnSpanAt('md', 2)` is overkill for v1. Authors needing
  responsive layouts use Tailwind's built-in `@md:col-span-*` via
  `extraClasses()` on a per-element basis (existing escape hatch).
- **Drag-to-reorder Wizard steps** — admin-edit time only, not a
  runtime feature.
- **Collapse-all / expand-all keyboard shortcuts** — Section
  collapsible chrome, not Wizard. Polish PR.
- **Step-level authorization** — `Step.canAccess(user)` guard.
  Plan #10 deferred field-level auth; Wizard inherits the same
  decision.
- **Conditional Wizards** — i.e. step 3 only appears if step 1 had
  some answer. Today's `Step.visible(({ $get }) => …)` works because
  Steps are Elements, but the next/prev navigation chrome doesn't
  collapse over hidden steps in v1. Document the limitation.

## Test plan

| Area | Tests |
|---|---|
| `Element.visible / hidden` | rule stored; resolver drops hidden layouts; throwing rule → hidden + warn; async rule supported |
| `Element.columnSpan / columnStart / columnOrder` | emitted under `_layout`; missing → key omitted; renderer maps to Tailwind |
| `Group` | renders children only; visibility works through it |
| `Fieldset` | label + border meta; `.columns(n)` nests an implicit Grid; children resolve |
| `Section` polish | `icon / badge / aside / compact / persistCollapsed` round-trip through meta; `persistCollapsed` auto-key stable across renders |
| `Split` | meta carries `type:'split'` + `from`; aside/main split correct based on `.aside()` markers; falls back to first/second when no markers |
| `Wizard` shape | `Step` children; default starts on step 0; `startOnStep(n)` honored; `persist(false)` skips state writes |
| `Wizard` step-validate endpoint | 200 on valid; 422 with per-field errors on invalid; 404 on unknown step; policy prelude wired (canAccess + canEdit) |
| `Wizard` cross-step `$get` | step 2's `Section.visible(({ $get }) => $get('emailFromStep0'))` works |
| `Wizard.skippable` | clicking step 3 from step 0 validates 0 → 1 → 2 in order; stops at the first failing step |
| Backcompat | every existing Section/Card/Grid/Tabs test passes; existing field tests unaffected |

Target: ~50 new tests, bringing the suite to ~750. (We're at 698
from Plan #6.)

## Rollout

1. `Element.visible / hidden / columnSpan / columnStart / columnOrder`
   on the base. Update `resolveSchema` to drop hidden non-Field/non-Action
   layouts. Tests for visibility + `_layout` meta. (~10 tests; existing
   suite stays green.)
2. Ship `Group` + `Fieldset`. Both are tiny — Group is `getType:
   'group'` + pass-through; Fieldset is Section minus collapsibility +
   description, plus `<fieldset><legend>` semantics.
3. Section polish — `description (existing) + icon + badge + aside +
   compact + persistCollapsed`. Update meta + renderer. Add
   `persistCollapsed` localStorage hook in
   `react/layouts/schema/SectionShell.tsx`.
4. Ship `Split`. Renders `flex flex-col @md:flex-row gap-6` with
   container query. `from('left' | 'right')` + `.aside()` marker on
   children determines layout.
5. Renderer extraction — move every layout case from
   `SchemaRenderer.tsx`'s switch into `react/layouts/schema/` files.
   Mirrors the Plan #6 field-renderer extraction.
   `<LayoutShell>` wraps every layout to apply `_layout` classes
   uniformly.
6. Ship `Wizard` + `Step` (client-side only — no server validation
   yet). Step navigation, persistence via form-state, active-step
   tracking. Inactive steps' children resolve but render hidden so
   `$get` works cross-step.
7. Wizard server endpoint —
   `POST {…}/_form/:formId/wizard`. Reuse `selectForm` and
   `validateFields` helpers. Same policy prelude as form-state.
   Wire client Next button to fetch + 422 handler.
8. Playground demo — `LayoutsDemo.ts` exercising every primitive at
   `/new-admin/layouts-demo`. Pin `formId('layouts-demo')`.
9. Update `CLAUDE.md` schema-list line + memory notes.

Steps 1-5 are pure layout primitives — they ship as one PR and are
independently useful (no Wizard required). Step 6-7 ship as a second
PR (Wizard alone). Step 8-9 fold into whichever PR lands last.

**Single-PR-vs-split decision.** Unlike Plan #6 (where every type was
small and bundling made sense), Wizard has its own server endpoint
and meaningfully more client logic. Split into two PRs:

- **PR A — schema-layouts-primitives**: visibility, columnSpan,
  Group, Fieldset, Section polish, Split, renderer extraction. Lands
  the layout cleanup without the Wizard tax.
- **PR B — schema-layouts-wizard**: Wizard + Step + step-validate
  endpoint + demo. Builds on PR A.

If PR B slips, PR A stands alone and Wizard ships as a focused
follow-up.
