---
name: Reactive Fields
description: Plan #5 — `live()` + `$get / $set` + `afterStateUpdated` + dependent options + reactive visibility
type: plan
---

# Reactive Fields

Plan #5 from `admin-gap-audit.md`. Promotes form schemas from
"resolved once on GET, frozen until submit" to "field changes can
re-resolve the schema mid-edit." This is the foundation Filament uses
for dependent dropdowns, conditional sections, computed defaults, and
multi-step Wizard branching.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. Widen `RenderContext` | ✅ DONE | `values / $get / $set / changed`; `Field.isHiddenIn / isDisabledIn / toMeta` take ctx |
| 2. `Field.live()` + `afterStateUpdated()` | ✅ DONE | `LiveOptions { onBlur?, debounce? }`; emitted on `FieldMeta.live` |
| 3. `SelectField.options(fn)` | ✅ DONE | `OptionsResolver` async; `toMeta` async-aware (Element + resolveSchema + resolveField) |
| 4. Widen condition signatures | ✅ DONE | `FieldCondition = (ctx: ConditionContext) => bool`; existing code destructures `record` |
| 5. `applyStateUpdate` helper | ✅ DONE | `dispatchForm.ts`; runs the changed field's `afterStateUpdated` with bound `$get / $set` |
| 6. `formStateData` builder | ✅ DONE | `pageData.ts`; `tagFormStateUrls` stamps `Form.stateUrl` when descendant has `live()` |
| 7. POST `_form/:formId/state` endpoints | ✅ DONE | Four — resource-create / resource-edit / global-edit / custom-page; all run policy prelude |
| 8. `Form.toMeta()` emits `stateUrl` | ✅ DONE | `withStateUrl()` setter; meta omits when unset |
| 9. `FormStateContext` + `useFieldState` | ✅ DONE | `react/FormStateContext.tsx`; provider + hook; `useFormState` for advanced consumers; exported from `@pilotiq/pilotiq/react` |
| 10. Field renderers use `useFieldState` | ✅ DONE | `TextLikeInput` bridge for text/email/number/textarea/slug; controlled paths added to `Toggle`/`Select`/`Date` field inputs; all fall back to `defaultValue` when outside provider |
| 11. Live triggers per-field | ✅ DONE | `onChange` (immediate or debounced via `setTimeout`) / `onBlur` POST to `stateUrl`; `requestSeqRef` + `latestSeenRef` (refs, not state — see `feedback_strict_mode_double_flash.md`) drop stale responses; per-name pending tracking |
| 12. Playground demo | ✅ DONE | `playground-pilotiq/app/Pilotiq/pages/ReactiveDemo.ts` — title → auto-slug (debounced live), country → state dependent SelectField, conditional shipping fields gated by ToggleField. Pinned `formId('reactive-demo')` because the auto-incrementing form-id counter doesn't survive cross-request renders. |

**Tests at client-side checkpoint:** 593/593 (was 584 server-only). +9 covering `collectFieldDefaults` and `findFieldMeta` helpers. The provider itself is exercised end-to-end via the playground (live curl below); React-DOM tests would need jsdom which isn't yet wired into the test harness.

**Server can be exercised via curl** (route handler unchanged, but the demo is the easiest target):
```bash
curl -X POST http://localhost:3003/new-admin/reactive-demo/_form/reactive-demo/state \
  -H 'Content-Type: application/json' \
  -d '{"changed":"country","values":{"country":"US","state":"","title":"","slug":"","hasShipping":false}}'
# → { ok, form: { ..., children: [..., state field with US options, ...] }, dirty: ['country'] }
```

