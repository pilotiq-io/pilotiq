---
name: afterStateUpdatedJs
description: Tier-2 follow-up to Plan #5 — client-side reactivity counterpart to the server `afterStateUpdated`. Runs JS literal on field change without a server roundtrip.
type: plan
---

# afterStateUpdatedJs

The last polish-bin item from `admin-gap-audit.md` Plan #5 reactive
fields. Adds a client-only escape hatch alongside the server-side
`afterStateUpdated` shipped 2026-04-30 / 2026-05-01.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. `Field.afterStateUpdatedJs(string)` setter | ✅ DONE | Stores raw string on `_afterStateUpdatedJs`; emits on `FieldMeta.afterStateUpdatedJs` |
| 2. Compiled-function cache (client) | ✅ DONE | Module-level `Map<string, Function>` keyed by source string |
| 3. `useFieldState.setValue` / `onBlur` invoke compiled JS | ✅ DONE | Synchronous, before the `live()` debounce |
| 4. `$state / $get / $set` bound for the JS body | ✅ DONE | `$state` = new value of changed field; `$get / $set` proxy `FormStateContext` |
| 5. `$set` updates context values map (no extra roundtrip) | ✅ DONE | Reuses existing `setValues` setter; doesn't re-fire `triggerLive` for the sibling |
| 6. Throw-safe runtime | ✅ DONE | `console.error` + leave values as-is; never crash the form |
| 7. Repeater / Builder row-scoped binding | ✅ DONE | Inside an array row, `$get / $set` see row-scoped names; mirror the server-side `applyStateUpdate` row context |
| 8. Tests | ✅ DONE | 23 new tests across `Field.test.ts` (setter + meta + clear), `fieldJsHandler.test.ts` (compile cache, $state binding, throw-safe, strict mode, no `this`, dotted-path contract), `formStateHelpers.test.ts` (readNestedValue), and `pageData.test.ts` (JS-only forms get stateUrl stamped). |
| 9. Docs + playground demo | ✅ DONE | `playground-pilotiq/.../ReactiveDemo.ts` — added `Heading` + `Heading slug (instant)` field pair using `afterStateUpdatedJs`, side-by-side with the server-side title→slug above. Audit row ticked, plan status table flipped, package CLAUDE.md updated. |

**Final tests:** 1874 (was 1851). +23 net.

Estimated effort: ~1 day. All client-side; server emits the string
verbatim on `FieldMeta` and otherwise stays untouched.

## Why we want it

`afterStateUpdated` (server) needs `live()`, which means a network
roundtrip per change. For a string of trivial computations the
roundtrip is overkill:

- **Slugify-on-keystroke** — `$set('slug', $state.toLowerCase().replace(/\s+/g, '-'))`.
- **Derived totals** — `$set('total', $get('price') * $get('quantity'))`.
- **Toggle-driven helper text** in conditional sections (when the
  evaluation rule is purely a function of sibling values, no policy or
  DB access).
- **Mirror one field to another** — `$set('billing_zip', $state)` when
  "same as shipping" is checked.

The server hook stays the right answer for cases that need DB access
(unique check, dependent options, computed defaults that read related
records) or that have side effects beyond the form (logging, audit).
This plan adds the client-only counterpart for the cheap cases — no
roundtrip, instant UI.

`afterStateUpdatedJs` is cited as the "Filament-style escape hatch"
in `reactive-fields.md` "out of scope" section. We're picking it up
now because the rest of Plan #5 has shipped + bedded in for ~1 month
without surfacing a need to revisit those primitives.

## API

One new setter on `Field`. String body of a function; treated as
trusted admin code (see "Trust posture" below).

```ts
TextField.make('title')
  .afterStateUpdatedJs(`
    $set('slug', $state.toLowerCase().trim().replace(/\\s+/g, '-'))
  `)

NumberField.make('quantity')
  .afterStateUpdatedJs(`
    $set('total', Number($get('price') ?? 0) * Number($state ?? 0))
  `)

ToggleField.make('sameAsShipping')
  .afterStateUpdatedJs(`
    if ($state) {
      $set('billing_street', $get('shipping_street'))
      $set('billing_city',   $get('shipping_city'))
    }
  `)
```

### Method reference

| Surface | Signature | Default | Notes |
|---|---|---|---|
| `Field.afterStateUpdatedJs(body)` | `(body: string) → this` | unset | Stores raw JS string. Calling with `''` clears. |
| `FieldMeta.afterStateUpdatedJs` | `string \| undefined` | omitted | Wire format. Emitted only when set. |

