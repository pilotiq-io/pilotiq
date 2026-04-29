# Actions Tier 1 — closing the API gap

Bring our `Action` API up to parity with mature admin-panel frameworks for the highest-leverage 80%. Five focused additions, all in `@pilotiq/pilotiq` core, all non-breaking on top of what shipped in Phase 3.

**Status:** ✅ DONE — all 5 steps shipped 2026-04-29. Tests went from 318 → 364.

**Depends on:** existing `Action`, `dispatchAction`, `Dialog` primitive, `validateSchema`, `coerceFormValues`, `dispatchForm` lifecycle.

**Related memory:** `project_phase_3_progress.md`.

---

## Goal

After this phase, a developer can write admin-style action code:

```ts
class ArticleResource extends Resource {
  static table(table: Table): Table {
    return table
      .columns([...])
      .recordActions([
        Action.make('feature')
          .icon('star')
          .color('primary')
          .tooltip('Feature this article')
          .visible(({ record }) => !record.featured)
          .schema([
            TextField.make('priority').required(),
          ])
          .modalHeading('Feature article')
          .modalDescription('Will appear in the home feed.')
          .handler(async ({ record, values }) => {
            await Article.update(record.id, { featured: true, priority: values.priority })
          }),
        Action.make('edit').href(`articles/:id/edit`),
        Action.make('delete').destructive().method('post').action(`articles/:id/delete`),
      ])
      .headerActions([
        ActionGroup.make('manage')
          .icon('more-horizontal')
          .actions([
            Action.make('export').handler(...),
            Action.make('archive-old').handler(...),
          ]),
      ])
      .bulkActions([
        Action.make('feature-many').handler(...),
      ])
  }
}
```

---

## Five sub-features

### 1. Table action slots

**Public API on `Table`:**

```ts
table.recordActions(actions: Action[]): this   // per-row → DropdownMenu
table.headerActions(actions: Action[]): this   // top-right
table.bulkActions(actions: Action[]): this     // shown when rows selected
```

**Internal mechanics:**

- Each slot stamps `placement` on its actions when collected (`recordActions` → `'row'`, etc.) so the existing `SchemaRenderer` segregation logic in `TableRenderer` works unchanged.
- `Table.toMeta()` continues emitting one flat `actions` array under `_extra` (placement still distinguishes them server-side).
- `Action.placement()` stays callable for inline-in-schema usage (`Card`, `Section`, `Heading.actions`).

**Files:**
- `packages/pilotiq/src/elements/Table.ts` — three new builder methods.
- `packages/pilotiq/src/Resource.ts` — `defaultPages` + `ListPage.getRowActions`/`getHeaderActions` already build action lists; switch them to the new slots so the default `create`/`edit`/`delete` injection lands in `headerActions`/`recordActions`.
- Tests: `Table.test.ts` — slot stamps placement.

### 2. Form-modal actions (the meat)

**Public API:**

```ts
Action.make('name')
  .schema([Field, ...])             // form fields collected in modal
  .fillForm((ctx) => Record)        // optional pre-fill (defaults to {})
  .modalHeading(string | callable)
  .modalDescription(string | callable)
  .modalSubmitLabel(string)         // default: action label
  .modalCancelLabel(string)         // default: 'Cancel'
  .modalIcon(string)
  .modalWidth('sm'|'md'|'lg'|'xl')  // default: 'md'
  .slideOver(bool)                  // optional side-panel variant
  .handler(({ record, records, values, request }) => ...)
```

**Request flow:**

1. **Render time** — server emits `ActionMeta.modal = { schema, heading, description, submitLabel, cancelLabel, icon, width, slideOver }` alongside existing `dispatchUrl`. Schema is resolved (server walks `.schema([...])` through `resolveSchema`) so the client gets `ElementMeta[]`.
2. **Click** — `SchemaRenderer` opens a `<Dialog>` with a `<form onSubmit>` rendering the resolved schema via the existing field-renderer registry.
3. **Submit** — client builds `FormData` → POST to `dispatchUrl`. Body shape: `{ ids: [...], <fieldName>: <value>, ... }`. Existing `parseActionBody` handles this; `values` already carries the rest.
4. **Server** — `dispatchAction` gains a new step BEFORE invoking the handler:
   - If the action has a schema, run `validateSchema(action.getSchema(), input.values)`.
   - On error → return `{ ok: false, errors: { name: string[] } }` with HTTP 422; route re-renders the page with the dialog's errors stamped via a per-action error map in `viewProps`.
   - On success → `coerceFormValues(values)` (so dates/numbers/booleans/json are typed) before passing to handler.
5. **Handler** receives `ctx.values` already validated + coerced.

The handler receives `ctx.values` populated with the dialog's collected form data.

**Confirmation modals are now a degenerate case:** `.requiresConfirmation()` (alias for current `.confirm()`) is a form modal with **no schema** — same Dialog, same submit pipeline, just no body fields. We fold the existing `ConfirmActionDialog` into the new general dialog.

**Files:**
- `packages/pilotiq/src/actions/Action.ts` — new builder methods + getters; `ActionMeta` gains `modal?: ActionModalMeta`.
- `packages/pilotiq/src/elements/dispatchAction.ts` — schema validation + coercion before handler; new `DispatchActionFailure` shape includes `errors?: Record<string,string[]>`.
- `packages/pilotiq/src/routes.ts` — `_action/:name` POST route returns 422 + errors when validation fails; route stamps `_actionErrors[actionName]` on `viewProps` for re-render.
- `packages/pilotiq/src/react/SchemaRenderer.tsx` — new `ActionModalDialog` component replaces three `ConfirmActionDialog` callsites; renders schema via existing `renderField` registry; collects FormData; submits via fetch + 303-redirect handling.
- Tests: `dispatchAction.test.ts` — validation, coercion, error response shape; `Action.test.ts` — modal builder methods.