**Browser flow** (Plan #5 client wiring):
1. GET render → `Form.toMeta()` includes `stateUrl` because the form has live fields.
2. `FormRenderer` sees `stateUrl` and wraps children in `FormStateProvider`.
3. Each field renderer calls `useFieldState(name)` — controlled mode binds `value`/`onChange`/`onBlur` to the provider's values map.
4. On change/blur of a `live()` field, the provider POSTs `{ changed, values }` to `stateUrl`. Out-of-order responses are dropped via the in-flight-id counter.
5. The response replaces `formMeta` wholesale; React reconciles the children and the values map gets overlaid with any `$set` mutations.
6. Forms with NO live fields get `stateUrl: undefined`, the provider isn't mounted, and inputs stay uncontrolled — zero perf cost for the legacy path.

Estimated effort: ~3 days. Touches `Field.ts` (new flag + setter +
widened condition signature), `SelectField.ts` (options-as-function),
`Form.ts` (state-resolve endpoint URL setter), `routes.ts` (new
endpoint), `pageData.ts` (a `formStateData` builder), `dispatchForm.ts`
(an `applyStateUpdate()` helper), and the client `FormRenderer` (now
keeps a values map and round-trips on `live` changes). No new package
deps; no schema changes.

**Prereq:** Plan #1 (actions-tier-1 — explicit slots) ✅ DONE,
Plan #10 (authorization) ✅ DONE — the route handler we add reuses the
same `pilotiq.resolveUser(req) → checkPolicy(R.canEdit / canCreate)`
prelude as the form-submit handler so the partial-resolve endpoint
gets the same access semantics for free.

**Companion memory:** `feedback_uncontrolled_input_spa_remount.md` —
today's `FormRenderer` is keyed on `formId` and uses `defaultValue`;
this plan moves to controlled inputs scoped to a Form context. Don't
remove the formId key — it still earns its keep on cross-record
SPA-nav.

## Why we want it

Today, every form value behaves like an island. Set the "Country"
dropdown → the "State" dropdown still shows the original (wrong) list
of states. Toggle "Has shipping address" → the address fields stay
hidden because `hideWhen(record => …)` was evaluated once against the
record at GET time. The user has to save, reload, and edit again to
see the dependent state change.

This is the single most-asked Filament feature missing from pilotiq,
and it gates several downstream plans:

- **Wizard / Steps (Plan #8)** — step branching needs to re-evaluate
  on field change ("if applicantType === 'business' show step 3").
- **Conditional schema (already partial)** — we have `hideWhen` /
  `showWhen` accepting `record`, but they don't re-fire when the user
  edits a field.
- **Dependent SelectFields** — country → state, brand → model,
  organization → users.
- **Computed defaults** — `slug` populated from `title`,
  `total = price * quantity`.

The Filament shape (`live()`, `afterStateUpdated`, `$get / $set`,
`options(fn)`) is a small surface that solves all four cases with one
mechanism: server-side resolution + opportunistic round-trips on
declared "live" fields. We're not chasing optimistic client-side
reactivity (that's `afterStateUpdatedJs` in Tier 2 — out of scope
here).

## API

Five additions, all on existing classes. Defaults preserve today's
behavior — a form with no `live()` calls keeps the current "resolve
once, hold uncontrolled values, fetch on submit" flow byte-for-byte.

```ts
class ArticleResource extends Resource {
  static form(form: Form) {
    return form.schema([
      TextField.make('title')
        .live(/* { onBlur?: boolean, debounce?: number } */)
        .afterStateUpdated((state, { $set }) => {
          $set('slug', slugify(String(state)))
        }),

      SlugField.make('slug'),

      SelectField.make('country')
        .options(COUNTRIES)
        .live(),

      SelectField.make('state')
        .options(({ $get }) => statesFor($get('country') as string)),

      ToggleField.make('hasShipping').live(),

      Section.make()
        .visible(({ $get }) => $get('hasShipping') === true)
        .schema([
          TextField.make('shipping_street'),
          TextField.make('shipping_city'),
        ]),
    ])
  }
}
```

### Method reference

| Surface | Signature | Default | Notes |
|---|---|---|---|
| `Field.live(opts?)` | `(opts?: { onBlur?: boolean; debounce?: number }) → this` | not live | Marks the field as a re-resolve trigger. `onBlur:true` fires on blur instead of every keystroke. `debounce:N` waits `N`ms of idle. They compose — `{onBlur:true,debounce:500}` is rare but valid. |
| `Field.afterStateUpdated(fn)` | `(value, ctx) → void \| Promise<void>` | unset | Server-side hook called when this field's value changed since the last resolve. `ctx` carries `{ $get, $set, record?, user?, request? }`. |
| `SelectField.options(fnOrArray)` | `Array<…> \| ((ctx) => Array<…> \| Promise<…>)` | empty array | Function form receives `{ $get, $set, record?, user? }` and runs every resolve. |
| `Element.visible / hidden / disabled` | widened to `(ctx) => boolean` | unchanged | `ctx` extends today's `record` arg with `$get / $set / values / user`. Existing `(record) => bool` callbacks still work — sniff the arity / shape, see "Backwards compat" below. |
| `Action.visible / hidden / disabled` | widened ctx | unchanged | Same widening. Already async. |

### `$get / $set` semantics

Two thin helpers handed to user callbacks. Both operate on the form's
**current resolve cycle's values map** — not the saved record, not the
DOM:

- `$get(name): unknown` — read the current value of any field in the
  form. Returns `undefined` for unknown names. Always synchronous.
- `$set(name, value): void` — set a sibling field's value during this
  resolve. Mutations are visible to subsequent `afterStateUpdated`
  hooks in the same resolve cycle (sequential by source order) and
  mirror back to the client in the response.

They're designed to read like Filament's Livewire-flavored helpers but
have no special framework magic: `$get` is a closure over the values
map, `$set` is a closure over the same map plus a "dirty" flag list.

Dot-paths (`$get('shipping.street')`) **out of scope** for v1 — pilotiq
doesn't ship Repeater / nested array fields yet (Plan #6 catch-all,
deferred). Plain top-level field names only.

### Live debouncing

Three flavors composing the same predicate:

- `live()` — fires on every change (immediate). Right for toggles /
  selects / dates.
- `live({ onBlur: true })` — fires only when the field loses focus.
  Right for text inputs where you don't want to roundtrip on every
  keystroke.
- `live({ debounce: 500 })` — fires `500`ms after the last change.
  Implicit `onBlur` semantics for typed inputs without the latency
  trade.

Combinations: `{ onBlur:true, debounce:500 }` waits both — fires `500`ms
after blur. Rare but legal.

The flags ride on `FieldMeta` (`live: true | { onBlur, debounce }`) so
the client knows which inputs to wire up. Default-uncontrolled fields
without `live()` skip the wiring entirely — same DOM as today.

## Where the resolve happens

### 1. Initial render — unchanged

`GET /:slug/:id/edit` (and friends) still call the per-page-role data
builder, which calls `callPageSchema(PageClass, ctx)` → `resolveSchema`
→ ships `schemaData` to the client. Today's flow exactly.

The only diff: `Form.toMeta()` now also emits `stateUrl` (the
partial-resolve endpoint URL) when any descendant field has `live()`
set. The client uses its presence to decide whether to wire the
controlled-state path (see "Client-side rendering" below).

### 2. Live field change — new endpoint

```
POST {base}/{slug}/_form/{formId}/state         # resource forms
POST {base}/{slug}/_form/{formId}/state         # global forms (same shape, no :id)
POST {base}/{pageSlug}/_form/{formId}/state     # custom-page forms
```

Body:

```json
{
  "values":  { "title": "Hello", "slug": "old-slug", "country": "US" },
  "changed": "title",
  "recordId": "42"
}
```

Response (200):

```json
{
  "ok":     true,
  "form":   { /* fully re-resolved FormMeta with updated children */ }
}
```

The handler reuses the same prelude as the GET-edit handler:

```ts
const user = await pilotiq.resolveUser(req)
if (!await checkPolicy(() => R.canAccess(user))) return forbidden(...)
if (!await checkPolicy(() => R.canEdit(user, record))) return forbidden(...)

const ctx: SchemaContext = { mode, record, basePath: base, user }
const elements = await callPageSchema(PageClass, ctx)
const form     = selectForm(findForms(elements), formId)

const { values, changed } = applyStateUpdate(form, body.values, body.changed, ctx)
form.withValues(values)
const meta = (await resolveSchema(form.getChildren(), { ...ctx, values, $get, $set, record })).find(…)
return res.json({ ok: true, form: meta })
```

`applyStateUpdate(form, values, changed, ctx)` is a new helper in
`dispatchForm.ts`:

1. Coerce only the `changed` field's value (other fields keep
   whatever the client sent — they may have been mid-edit).
