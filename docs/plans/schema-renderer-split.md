# SchemaRenderer split

`packages/pilotiq/src/react/SchemaRenderer.tsx` is **6,798 lines** —
the single React module that dispatches every schema element type the
admin panel renders (text, field, action, form, table, entries, alerts,
tabs, wizard, …). It works, it's heavily exercised by 15 playground
pages, and it's been the kind of file everyone is wary to touch.

This plan splits the file along its existing seams into a directory of
smaller modules. **No behavior change.** Same exports, same props, same
rendered output. The goal is "easier to read, edit, and review", not
new architecture.

---

## Why now

The original code-quality review surfaced this as the top long-term
refactor candidate. The lint-wiring + theme-migrate PR cleared the
adjacent housekeeping. Splitting up the file unlocks:

- **Safer edits.** A change to action rendering today touches a file
  where unrelated table-cell formatting code is two screens away.
- **Test surface area we can actually grow.** There are zero tests for
  SchemaRenderer today; pulling handlers into focused modules makes it
  realistic to add per-handler tests without standing up a 6k-line test
  harness.
- **Plugin contribution clarity.** Slot components, render hooks, and
  the right-sidebar work all need to read SchemaRenderer to understand
  where contributions attach. Smaller files = lower onboarding cost.

---

## What lives in the file today

Source-order map of the major sections:

| Lines | Section | Notes |
|---|---|---|
| 1–110 | Imports | 30 field components, contexts, icons, filters, widgets |
| 111–170 | Helpers + `alertStyles` | `resolveIcon()` is here |
| 175–644 | Field rendering | `renderField`, `TextFieldShell`, `renderFieldInput` (13 field types) |
| 646–1505 | Action layer | `dispatchHandlerAction`, `ActionModalDialog`, `ConfirmActionDialog`, method/handler buttons, color/size constants |
| 1505–1560 | Layout helpers | `layoutClasses`, `renderChildren` |
| 1560–1730 | Filter chrome | `ActiveFiltersBar`, `FilterPopover`, `FilterStrip`, `FilterStripToggle` |
| 1730–1910 | Row actions + ActionGroup | `renderRowActions`, `ActionGroupTrigger` |
| 1913–2070 | Tabs + Section | `TabsRenderer`, `SectionRenderer` |
| 2070–2380 | Wizard | `WizardRenderer`, step button |
| 2381–2437 | Text element | `renderText`, `TEXT_*_CLASSES` |
| 2441–2912 | Entry rendering | `renderEntry`, `EntryShell`, tooltip + copy helpers (6 entry types) |
| 2950–3025 | Alert | `AlertRenderer` (localStorage-backed dismiss) |
| 3025–3398 | **Main dispatch** | `renderElement` switch over 26+ element types |
| 3402–3594 | Form rendering | `FormRenderer`, `FormBody`, `renderFormChild` |
| 3596–5104 | Table rendering | URL state, `formatCell`, `applyColumnFormat`, `TableRenderer`, `TableRendererBody` (~960 lines), `CardsLayoutBody` |
| 5104–5478 | List/relation tabs + breadcrumbs | `ListTabsRenderer`, `RelationTabsRenderer`, `BreadcrumbsRenderer` |
| 5547–5579 | Table loading state | `TableSkeleton` |
| 6775–6798 | Export | `SchemaRendererProps` + default `SchemaRenderer` component |

### Element-type dispatch (line 3025)

The main `switch (el.type)` handles 26+ element types. Of those:

- **9 are inline JSX** (no hooks, no context): `text`, `image`, `icon`,
  `markdown`, `html`, `heading`, `divider`, `unorderedList`, `card`,
  plus the layout primitives `grid`, `group`, `split`, `fieldset`.
- **5 are no-op** (rendered by their parent container): `tab`,
  `listTab`, `step`, `column`.
- **The remaining ~13** dispatch to a renderer function that ships its
  own state or context: `alert`, `section`, `tabs`, `listTabs`,
  `relation-tabs`, `wizard`, `field`, `entry`, `action`, `actionGroup`,
  `form`, `table`, `stats`/`tableWidget`/`view` (widget renderers),
  `slotComponent` (plugin registry lookup).

The `default` case falls through to the server-widget registry.

---

## Public surface — must stay stable

`packages/pilotiq/src/react/index.ts` exports:

```ts
export { SchemaRenderer, type SchemaRendererProps, FormFields, type FormFieldsProps }
```

15 playground pages import `SchemaRenderer` from `@pilotiq/pilotiq/react`
and pass `{ elements, widgetData }`. `FormFields` is used by plugins
(e.g., rich-text custom-block side panels) to render fields outside a
form wrapper.

