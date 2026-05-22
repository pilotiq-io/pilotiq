---
name: pilotiq-actions
description: Buttons, modal-form actions, and built-in CRUD/import/export/relation factories in pilotiq — the 4 dispatch modes, visibility/authorize layers, and per-row gating
license: MIT
appliesTo:
  - '@pilotiq/pilotiq'
trigger: adding header / row / bulk action buttons to a `Resource.table()` / page, wiring a modal-form action, customizing per-row visibility via `visible()` / `authorize()`, or using one of the `Action.*` factories (`create` / `edit` / `delete` / `replicate` / `import` / `export` / `relation*` / `bulk*`)
skip: customizing the form schema itself (use `pilotiq-fields`) or wiring a relation tab as a whole (use `pilotiq-relations`)
metadata:
  author: pilotiq
---

# Pilotiq Actions

## When to use this skill

Load when you're:

- Adding action buttons to a page — header actions, row actions, bulk actions, inline actions
- Wiring a modal-form action (`Action.make('foo').schema([Field…]).handler(ctx => …)`)
- Customizing chrome (colors, sizes, icons, tooltips, outlined / icon-only / destructive)
- Setting visibility / disabled / authorize rules — including per-row gating that re-evaluates on every list row
- Reaching for a built-in factory: `Action.create / edit / view / delete / replicate / import / export / restore / forceDelete / markAsRead / bulkDelete / bulkRestore / bulkForceDelete / bulkReplicate / bulkExport / relation*`

For the form schema *inside* an action's modal, that's `pilotiq-fields`. For the resource-side `Resource.table().recordActions([…])` wiring, this skill covers the action surface itself; `pilotiq-resource` covers when to subclass `ListPage` to override `getHeaderActions()` etc.

## Quick Reference

| Task | Open |
|---|---|
| 4 dispatch modes — `href` / `method` / `handler` / `submit`; modal-form via `.schema([…]).handler()`; `formField` for submit-button pairs | `rules/dispatch-modes.md` |
| Visibility, disabled, authorize — `ActionVisibilityContext`, per-row gating, fail-closed semantics, async predicates | `rules/visibility-and-authorization.md` |
| Built-in factories — `Action.create / .edit / .delete / .replicate / .import / .export / .relation*` plus bulk variants; chrome + visibility defaults | `rules/factories.md` |

## Key concepts (load once)

- **Every action is `Action.make(name).<setters>`.** No subclassing. The `name` is the discriminator for visibility lookups + the dispatch URL slug.
- **Four dispatch modes are mutually exclusive.** `.href(url)` = link. `.method('POST').action(url)` = form-post. `.handler(ctx => …)` = JSON dispatch via the framework's `_action/:name` route. `.submit()` = trigger the enclosing form's submit.
- **Modal-form is a flavor of handler.** Calling `.schema([Field, …])` flips an action into modal-form mode: clicking the trigger opens a Dialog with the schema as a real pilotiq form; submit fetches the action's dispatch URL with the form body.
- **Placement determines where the button mounts.** `inline` (default, in-page) / `bulk` (toolbar when rows selected) / `row` (per-row) / `header` (page header). Placement is implicit from how you pass the action — `Resource.table().recordActions([…])` are row, `.bulkActions([…])` are bulk, etc.
- **Visibility is fail-closed.** `.visible(rule)` / `.hidden(rule)` / `.disabled(rule)` / `.authorize(rule)` accept `boolean | (ctx) => boolean | Promise<boolean>`. Throwing → visibility false. `ActionVisibilityContext` carries `{ record?, records?, user? }` depending on placement.
- **Row-placement actions evaluate per row.** The framework calls each row's predicates in `loadTableRecords` and stamps `row._visibleActions: name[]` / `row._disabledActions: name[]`. The renderer filters its action strip against that stamp.
- **All non-modal handler dispatches SPA-update.** Fetch with `Accept: application/json`, drain notifications via `useToast()`, then `useNavigate(redirect)`. No page reload. Only form-post `method` actions (e.g. `Action.delete`) still use the 303-redirect path for back-compat.

## Examples

- `playground/app/Pilotiq/Articles/ArticleResource.ts` — header/row actions with built-in factories.
- `playground/app/Pilotiq/Posts/PostResource.ts` — modal-form action (`Action.make('publish').schema([…]).handler(…)`).
- `playground/app/Pilotiq/Users/UserResource.ts` — `Action.replicate` with `beforeReplicaSaved` mutator.
