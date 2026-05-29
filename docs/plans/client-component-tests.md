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

> **Status: ✅ COMPLETE (closed 2026-05-30).** Phases 0–4 plus the Phase 2c
> popover slice all landed (PRs #85–#96); full suite at 3,227 tests, green. The
> original motivation — catching `rules-of-hooks` mount bugs that unit tests
> can't — is fully covered: every high-risk renderer (forms, tables, array
> fields, overlays, chrome, base-ui popovers) now mounts under test. Remaining
> ideas (a11y/keyboard-nav smoke, the rest of the filter widgets, per-layout
> chrome detail) are deliberately deferred as diminishing returns — pick them up
> ad hoc if a regression or new feature touches that surface. New components
> should ship with a render test in the same PR; the harness + conventions in
> `docs/contributing/testing.md` are the entry point.

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

## Phase 0 — harness (prerequisite, ~half a day) — ✅ DONE

Shipped on branch `test/client-component-harness`. happy-dom + RTL + user-event
run under `node:test`; full suite green at 3,110 tests (3,106 + 4 new), no leak
into the DOM-free suite, typecheck clean. Per-file DOM import chosen over
`--import` (the open question below is settled). Deliverables landed:
`src/__test__/{dom.ts,renderWithProviders.tsx,fakes.ts}`, the toolchain smoke
test, the first real-component test (`react/fields/TextLikeInput.test.tsx`), and
`docs/contributing/testing.md`.

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

Resolved: DOM registers **per-file** (`import '../__test__/dom.js'` as the first
import). It keeps the pure suite DOM-free and worked cleanly; the process-wide
`--import` flag wasn't needed.

---

## Rollout phases (risk- and value-ordered)

Each phase: extract any remaining pure logic first, then render-test the
behavior that's left. Target the highest-traffic, highest-risk components first.

### Phase 1 — Forms (the submit path users hit most)
- ✅ `schemaRenderer/form/FormRenderer.tsx` — DONE. Chrome (`_formId`/action),
  server-error banner + inline errors, fetch submit → SPA navigate, 422 →
  inline errors, double-submit guard, `force` redirect. (`FormRenderer.test.tsx`)
- ✅ `FormStateContext.tsx` (reactive core) — DONE. `live()` change POSTs
  `{ changed, values }` to `stateUrl`; server `form.values` overlays onto
  siblings; non-live change is a no-op. (`FormStateContext.test.tsx`)
- ✅ `TextLikeInput` — DONE in Phase 0 (controlled render + typing).
- ✅ Phase 1b field inputs — DONE for `CheckboxInput`, `ToggleFieldInput`,
  `RadioInput`, `SelectFieldInput`: uncontrolled toggle/select + hidden-input
  mirror, controlled value from form state, and (Select) pick-an-option updates
  the submitted value. (Note: base-ui `SelectValue` renders its label lazily
  with the popup, so the hidden input is the assertion target, not the trigger
  text.)
- ✅ Phase 1c — DONE. `ToggleButtonsInput` (segmented control → hidden
  mirror; controlled value; disabled option no-op). `CheckboxListInput`
  (per-value hidden inputs add/remove on toggle; controlled array).
  `MarkdownInput` native path (Write/Preview tab switch, `marked` preview,
  toolbar transform splices the value). `renderField.tsx` dispatch (each
  `fieldType` mounts the right control; `hidden` renders bare).
  (`ToggleButtonsInput.test.tsx`, `CheckboxListInput.test.tsx`,
  `MarkdownInput.test.tsx`, `schemaRenderer/form/renderField.test.tsx`)

### Phase 2 — Tables (the most complex renderer)
- ✅ `schemaRenderer/table/TableRendererBody.tsx` — DONE (first slice). Empty-
  columns guard (locks in the hook fix), column headers + row cells, empty /
  filtered-empty states, sortable header link carrying the sort query, bulk
  select-all + per-row toggle. (`TableRendererBody.test.tsx`)
- ✅ `cells/EditableCell.tsx` — DONE. CellTextInput debounced PATCH + rollback
  on reject + confirm-gate (accept/cancel) + disabled; CellToggle immediate
  PATCH + flip-back on reject. (`EditableCell.test.tsx`)
- ✅ Phase 2b (second slice) — DONE. `TableRendererBody`: group banding
  (one heading row per contiguous `_groupValue`), group collapse (chevron
  folds a section's rows), pagination chrome (page indicator + Previous/
  Next links by page position). `CardsLayoutBody`: card-per-row via the
  injected `renderElement`, empty state, no-content placeholder, group
  sections + collapse. `TableRenderer`: deferred-load shell — skeleton
  first → fetched rows, error banner, and direct (non-deferred) pass-
  through. (`TableRendererBody.test.tsx`, `CardsLayoutBody.test.tsx`,
  `TableRenderer.test.tsx`)