2. Find the changed field in `form.getChildren()`.
3. If it has `afterStateUpdated`, run it with `($get, $set)` bound to
   `values`. `$set` writes mutate `values` directly.
4. Return the new `values` and the list of names `$set` touched
   (the client uses this to know which controlled inputs to update
   without losing focus on others).

Mode (create vs edit) is inferred from the route prefix exactly like
form submit — record-aware policies use the loaded record, create-mode
uses `undefined`.

### 3. Schema re-resolve

`resolveSchema` already gets a `RenderContext`. Plan #5 widens it:

```ts
export interface RenderContext extends SchemaContext {
  mode?:    RenderMode
  record?:  unknown
  values?:  Record<string, unknown>     // ← new — current form values
  $get?:    (name: string) => unknown   // ← new — bound when values is present
  $set?:    (name: string, v: unknown) => void  // ← new — same
  changed?: string                      // ← new — name of the field that triggered this resolve, if any
}
```

`$get / $set` are framework-bound when `values` is set — user code
treats them as opaque helpers. During the partial-resolve endpoint
they're real (mutate `values` in place). During GET render they're
also bound (pointing at the initial values from `Form.withValues()`),
which is what makes `SelectField.options(({ $get }) => …)` work on
first render too.

`Field.isHiddenIn(mode, record)` becomes `isHiddenIn(ctx)` (signature
widened — see "Backwards compat" below). Same for `isDisabledIn`.