Both stay where they are. The barrel `react/index.ts` re-exports them
from the new layout. Consumers see no diff.

---

## Approach

**Layered extraction, leaves first.** Each phase lands as its own PR.
After each phase, the file is shorter but everything still works; the
public API is unchanged; the test suite stays green.

Target layout after the full split:

```
packages/pilotiq/src/react/
├── SchemaRenderer.tsx              # main dispatch — shrinks each phase
├── schemaRenderer/
│   ├── constants.ts                # TEXT_*_CLASSES, COLUMN_*_CLASSES,
│   │                               # BADGE_COLOR_CLASSES, alertStyles,
│   │                               # COLOR_VARIANTS, SIZE_CLASSES
│   ├── helpers.ts                  # layoutClasses, renderChildren,
│   │                               # resolveIcon, applyColumnFormat
│   ├── SimpleElements.tsx          # text, image, icon, markdown, html,
│   │                               # heading, divider, unorderedList,
│   │                               # card, emptyState, grid, group,
│   │                               # split, fieldset
│   ├── AlertRenderer.tsx           # stateful (localStorage dismiss)
│   ├── SectionRenderer.tsx
│   ├── TabsRenderer.tsx
│   ├── WizardRenderer.tsx
│   ├── EntryRenderer.tsx           # 6 entry types + EntryShell
│   ├── action/
│   │   ├── renderAction.tsx        # main action dispatch
│   │   ├── ActionModalDialog.tsx
│   │   ├── ActionGroupTrigger.tsx
│   │   ├── buttons.tsx             # MethodActionButton, HandlerActionButton
│   │   └── helpers.ts              # dispatchHandlerAction, notifications, download
│   ├── form/
│   │   ├── FormRenderer.tsx
│   │   ├── renderField.tsx
│   │   └── renderFieldInput.tsx    # 13 field types
│   └── table/
│       ├── TableRenderer.tsx
│       ├── TableRendererBody.tsx
│       ├── CardsLayoutBody.tsx
│       ├── filters.tsx             # ActiveFiltersBar, FilterPopover, FilterStrip
│       ├── formatCell.tsx
│       └── columnFormat.ts
```

The `schemaRenderer/` subdirectory is **internal**. Nothing in the
barrel re-exports from it. Consumers continue importing from
`@pilotiq/pilotiq/react`.

---

## Phase 1 — pure leaves

**Scope:** the 9 inline JSX handlers + 4 layout primitives, plus the
shared constants and helpers they pull from. No hooks, no context.

**Move:**

- `renderText()` (lines 2408–2437) and the `TEXT_*_CLASSES` block →
  the bottom of `SimpleElements.tsx`.
- Inline handlers for `image`, `icon`, `markdown`, `html`, `heading`,
  `emptyState`, `divider`, `unorderedList`, `card` (lines 3030–3192) →
  `SimpleElements.tsx`.
- Layout primitives `grid`, `group`, `split`, `fieldset` (lines
  3217–3292) → `SimpleElements.tsx`.
- `layoutClasses()`, `renderChildren()` (lines 1517–1559) →
  `helpers.ts`.
- `resolveIcon()` (lines 116–119) → `helpers.ts`.
- Shared classes: `BADGE_COLOR_CLASSES`, `COLUMN_COLOR_CLASSES`,
  `COLUMN_WEIGHT_CLASSES`, `alertStyles` → `constants.ts`.

**Main switch** in `SchemaRenderer.tsx` becomes a chain of
`renderSimpleElement(el)`-style dispatch helpers. Net diff in the main
file: roughly **-400 lines**.

**Test:** add `SimpleElements.test.tsx` covering rendered output for
each handler with React Testing Library. These are pure functions of
props — easy snapshot territory.

**Risk:** lowest. The renderers are stateless. If a constant ends up
miscategorized, the consequence is a missing CSS class, immediately
visible in the playground.

**Effort:** 1–2 hours including the test file.

---

## Phase 2 — stateful but isolated

**Scope:** components that own local state but don't reach across
handlers: `AlertRenderer`, `SectionRenderer`, `TabsRenderer`,
`WizardRenderer`, `EntryRenderer`.

**Move:** one component per file under `schemaRenderer/`. Each is a
default export. The main switch calls them by name.

**Note on `EntryRenderer`:** it pulls from
`applyColumnFormat()` (table layer) and the shared cell-formatting
constants. Extract `applyColumnFormat()` to `helpers.ts` in this phase
even though it lives in the table block today — entries use it too, and
hoisting it now removes a phase-3 prerequisite.