### 3. Trigger variants & cosmetics

**Public API:**

```ts
Action.make('x')
  .color('primary' | 'destructive' | 'success' | 'warning' | 'info' | 'ghost')
  .size('sm' | 'md' | 'lg')
  .tooltip(string)
  .outlined(bool)
  .iconButton()                  // icon-only
  .badge(string | number).badgeColor(string)
```

**Internal mechanics:**

- `ActionMeta` gains `color`, `size`, `tooltip`, `outlined`, `iconOnly`, `badge`, `badgeColor`.
- `destructive` becomes sugar for `color: 'destructive'` (kept for back-compat — `isDestructive()` returns `color === 'destructive'`).
- `SchemaRenderer.renderAction` maps to existing `Button` variants + wraps in `Tooltip` primitive when `tooltip` is set.

**Files:** `Action.ts`, `SchemaRenderer.tsx`. Trivial.

### 4. Conditional visibility

**Public API:**

```ts
Action.make('x')
  .visible(bool | (ctx) => bool)
  .hidden(bool | (ctx) => bool)
  .disabled(bool | (ctx) => bool)
  .authorize(string | (ctx) => bool)   // policy-style alias
```

**Evaluation context:**

```ts
interface ActionVisibilityContext {
  record?: unknown      // present in row context
  records?: unknown[]   // present in bulk context
  user?: unknown        // future: when @rudderjs/auth wires in
}
```

**Internal mechanics:**

- Evaluation runs **server-side at render time** (in `loadTableRecords` / `dispatchPageData`), not on the client — same approach as field `hideWhen`/`showWhen`. Hidden actions are filtered out before serialization.
- `disabled` ships through to `ActionMeta.disabled`; client renders the button as `aria-disabled` and skips dispatch.
- For row actions, evaluation runs once per row (so `visible(({record}) => !record.archived)` works).

**Files:** `Action.ts`, `dispatchAction.ts`, `Resource.ts` table-record build path.

### 5. ActionGroup

**Public API:**

```ts
ActionGroup.make('manage')
  .label('More')
  .icon('more-horizontal')
  .tooltip('More actions')
  .actions([Action, Action, ActionGroup, ...])  // nested groups OK
```

**Internal mechanics:**

- New class `ActionGroup extends Element`. `getType()` → `'actionGroup'`. `_children: Action[]`.
- Renders as a `DropdownMenu` (existing primitive) — same one row actions already use.
- Lives wherever `Action` lives (header slot, inline schema, etc.). Bulk slot doesn't accept groups (degenerate UX).
- Dropdown items inherit visibility evaluation from their `Action` children; the group itself is hidden if all children are hidden.

**Files:** `packages/pilotiq/src/actions/ActionGroup.ts` + `index.ts` export, `SchemaRenderer.tsx` `renderElement` switch case.

---

## Sequencing

Land in this order — each step is independently shippable & tested:

1. **Slots** (~2h) — refactor with no new behavior. Smallest blast radius.
2. **Form-modal actions** (~1.5d) — biggest change. Lock the API + dispatch flow first; renderer + tests follow.
3. **Variants & tooltip** (~3h) — pure additive cosmetics.
4. **Visibility** (~4h) — needs careful thought about server-side eval but the evaluation point is well-known.
5. **ActionGroup** (~3h) — uses existing DropdownMenu, mostly serialization plumbing.

Total: ~3 days of focused work. Each step gets its own commit on `main` (per "small cleanups commit directly" memory — none of these are individually >200 LOC except form-modals which warrants its own branch+PR).

---

## What we're NOT shipping in Tier 1

These appear in mature admin frameworks; we're explicitly punting:

- `keyBindings([...])` — keyboard shortcuts. Nice-to-have, not core.
- `successNotification` / `failureNotification` — needs a Toast primitive we don't have. Tier 2.
- `mountUsing` / `before` / `after` lifecycle hooks beyond the handler. Add when a real use-case appears.
- `actionJs` — client-side handlers without server roundtrip. We have `.href()` for navigation; deferred until a use case shows up.
- `rateLimit` — server-side rate limiting. Needs framework wiring; not core to the action API.
- `replicate` / `forceDelete` / `restore` — "smart" CRUD action presets. Free once form-modals + ORM helpers exist; Tier 2.
- `import` / `export` — full pipelines requiring queue infrastructure. Tier 3, separate plan doc.
- `labeledFrom(breakpoint)` — responsive label visibility. Cosmetic; punt.

---

## Migration impact

- **Existing `.confirm(string|object)` and `.method()`/`.action()` and `.handler()` keep working unchanged** — slots and form-modals are additive.
- **`Heading.actions([...])` stays as the page-header submit-button mechanism** — Save buttons in `CreatePage`/`EditPage` use it; not affected by Table slots.
- **`reference_panels_to_pilotiq_migration.md`** migration guide gets a new section on action slots once #1 lands. Form-modal actions get their own migration paragraph (panels had no equivalent).

---

## Tests delta

Roughly +25 tests across:
- `Table.test.ts` (slot APIs)
- `Action.test.ts` (modal/visibility/variants builder methods + serialization)
- `ActionGroup.test.ts` (new file)
- `dispatchAction.test.ts` (validation/coercion path, errors response shape, visibility filter)

Goal: ~350 tests at end of Tier 1 (up from current 326).