`SelectField.toMeta(record)` becomes `toMeta(ctx)`. When `_options` is
a function, call it with `ctx` (await the result), serialize the
returned array. When it's a plain array, behave as today.

### 4. Client-side rendering

Today: `FormRenderer` is uncontrolled. `<input defaultValue={value}>`
+ `new FormData(form)` on submit. No values state, no reconciliation.

Plan #5: when `el['stateUrl']` is set on the FormMeta, switch to a
**lightly-controlled** mode:

- `FormRenderer` holds a `useState<Record<string, unknown>>(initial)`
  populated from server `values`.
- Each field input becomes controlled (`value={values[name]}` +
  `onChange={v => setValues(s => ({ ...s, [name]: v }))}`). Keeps the
  hidden `<input name={name}>` for non-JS submit fallback.
- Fields with `live` declared: their `onChange` (or `onBlur`,
  debounced) also POSTs to `stateUrl` with `{ values, changed: name }`.
- Response handler: `setForm(serverForm)` — replaces the whole rendered
  form. React reconciles: focused inputs survive (same `key`s), only
  changed fields visually update.

Forms with **no** `live()` fields: `stateUrl` is undefined, and the
client falls back to today's uncontrolled path — zero perf cost for
the non-reactive case.

Per-input wiring lives in a new `FormStateContext` (provider sits in
`FormRenderer`) so individual field renderers can read `values[name]`
and call `setValue(name, v)` without prop-drilling. Field renderers
without controlled handling (`Image`, `RichTextField`, etc.) keep
working — they read from context if present, fall back to
`defaultValue` if not.

A small `useFieldState(name)` hook centralises read + write so each
field type's renderer barely changes. Existing renderers update from
`defaultValue` → `useFieldState`.

## Backwards compatibility