**Test:** add per-component test files with React Testing Library.
`AlertRenderer` needs a `localStorage` mock for the dismiss-persistence
case — see `playground/pages/(pilotiq)/+Head.tsx` for the storage key
shape.

**Risk:** low. Each component is already self-contained; the extraction
is a file move plus an import-statement update.

**Effort:** 2–3 hours.

---

## Phase 3 — action layer

**Scope:** everything between lines 646 and 1910 — every action button,
modal dialog, action group, and the `renderAction()` dispatch.

**Move:** under `schemaRenderer/action/`:
- `renderAction.tsx` (the dispatch on action type)
- `ActionModalDialog.tsx` + `ConfirmActionDialog.tsx`
- `ActionGroupTrigger.tsx`
- `buttons.tsx` (MethodActionButton, HandlerActionButton)
- `helpers.ts` (dispatchHandlerAction, dispatchNotifications,
  triggerDownloadIfAttachment, triggerBlobDownload)
- Shared button styling (COLOR_VARIANTS, OUTLINED_VARIANTS,
  SIZE_CLASSES, ICON_SIZE_CLASSES) → `constants.ts`.

**Coupling to thread through:** every action component calls
`useNavigate()` and `useToast()` at the top. Those hooks are already
imported from the framework — moving the components doesn't change
that. `renderAction` itself does recurse into `renderElement()` (e.g.,
the drawer body is a schema). Inject `renderElement` as a parameter or
import from a circular-safe shared module to avoid the cycle.

**Test:** integration test via `routes.test.ts` already covers the
server side. Add a focused `renderAction.test.tsx` that exercises each
action type's button props and click → dispatch wiring (mock fetch).

**Risk:** medium. The recursion back into `renderElement()` is the
trickiest part. A circular dependency between `renderAction.tsx` and
`SchemaRenderer.tsx` is the failure mode to watch — break it by
passing `renderElement` as an argument when needed.

**Effort:** 4–6 hours including tests.

---

## Phase 4 — form layer

**Scope:** `FormRenderer` (3402–3532), `FormBody` (3541–3554),
`renderFormChild` (3565–3585), `renderFieldWithValue` (3587–3594),
`renderField` (175–258), `TextFieldShell` (265–320), and
`renderFieldInput` (322–644, dispatches 13 field types).

**Move:** under `schemaRenderer/form/`:
- `FormRenderer.tsx` (form wrapper + submission)
- `renderField.tsx` (field type → wrapped input)
- `renderFieldInput.tsx` (13-way switch over field types)

**Coupling:**
- `FormStateProvider` + `FormIdContext` + `useFormState()` — these
  already live in their own files; the form renderer just consumes
  them. No move needed.
- `FormRenderer` calls `renderElement()` for non-field children (e.g.,
  a `card` containing fields, a `divider` between fieldsets). Same
  parameter-injection pattern as phase 3.