- ✅ Phase 2c (popover slice) — DONE. Audited happy-dom + base-ui v1 portal
  behavior first: `SelectPrimitive.Portal` renders into a `data-base-ui-portal`
  div on `document.body`, `userEvent.click` on the trigger opens the popup, and
  the options are queryable by role once open. The trigger's `SelectValue`
  label stays the raw VALUE (lazy-label, no layout pass under happy-dom), so the
  committed value is read off base-ui's hidden `…-hidden-input`. `CellSelect`:
  reflects value on the hidden input, PATCHes the chosen option, rolls back on
  reject, confirm-gate (accept/cancel), nullable-clear sends `null`, per-row
  `rowOptions` override wins over static options, disabled trigger.
  (`EditableCell.test.tsx`) `filters.tsx`: `SortByPicker` (open → pick → onChange
  with column+dir; reflects active sort; renders nothing with no sortable
  columns), `ColumnsToggleDropdown` (toggle direction both ways; stays open
  across clicks so multiple columns toggle in one pass), `FilterPopover`
  (trigger + active-count badge, reveals controls on open, pushes the URL patch
  a filter widget emits via `useNavigate`). (`filters.test.tsx`)

### Phase 3 — Array fields + overlays
- ✅ `fields/RepeaterInput.tsx` — DONE. Initial-row render, empty state, add /
  remove, min/max gating (Add/Remove disabled at bounds).
  (`RepeaterInput.render.test.tsx` — named to avoid clobbering the pure-logic
  `RepeaterInput.test.ts`.)
- ✅ `fields/BuilderInput.tsx` — DONE. Initial-row render, empty state, single-
  block direct add, multi-block picker-menu add, remove. (`BuilderInput.render.test.tsx`)
- ✅ Phase 3b (first slice) — DONE. Repeater + Builder row chrome: clone
  (`cloneable` → "Duplicate row", maxItems gating), collapse via the
  chevron (`aria-expanded` flip), accordion one-open-at-a-time, item-label
  resolution (resolved `itemLabel` vs positional / block-label default),
  and the Up/Down reorder fallback (asserted via `__id` DOM order; the
  `@dnd-kit` pointer drag stays covered by the pure `reorderRows` unit
  test). `CommandPalette.tsx` (⌘K): empty-input quick-nav, debounced
  search via `fetchImpl`, ↑/↓+Enter navigate, Escape close.
  `NotificationBell.tsx`: `useNotifications` lifecycle (fetch-on-mount,
  optimistic mark-read + POST, mark-all → zero) driven through a harness
  with stubbed `fetch`, plus `NotificationList` empty / loading /
  unread-chrome. (`RepeaterInput.render.test.tsx`,
  `BuilderInput.render.test.tsx`, `CommandPalette.test.tsx`,
  `NotificationBell.test.tsx`)
- ✅ Phase 3c — DONE. `SearchTrigger.tsx` (null outside the opener
  context; opens the palette on click). `ConfirmActionDialog.tsx` (open →
  confirm runs `onConfirm` + closes; Cancel closes; destructive CTA
  label). `ActionModalDialog.tsx` (200 → close + navigate; 422 → inline
  field errors, stays open; 5xx → server-error banner; Cancel) — the
  import/export modal rides this same submit pipeline.
  `NotificationActionStrip.tsx` (url-mode navigate + mark-read; handler
  POST → mark-read/notify/redirect; disabled handler chip with no
  notification id). (`SearchTrigger.test.tsx`,
  `schemaRenderer/action/{ConfirmActionDialog,ActionModalDialog}.test.tsx`,
  `NotificationActionStrip.test.tsx`)
- ☐ Not covered (low value): the base-ui `NotificationBell` dropdown
  trigger/badge portal itself (the list + strip inside it are tested);
  `ActionGroupTrigger` / `MethodActionButton` / `HandlerActionButton`
  dispatch buttons. Pick up under Phase 4 chrome if wanted.

### Phase 4 — Chrome + cross-cutting
- ✅ `ThemeProvider.tsx` — DONE. `setTheme` applies the `<html>` class +
  persists to localStorage + flips `resolved`; reads the persisted theme
  on mount; injects the `:root` CSS-variable `<style>` from a resolved
  theme. (`ThemeProvider.test.tsx`)
- ✅ `AppShell.tsx` + `SidebarLayout.tsx` / `TopbarLayout.tsx` — DONE
  (smoke). AppShell self-mounts every chrome provider, so one render
  exercises the full sidebar/topbar tree: nav links render, the active
  route highlights (sibling differs), brand + page body present, and the
  topbar variant mounts (grouped nav folds into dropdowns). The pure
  active-link matcher is unit-tested in `component-slots.test.ts`.
  (`AppShell.test.tsx`)
- ☐ Remaining (optional, low value): keyboard-nav + a11y smoke pass
  (roles/labels) over the Phase 1–3 components; per-layout chrome detail
  (sidebar collapse/rail, topbar dropdown open) beyond the mount smoke.

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