`showWhen / hideWhen / disabledWhen` today: `(record: unknown) =>
boolean`. Plan #5 widens to `(ctx: ConditionContext) => boolean` where
`ConditionContext = { record?: unknown; values?: Record<string, unknown>;
$get?: …; $set?: …; user?: unknown }`.

Detection rule: **the callback always receives the rich ctx; the old
`record` arg name is just one property on it.** Existing code like
`hideWhen(record => record.kind === 'draft')` keeps working because
JavaScript ignores extra props on the passed object — but only if the
ctx object's shape is field-by-field assignment-compatible with what
the old code reads. To stay safe:

```ts
// old shape (still works in Plan #5):
.hideWhen(record => (record as Article).kind === 'draft')

// new shape:
.hideWhen(({ record, $get }) => (record as Article)?.kind === 'draft' || $get('archived') === true)
```

We don't try to detect arity and route to two different signatures —
the ctx object is always passed, the old code names it `record` and
reads `.kind` off it. The migration note in the changelog: "if your
condition callback uses `record.foo`, change to `ctx.record.foo` or
destructure: `({ record }) => record?.foo`."

Tests will cover both shapes.

## What about purely client-side reactivity?

Out of scope for #5. `afterStateUpdatedJs(string)` (Filament's escape
hatch — runs JS literal on the client) is Tier 2 in the audit and
better suited for a focused follow-up. Two reasons to skip:

1. **String-eval attack surface** — needs careful sandboxing (CSP +
   parse-only-once + no closure access).
2. **Doesn't fit our Filament-without-Livewire model** — pilotiq's
   reactivity is server-canonical. Adding a parallel client-only path
   creates two sources of truth.

If a user wants instant client-only changes (e.g. a "calculate VAT"
helper running 60fps as you type), they can wrap a custom field in a
React component today. Reactive-fields gives them the standard tool;
client-only escape hatches stay opt-in via custom field types.

## Failure modes

| Scenario | UI response | Notes |
|---|---|---|
| `live` POST 4xx (non-422) | Toast `"Form update failed"`; controlled state stays as-is | Same toast helper as form-submit |
| `live` POST 422 (validation) | Inline errors update; controlled values stay | Reuses existing 422 path; client doesn't navigate |
| `live` POST network error | Toast `"Form update failed"`; retry implicit on next change | We don't queue/retry — next keystroke retries naturally |
| `afterStateUpdated` throws | 500 → toast `"Form update failed"`; controlled state stays | Server logs the throw; we don't surface stack traces to client |
| `options(fn)` throws | 500 → same toast | Same as above |
| `Form` has no `live()` fields | `stateUrl` undefined; renderer skips state context | Zero-perf non-reactive case stays free |
| Field change races (rapid edits) | Each change supersedes the prior — last response wins | Track an in-flight request id; drop responses out-of-order |
| Submit fires before pending `live` resolves | Submit goes through with current client values | `live` is decorative reactivity; submit is canonical |

403 path: same as Plan #10. The `_form/.../state` endpoint runs the
edit/create policy check before resolving — failed policy → 403 with
`{ ok: false, error: 'Forbidden' }`.

## Out of scope

- **`afterStateUpdatedJs(string)`** — client-only reactivity. Tier 2;
  separate plan.
- **Repeater / nested-array `$get('items.0.name')` paths.** Plan #6
  catch-all hasn't shipped Repeater yet; flat top-level names only.
- **Optimistic client-side condition eval.** We could mirror simple
  `visible(({$get}) => $get('x') === 'y')` to a client-side predicate
  serialization (Filament does this via `JsonRule`-ish DSL). Not in
  scope — server roundtrip on every `live` change is the first
  iteration. Optimization later if profiling demands it.
- **Field-level reactive validation.** Today validation runs on
  submit. We don't add per-keystroke validators here — that's a
  separate axis.
- **Wizard step branching.** Plan #8 will use the reactive primitives
  but ships independently.