### `$state / $get / $set` semantics (client)

Three names bound when the compiled function runs:

- `$state: unknown` — the changed field's new value, post-coerce
  (matches what server `afterStateUpdated` receives in its `value`
  arg). For checkbox/toggle inputs this is the boolean; for select
  this is the new option value.
- `$get(name): unknown` — read any sibling's current value from the
  form's context state. Synchronous. Returns `undefined` for unknown
  names. Inside an array row, dotted absolute paths (`title`,
  `items.0.name`) read from the form root; bare names within the same
  row read row-scoped (matches Repeater + Builder server precedent).
- `$set(name, value): void` — write a sibling's current value.
  Triggers a React re-render of that sibling's controlled input. Does
  NOT trigger `triggerLive` for the sibling (mirrors server-side
  `$set` — a write is not a "user change").

These are NOT the same `$get / $set` references the server passes to
`afterStateUpdated`. They're a client-local pair bound to
`FormStateContext`. The body sees no other globals — no `window`, no
`fetch`, no `document`, no `this`. (Strict mode + arg-only scope; see
"Compilation" below.)

### Composition with `live()` and server `afterStateUpdated`

Three combinations matter:

**JS only** (no `live()`) — runs on every change. No roundtrip ever.
Right for purely-derived fields (`total = price × qty`).

**JS + `live()` + server `afterStateUpdated`** — JS runs first
(synchronously, on the change event), THEN the debounced/onBlur
roundtrip fires; the server's response replaces the values map
wholesale. JS-stamped values may be overwritten by server-stamped
values — that's intentional. Server is canonical; JS is a hint.

**Server only** (no JS) — unchanged from today.

| | No JS | JS only | JS + `live()` |
|---|---|---|---|
| Client `$set` runs | — | every change, sync | every change, sync |
| Server roundtrip fires | only if `live()` | never | yes (debounced) |
| Server response wins | — | — | overwrites JS-stamped values |

### Trust posture

The string body is **admin-trusted code**, written at schema
definition time by the developer building the panel. It is NOT
derived from end-user input; it ships from the panel module to the
client like any other JS string in the bundle.

Implications:

1. **`new Function` is the eval mechanism.** Cleaner than maintaining
   a custom expression DSL (which would limit useful idioms — math,
   regex, string slicing — for a power-user feature whose audience is
   small to begin with). Sandboxing relies on argument-only scope;
   global access requires explicitly poking through `globalThis`,
   which we don't expose.

2. **CSP `unsafe-eval` is required for `new Function`.** Apps with a
   strict CSP that disallows `unsafe-eval` will see the compile fail
   at the first JS evaluation; the runtime catches the throw,
   `console.error`s with a clear message, and proceeds (the field's
   value stays as-is, no infinite-loop). Document this in the field
   docs alongside the API.

3. **No SSR pre-execution.** The compiled function only runs on the
   client. Server passes the raw string through. SSR doesn't benefit
   from the JS hook (the server form isn't reactive); first paint
   matches the values from `Form.withValues()` exactly.

4. **No request-time string injection.** Field meta is emitted from
   the resolved schema graph, which is owned by panel-author code.
   Even if someone POSTs a tampered `afterStateUpdatedJs` value, the
   server doesn't read or echo it (only the schema-defined string
   reaches the client).

The alternative — a tiny expression DSL — was considered and
rejected. It would force every helper (`slugify`, `Number()`,
`Math.round`, regex literals) to be either re-implemented or banned.
The DSL would be the wrong tool for the cases that justify the
feature.

### Out-of-scope eval flavors

- **Async / await in the body.** Compiled with the regular `Function`
  constructor (synchronous). Reaching for async is a sign you should
  use server `afterStateUpdated + live()` instead — that's literally
  what it's for.
- **Cross-form references.** `$get / $set` scope to the current
  Form's children only. Multi-form pages keep separate contexts (same
  scoping as the server-side helpers).
- **Nested-path writes via dot notation.** `$set('items.0.name', x)`
  is allowed and uses `writeNestedValue` (already shipped for the
  Repeater live wiring); but it's a power feature, document
  conservatively.

## Where the eval happens

### Compilation cache

Module-level `Map<string, CompiledHandler>` in `react/FormStateContext.tsx`:

```ts
type CompiledHandler =
  | { ok: true; fn: (...args: unknown[]) => void }
  | { ok: false; error: string }

const handlerCache = new Map<string, CompiledHandler>()

function compileHandler(body: string): CompiledHandler {
  const cached = handlerCache.get(body)
  if (cached) return cached

  try {
    const fn = new Function('$state', '$get', '$set', `'use strict';\n${body}`)
    const entry: CompiledHandler = { ok: true, fn: fn as never }
    handlerCache.set(body, entry)
    return entry
  } catch (err) {
    const entry: CompiledHandler = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    handlerCache.set(body, entry)
    console.error('[pilotiq] afterStateUpdatedJs compile failed:', err)
    return entry
  }
}
```

Cached by string identity (the same `afterStateUpdatedJs(...)` source
appears in every render of the same form, so we compile once per
unique body for the lifetime of the page).

### Invocation

`useFieldState.setValue(value)` and the field's `onBlur` already call
`triggerLive` (when the field has `live`). The JS hook plugs in just
before that — synchronous, no debounce:

```ts
const meta = findFieldMeta(formMeta, name)
if (meta?.afterStateUpdatedJs) {
  const compiled = compileHandler(meta.afterStateUpdatedJs)
  if (compiled.ok) {
    try {
      compiled.fn(value, $get, $set)
    } catch (err) {
      console.error(`[pilotiq] afterStateUpdatedJs run failed for "${name}":`, err)
      // intentionally swallow — leave values as-is
    }
  }
}

// existing live() path continues unchanged
if (meta?.live) triggerLive(name, value)
```

`$get / $set` are closures over `FormStateContext`'s values map +
setter. `$set` calls the existing `setValueByName` (used internally
when server responses overlay `$set` mutations) so React re-renders
controlled inputs at the affected names. No new bookkeeping —
in-flight Live request tracking, error toasts, force-rerender — all
unchanged.

### Repeater / Builder row context

Inside an array row, the same dotted-path machinery shipped for
`live()` applies. The bridge in `RepeaterInput` /  `BuilderInput`
wraps the FormStateContext's `$get / $set` with row-scope-aware
versions when the changed field's name carries a `<arrayName>.<idx>.`
prefix. Bare names ("`name`") read the row; absolute names
("`title`") cross out to the form root.

For Builder, where row content is `{type, data}`, bare names within a
row resolve to `<arrayName>.<idx>.data.<name>` — same convention as
the server's `applyBuilderStateUpdate`. The row-scope helper lives in
`FormStateContext` already (`buildRowScopedAccessors`); we extend it
to feed into the JS handler too.

