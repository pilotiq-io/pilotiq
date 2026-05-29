# Client component tests

`packages/pilotiq/src/react/` is **~21,500 lines across 97 `.tsx` files** and
has **near-zero rendering coverage**. The handful of tests under `react/` are
pure-logic tests of *extracted* functions (`reorderRows`, `repeaterReconcile`,
`formStateHelpers`, …) — none of them mount a component, dispatch an event, or
assert on rendered output. Server-side logic (routes, pageData, dispatch, auth)
is well covered by the existing 3,106 tests; the client renderer is the gap.

This plan adds a rendering test harness and rolls out component tests in risk-
ordered phases. **No production behavior change** — this is test infrastructure
plus new `*.test.tsx` files.

---

## Why now

The deep audit (2026-05-29) graded the package A− overall but flagged client
rendering as the one substantial coverage hole. The 14 `rules-of-hooks` bugs
fixed in `706b8ea` are exactly the class of defect that rendering tests catch
and unit tests can't: they only manifest when a component actually mounts and
re-renders. We shipped those fixes blind (no test could have caught them). A
harness closes that blind spot before the next one lands.

## Current state (what the harness must fit)

- **Runner:** `node:test`. The `test` script is
  `tsc -p tsconfig.test.json && node --test "dist-test/**/*.test.js"` — TypeScript
  is compiled to `dist-test/`, then `node --test` runs the `.js`. There is **no
  vitest**, no DOM environment, and `react-dom` / `@testing-library/*` are not
  dependencies.
- **`tsconfig.test.json`** already sets `jsx: 'react-jsx'` and includes
  `DOM` / `DOM.Iterable` libs — so `.tsx` test files compile today; they just
  have nowhere to render.
- **Established pattern:** logic is extracted out of components into pure
  helpers and unit-tested (e.g. `RepeaterInput.tsx` exports `reorderRows`,
  tested in `RepeaterInput.test.ts`). This pattern stays — see "What we keep
  extracting" below. Rendering tests are additive, for behavior that only
  exists once a component is mounted.
- `node --test` runs each test file in its own child process, so a DOM
  registered inside a render-test file does **not** leak into the 3,106 pure
  tests.

---

## The core decision: harness

**Keep `node:test` (one runner) and add a DOM + React Testing Library, opted
into per-file.** Three sub-decisions, with the rejected alternatives:

### 1. DOM environment — **happy-dom**, not jsdom

happy-dom is markedly faster and lighter, and we only need standard DOM +
events (no canvas, no layout). Registered via `@happy-dom/global-registrator`,
which installs `window` / `document` globals into the Node process.

- *Rejected:* jsdom — heavier, slower, more surface than these components need.

### 2. Rendering API — **@testing-library/react** (+ `@testing-library/user-event`)

RTL is runner-agnostic (works under `node:test`; it only needs `global.document`)
and gives us query-by-role/label/text plus realistic event simulation via
`user-event`. It steers tests toward asserting on what the user sees, not
implementation details.

- *Rejected:* raw `react-dom/test-utils` `act()` — lower-level, no querying, and
  `react-dom/test-utils` is being wound down in React 19.
- **Caveat:** RTL only auto-registers its `cleanup()` afterEach hook for
  vitest/jest/mocha. Under `node:test` we register it ourselves once in the
  shared setup (see Phase 0).

### 3. Scope — **second runner (vitest) rejected**

Introducing vitest just for `.tsx` would split the suite across two runners,
two configs, and two mental models. The repo standard is `node:test`; staying
on it keeps `pnpm test` a single command.

---

## Phase 0 — harness (prerequisite, ~half a day)

Deliverables, all under `packages/pilotiq`:

1. **Dev dependencies:** `react-dom@^19`, `@testing-library/react`,
   `@testing-library/dom`, `@testing-library/user-event`,
   `@happy-dom/global-registrator`. (`react` is already present.)
2. **`src/__test__/dom.ts`** — imports `GlobalRegistrator` and calls
   `.register()` at module load; render tests `import '../__test__/dom.js'` as
   their first import. Also registers a `node:test` `afterEach(() => cleanup())`
   so RTL tears down between cases.
3. **`src/__test__/renderWithProviders.tsx`** — a `render()` wrapper that mounts
   the context providers most components need (`FormStateProvider`, icon
   context, `Toaster`, theme, row-coords, etc.) with sensible test defaults and
   per-test overrides. This is load-bearing: almost every interesting component
   reads at least one context. Audit which providers each target needs as the
   first step of each phase.
4. **`src/__test__/fakes.ts`** — shared fake builders (`fakeFieldMeta`,
   `fakeTableMeta`, `fakeRecord`, a fetch stub for the form-state / cell-edit /
   reorder POST endpoints). Consolidates duplication the route tests already
   hint at.