- **Multi-form pages with cross-form `$get`.** `$get` is scoped to
  the current Form's children. Multi-form pages keep separate state.
- **Server-pushed updates** (websocket / SSE that reactively re-resolve
  without a client trigger). Not on the roadmap; if needed, Pro
  collab package would own it.

## Test plan

| Area | Tests |
|---|---|
| `Field.live()` | flag stored; `live(opts)` merges onBlur+debounce; `toMeta` emits `live` only when set |
| `Field.afterStateUpdated(fn)` | hook stored; runs on `applyStateUpdate` for the matching changed field; `$set` mutations visible to subsequent reads in same resolve |
| `SelectField.options(fn)` | function form invoked with `{ $get, $set }`; sync + async forms; thrown error swallowed → empty options + console.warn |
| Widened conditions | `(record => …)` keeps working; `({record, $get}) => …` works; `disabledWhen` receives `values` correctly |
| `applyStateUpdate` helper | coerces only changed field; runs `afterStateUpdated`; returns updated `values` + dirty list; missing field name → no-op |
| `_form/:formId/state` endpoint | 200 + re-resolved meta on success; 403 on policy fail; 422 on bad input shape; 404 when formId not on page |
| Endpoint policy wiring | `canAccess` + `canEdit` for edit-mode resolve; `canAccess` + `canCreate` for create-mode |
| Multi-form page | resolves only the targeted form; other forms in tree untouched |
| Backcompat condition signature | existing tests for `hideWhen(record => …)` keep passing without rewrite |
| Client `FormStateContext` (vitest + jsdom) | `useFieldState` reads + writes; `live` field POSTs to stateUrl; non-live field doesn't; debounce + onBlur trigger correctly; in-flight request superseded |
| Renderer integration | dependent SelectField updates options after country change; conditional Section appears/hides; computed slug populates from title |

Target: ~35 new tests, bringing the suite to ~550.

## Rollout

1. Widen `RenderContext` with `values / $get / $set / changed`; thread
   through `resolveSchema` and `Field.toMeta` / `isHiddenIn` /
   `isDisabledIn`. Keep all existing callsites passing
   `{ mode, record }` only (works because new fields are optional).
2. Add `Field.live(opts?)` flag + `Field.afterStateUpdated(fn)`
   setter. `toMeta` emits `live` when set.
3. Widen `SelectField.options` to accept a function. `toMeta`
   resolves it. (Other field types with options — Plan #6 — get the
   same treatment when they land.)
4. Widen `showWhen / hideWhen / disabledWhen` to receive the rich
   ctx. Update built-in usage; tests for both shapes.
5. Add `applyStateUpdate(form, values, changed, ctx)` to
   `dispatchForm.ts`.
6. Add `formStateData(pilotiq, slug, formId, body, req)` in
   `pageData.ts` (mirrors the create / edit data-builders, runs the
   policy prelude, calls `applyStateUpdate`, returns
   `{ form: FormMeta }`).
7. Wire the three new POST endpoints in `routes.ts`. Reuse
   `wantsJson(req)` / `forbidden()` / `selectForm()` helpers.
8. `Form.toMeta()` emits `stateUrl` when any descendant field has
   `live` set.
9. Client: introduce `FormStateContext`, `useFieldState(name)`. Switch
   `FormRenderer` to controlled mode when `stateUrl` is present;
   keep uncontrolled fallback when absent.
10. Update each field renderer to read from `useFieldState` (defaults
    to `defaultValue` outside Form context).
11. Wire `live` triggers per-field: immediate / onBlur / debounced.
    Track in-flight request id to drop stale responses.
12. Update `playground-pilotiq` with a demo: country → state
    dependent SelectField + auto-slug from title + conditional
    shipping section. Confirms end-to-end.

Steps 1–8 are server-only and independently testable. Steps 9–11 are
client-only and gated on the FormMeta `stateUrl`. The whole thing
ships as one PR — public API additions become useful only when both
halves land.