- Some field inputs (e.g., `SelectFieldInput`'s inline-create modal)
  call back into `renderElement()` for nested schemas. Audit and apply
  the same injection pattern.

**Test:** the existing `routes.test.ts` exercises form submission
end-to-end. Add `FormRenderer.test.tsx` with a happy-path render +
submit + error-stamp test against a small mock form schema.

**Risk:** medium-high. Forms touch every field input file. The error
stamp / value pass-through pipeline is the regression hot spot. Plan
to land this PR with a manual smoke check in the playground (create +
edit a resource end-to-end) on top of the test suite.

**Effort:** 6–8 hours including tests + smoke.

---

## Phase 5 — table layer

**Scope:** the table block (lines 3596–5104), ~1,500 lines. This is the
biggest extraction and the highest regression risk.

**Move:** under `schemaRenderer/table/`:
- `TableRenderer.tsx` (deferred-load wrapper + skeleton)
- `TableRendererBody.tsx` (grid layout, sort/group/filter, inline
  edit/delete; this is the ~960-line monster)
- `CardsLayoutBody.tsx` (card-variant rendering)
- `filters.tsx` (`ActiveFiltersBar`, `FilterPopover`, `FilterStrip`,
  `FilterStripToggle`)
- `formatCell.tsx` (cell type dispatch)
- `columnFormat.ts` (already moved to `helpers.ts` in phase 2 — leave
  it there or hoist into the table subdir; either works)
- `URL state builders` (buildTableQuery, nextSortDir, prefixK,
  SearchFormHiddenInputs) → `tableUrl.ts`

**Coupling:**
- `TableRendererBody` calls `renderElement()` for per-row card content
  and row-action menus. Same injection pattern.
- Inline edit/delete buttons call `dispatchHandlerAction()` from the
  action layer (phase 3). After phase 3, this becomes an explicit
  import.
- `formatCell` uses the column-formatting constants moved in phase 1.

**Test:** the table is too complex to fully unit-test, but per-cell
formatting and per-filter behavior CAN be unit-tested in isolation
once they live in their own files. Add `formatCell.test.tsx` and
`filters.test.tsx` covering the cases `applyColumnFormat` and the
filter operators already accept.

**Risk:** high. Sort/group/filter URL state is a tight web of effects;
inline edit relies on subtle state machine; the deferred-load wrapper
has a race condition fix baked in. Don't bundle this with any other
work. Land it on its own branch and run the playground's full
resource-index path manually (sort, group, filter, paginate, edit a
row, delete a row, change page size) before merging.

**Effort:** 8–12 hours including tests + smoke.

---

## Test strategy (cross-phase)

There are **zero** tests on `SchemaRenderer.tsx` today. The plan is
**add-as-you-extract**, not a big-bang test run.

Each phase lands its own focused tests for the components it moves.
That way, the test surface grows alongside the structural improvement
and there's no "Phase 0: write a 6k-line test harness" prerequisite.

Tooling:
- `@testing-library/react` is already a transitive dep through other
  packages — confirm it resolves in `@pilotiq/pilotiq`'s test config
  on phase 1, add as a `devDependency` if needed.
- Tests live alongside source as `.test.tsx`, picked up by the existing
  `tsc -p tsconfig.test.json && node --test "dist-test/**/*.test.js"`
  pipeline.
- Test files for React components need a JSDOM-like environment. If
  `node --test` doesn't have that out of the box, the simplest path is
  switching the package to `vitest` for tests **only as part of phase
  1** (or sticking with `node --test` + `happy-dom`/`jsdom` setup —
  pick on phase 1 kickoff).

---

## Risks + rollback

**Per-phase rollback:** each phase is its own PR. Revert a single
commit if something goes sideways.

**Cross-phase risk:**
- **Circular imports** — the main switch and several extracted modules
  call `renderElement()` recursively. Resolve by passing
  `renderElement` as a function argument where the recursion happens,
  not by importing the main module from a sub-module.
- **Bundle-size regression** — moving code into more files can hurt
  tree-shaking if the new module shape pulls in extra graph edges.
  Spot-check `playground/dist` size after each phase.
- **HMR breakage** — Vite HMR sometimes misbehaves when a component
  moves between files. Restart `pnpm dev` after each phase merge
  rather than relying on hot reload.

**Smoke checklist** (run after every phase merge before declaring
done):

1. `pnpm build` from repo root — full clean build, no TS errors.
2. `pnpm test` — entire suite green.
3. `cd playground && pnpm dev` — boot to `/new-admin`; verify dashboard
   loads, resource index loads, create form works, edit form works.

---

## Out of scope (deliberately)

- **New abstractions.** No new context, no new prop shape, no new
  `RenderContext` object. Same hooks, same props, same render output.
- **Type-system tightening.** SchemaRenderer has 22 `as any` casts on
  schema-element props. Those stay. Tightening them is a separate
  effort that should NOT be bundled with file-moving — too easy to
  hide a behavior change inside "I also tightened a cast".
- **Performance.** No memoization changes, no `React.memo`
  introduction, no lazy-load splits. The point is structural clarity,
  not perf. Defer perf work until tests exist to catch regressions.
- **`SchemaRendererProps` shape.** The public API stays exactly as
  exported today.
- **Vue / Solid mirrors.** No equivalent renderer exists. If one is
  built, it lives next to this one in `schemaRenderer/` — not in
  `react/` — and is out of scope here.

---

## Phase ordering recap

| Phase | Scope | Lines moved | Risk | Effort |
|---|---|---:|---|---|
| 1 | Pure leaves + shared constants/helpers | ~400 | low | 1–2 h |
| 2 | Stateful but isolated (Alert/Section/Tabs/Wizard/Entry) | ~800 | low | 2–3 h |
| 3 | Action layer | ~1,200 | medium | 4–6 h |
| 4 | Form layer (FormRenderer + renderField) | ~700 | medium-high | 6–8 h |
| 5 | Table layer | ~1,500 | high | 8–12 h |

After phase 5, `SchemaRenderer.tsx` should be on the order of **300–500
lines** — imports, the main switch dispatching to sibling modules, the
default export, and the consumer-visible `SchemaRendererProps` type.

Phases 1 and 2 are cheap, useful, and independent — they're worth
shipping even if 3–5 never happen. The marginal value of each later
phase increases as the action / form / table layers get easier to
verify in isolation.