The handler doesn't see `ctx.row` directly — that surface was
deliberately scoped to server-side `afterStateUpdated` because most
row-scope reads work fine through bare-name `$get` and the index is
rarely needed. If a use case surfaces (e.g. "show row N's input
mirrored into a header"), we can pass it as a fourth `$row` arg in
v2.

## Failure modes

| Scenario | Behavior | Notes |
|---|---|---|
| Empty / whitespace body | No-op (treated as `unset`) | `Field.afterStateUpdatedJs('')` clears the flag |
| Compile error (bad syntax) | `console.error` + cache the failure | Subsequent invocations skip eval; field still reactive |
| Run-time throw inside body | `console.error` + leave values as-is | Doesn't affect submit, doesn't affect server `live` |
| `$set('unknown', x)` | Adds the key to the values map | No warning; mirrors server-side $set posture |
| `$get('unknown')` | Returns `undefined` | Same |
| CSP `unsafe-eval` blocked | Compile error path | Falls back to "no JS hook"; docs note this explicitly |
| Field has both JS + server `afterStateUpdated` | JS runs sync, server runs on roundtrip; server wins | Documented composition |
| Field has JS but no `live()` | JS runs on every change; never roundtrips | Documented |
| `$set` triggers another field's JS hook? | NO — same-tick `$set` writes don't re-fire JS | Mirrors server-side $set (a write is not a user change) |

## Test plan

Server-side (Field setter + meta):

| Area | Tests |
|---|---|
| `Field.afterStateUpdatedJs(s)` | flag stored; `''` clears; `toMeta` emits only when set |
| Backwards compat | existing tests for `afterStateUpdated` (server) keep passing |

Client-side (vitest + jsdom — needs jsdom wired into the harness, see
`reactive-fields.md` step 12 caveat):

| Area | Tests |
|---|---|
| Compile cache | same string compiled once; failures cached |
| Invocation order | runs synchronously on change, before `triggerLive` |
| `$state` arg | receives the new value of the changed field |
| `$get` | reads sibling values from FormStateContext |
| `$set` | writes propagate; sibling input rerenders; doesn't re-fire `live` |
| Composition with `live()` | both fire; server response overlays JS-stamped values |
| Throw inside body | console.error + values unchanged + form keeps working |
| Bad syntax body | console.error at compile + values unchanged + form keeps working |
| Repeater row scope | bare `$get('name')` reads row-scoped value; dotted absolute paths cross out |
| Builder row scope | bare names map to `<arr>.<i>.data.<name>` |
| Empty / unset | no eval path runs; meta omits the field |

Target: ~12 new tests. Current count is 1851; new total ~1863.

If wiring jsdom is too much for one PR, ship the server half (steps
1–2) standalone with the meta-emission tests + integration test
shape; document the client coverage as deferred-pending-jsdom in the
PR description. The reactive-fields plan already has a precedent for
that split.

## Rollout

1. Add `Field._afterStateUpdatedJs?: string` + setter
   `afterStateUpdatedJs(body: string)`. Empty string clears.
   `toMeta()` emits `afterStateUpdatedJs` when set.
2. Module-level `compileHandler` cache + `runJsHandler` helper inside
   `react/FormStateContext.tsx`.
3. Hook the helper into `useFieldState.setValue` AND the per-field
   `onBlur` paths so the JS fires whether or not the field is also
   `live({ onBlur: true })`. Run synchronously, before `triggerLive`.
4. Bind `$state`, `$get`, `$set` for the handler:
   - Top-level fields: `$get / $set` proxy `FormStateContext`.
   - Repeater / Builder rows: row-scope-aware variants from
     `buildRowScopedAccessors` (extended to feed into the JS handler;
     same wiring already used for live within rows).
5. `RepeaterInput` / `BuilderInput`: thread the row-scoped handler
   alongside the existing `triggerLive` call.
6. Tests for the server-side surface (setter + meta). Client tests
   pending jsdom (see test plan).
7. Playground demo: add an instant-slugify field to
   `playground-pilotiq/app/Pilotiq/pages/ReactiveDemo.ts`, side-by-side
   with the existing server `afterStateUpdated` slug demo. The two
   together make the latency difference (instant vs ~50ms roundtrip)
   visible.
8. Docs:
   - `packages/pilotiq/CLAUDE.md` Field section — one-line note that
     `afterStateUpdatedJs(body)` is the client-side counterpart.
   - `docs/guide/reactive-fields.md` — new section "Client-only
     reactivity (`afterStateUpdatedJs`)" with the slugify + total +
     mirror examples, the trust-posture note, and the CSP caveat.
   - `docs/plans/admin-gap-audit.md` — tick the
     `afterStateUpdatedJs(string)` row in the reactivity table.
   - `docs/plans/reactive-fields.md` — note this plan as the resolved
     follow-up to its "out of scope" entry.
9. `pilotiq-io` doc sync — `~/Projects/pilotiq-io/scripts/sync-docs-from-package.mjs`
   (the cumulative 2026-05-04 work was already deferred per
   `project_pilotiq_next_session.md`).

Steps 1–2 are independent and pure; 3–5 are coupled (the eval site
needs the cache, the cache needs the helper, the row variants need
all of the above). Ship as one PR — the public API only becomes
useful when both halves land.

## Open questions

1. **Should we expose `$row.index` to the JS handler?** The server
   hook does. Defer until a real use case shows up; keep the surface
   minimal in v1.

2. **Should `$set` from JS cascade into other fields' JS hooks?** No
   in v1. Mirrors server `$set` posture and avoids accidental
   recursion. If a use case surfaces, we add an explicit
   `$cascade(name, value)` later.

3. **Pre-compile at panel boot?** No — the source string only matters
   on the client; pre-compiling on the server would require shipping
   a compiled-fn-ish artifact through JSON. Lazy compile on first use
   is fine; the cache means we pay once per unique body per
   page-load.

4. **Source-mapping for stack traces.** Minor: failures inside the
   body show `Function:line:col`, which doesn't map back to the
   panel-source line. We could prepend `//# sourceURL=...` to the
   body before compile to give devtools something to label the frame
   ("`pilotiq:afterStateUpdatedJs:<fieldName>`"). Cheap. Include in
   v1.