5. **One smoke test** proving the harness end-to-end: render a trivial field
   input, assert it shows its label, type into it via `user-event`, assert the
   hidden form input updates. If this is green in CI, the harness works.
6. **Docs:** `docs/contributing/testing.md` — how to write a render test, the
   `import '../__test__/dom.js'` rule, the provider wrapper, the fetch stub.

Open question to settle in Phase 0: whether to register the DOM per-file
(`import './dom.js'`) or process-wide via `node --test --import ./dist-test/__test__/dom.js`.
Per-file keeps the pure suite DOM-free and is the default recommendation; the
`--import` flag is the fallback if per-file imports prove noisy.

---

## Rollout phases (risk- and value-ordered)

Each phase: extract any remaining pure logic first, then render-test the
behavior that's left. Target the highest-traffic, highest-risk components first.

### Phase 1 — Forms (the submit path users hit most)
- `schemaRenderer/form/FormRenderer.tsx` — submit → 422 inline error display →
  correct → success/redirect; `force` redirect on create-another; double-submit
  guard.
- `schemaRenderer/form/renderField.tsx` + core field inputs
  (`TextLikeInput`, `SelectFieldInput`, `MarkdownInput`'s native path,
  toggle/checkbox/radio) — controlled vs uncontrolled, `live()` triggering a
  state POST, `afterStateUpdated` overlay.
- `FormStateContext.tsx` — the `$get`/`$set`/controlled-value contract that
  every field depends on.

### Phase 2 — Tables (the most complex renderer)
- `schemaRenderer/table/TableRendererBody.tsx` — sort toggle, search box, group
  banding + collapse, bulk-select (select-all / per-row), pagination, the
  empty-columns and deferred-skeleton branches. (This file held 4 of the 14
  hook bugs — it earns priority.)
- `cells/EditableCell.tsx` — debounced text PATCH, immediate toggle/select,
  optimistic update + rollback on failure, `.confirm()` gate.
- `schemaRenderer/table/CardsLayoutBody.tsx` and `filters.tsx` (FilterPopover,
  SortByPicker, ColumnsToggleDropdown).

### Phase 3 — Array fields + overlays
- `fields/RepeaterInput.tsx` / `fields/BuilderInput.tsx` — add / remove / clone /
  collapse / `@dnd-kit` reorder, min/max items, item-label resolution.
- Action confirm dialogs, modal-form actions, import/export modal.
- `CommandPalette.tsx` / `SearchTrigger.tsx` — ⌘K open, query, result nav.
- `NotificationBell.tsx` (now `NotificationBellInner`) — list, mark-read,
  mark-all.

### Phase 4 — Chrome + cross-cutting
- `layouts/SidebarLayout.tsx` / `TopbarLayout.tsx`, `AppShell.tsx`,
  `ThemeProvider.tsx` — render with representative nav, collapse, active-route.
- Keyboard-nav + a11y smoke pass (roles/labels) over the Phase 1–3 components.

---

## What we keep extracting (don't render everything)

Rendering tests are slower and more brittle than pure-function tests. Where
logic can live in a pure helper, it should — and be unit-tested as today.
Reserve render tests for behavior that genuinely needs a mounted tree: event
handling, context wiring, conditional rendering, focus/selection, async
fetch-and-replace. Pure formatting/transform logic (cell formatters, URL
builders, reconcilers, class-name maps) stays in `.ts` helpers with `node:test`
unit tests.

## Non-goals

- No visual-regression / screenshot testing.
- No full browser (Playwright) E2E — that belongs in the playground, separately.
- No coverage-percentage gate in CI initially; revisit once Phases 1–2 land.
- Not rewriting the existing pure-logic tests.

## Risks

- **Provider sprawl** — components read many contexts; an incomplete
  `renderWithProviders` makes tests throw on mount. Mitigation: build it
  incrementally, asserting the needed providers per phase.
- **happy-dom gaps** — a missing API (e.g. `IntersectionObserver`, `matchMedia`)
  surfaces as a render throw. Mitigation: stub the few that components touch in
  `dom.ts`; document them.
- **Compile-step friction** — tests compile through `tsconfig.test.json`; a
  testing-library type or ESM-resolution issue blocks the whole run. Mitigation:
  the Phase 0 smoke test de-risks this before any rollout.

## Success criteria

- `pnpm test` stays one command, green, with the new render tests included.
- Phase 0 smoke test + `renderWithProviders` + `fakes` merged and documented.
- Phases 1–2 land FormRenderer + TableRendererBody behavior tests; a
  deliberately reintroduced rules-of-hooks bug or a broken submit path fails a
  test.
- The pure suite's runtime is not meaningfully degraded (DOM stays opt-in).

## Estimated effort

Phase 0: ~0.5 day. Phase 1: ~1.5 days. Phase 2: ~2 days. Phase 3: ~2 days.
Phase 4: ~1 day. Phases are independently shippable; stop after any phase with
value banked.
