---
name: pilotiq-resource
description: Defining CRUD-managed entities in a pilotiq admin panel — Resource class, page base classes (ListPage/CreatePage/EditPage/ViewPage), and authorization
license: MIT
appliesTo:
  - '@pilotiq/pilotiq'
trigger: creating or editing a `Resource` subclass under `app/Pilotiq/`, customizing one of its four page roles (List/Create/Edit/View), or wiring authorization rules
skip: working in a non-pilotiq route handler that just reads/writes a model directly — that's an `@rudderjs/router` concern
metadata:
  author: pilotiq
---

# Pilotiq Resource

## When to use this skill

Load when you're:

- Creating a new `Resource` subclass that backs admin CRUD pages for an entity (`Article`, `User`, `Product`, …)
- Customizing one of the four auto-generated pages — overriding `getHeader()`, `getFormActions()`, `beforeCreate()`, `afterUpdate()`, etc. on `ListPage` / `CreatePage` / `EditPage` / `ViewPage`
- Wiring authorization — `canAccess` / `canView` / `canCreate` / `canEdit` / `canDelete` statics, or the `Pilotiq.user()` resolver

For just-the-fields work (no page customization), `pilotiq-fields` is the more focused skill. For relation-backed tabs and nested data, `pilotiq-relations`.

## Quick Reference

| Task | Open |
|---|---|
| Define a Resource — `static label / icon / model / form / table / detail`, navigation metadata, soft deletes | `rules/defining-resources.md` |
| Customize page roles — when to subclass `ListPage` / `CreatePage` / `EditPage` / `ViewPage`, override hooks, wizard create | `rules/page-overrides.md` |
| Authorization — `canX` static predicates, `Pilotiq.user()`, fail-closed posture, per-record gates | `rules/authorization.md` |

## Key concepts (load once)

- **Everything is `static`.** `Resource.form(form: Form): Form`, `Resource.table(table: Table): Table`, `Resource.canEdit(user, record): bool` — the framework calls these on the class itself. Don't instantiate.
- **The framework auto-generates 4 pages from one Resource:** list, create, edit, view. Routes: `${base}/${slug}` (list), `${base}/${slug}/create`, `${base}/${slug}/:id`, `${base}/${slug}/:id/edit`. URL slug auto-derives from class name (`ArticleResource` → `articles`); override via `static override slug = '…'`.
- **`static model = SomeModel` auto-fills CRUD.** When set, the framework auto-wires `Form.save`, `Form.loadRecord`, `Resource.deleteRecord`, and `Table.records` — no manual ORM plumbing. Anything you set explicitly still wins.
- **Page base classes only matter if you override hooks.** The framework ships sensible defaults — subclass `ListPage` / `CreatePage` / `EditPage` / `ViewPage` only when you need `getHeaderActions`, `getFormActions`, `beforeCreate`, `afterUpdate`, etc. Bare resources don't need page subclasses at all.
- **Authorization is fail-closed.** Predicates default to `true`; the framework runs them through `safePolicy()` which catches throws and treats them as `false` (403). `Pilotiq.user(req => …)` is the resolver — it returns whatever shape your auth layer hands you; predicates receive that opaque type.
- **Per-record gates run server-side per row.** On the list page, `canView` / `canEdit` / `canDelete` evaluate per row and stamp `_visibleActions` / `_disabledActions`. Predicates with a `record` arg are record-aware; bare `canCreate(user)` doesn't see a record.

## Setup once at the panel

```ts
// app/Pilotiq/AdminPanel.ts
import { Pilotiq } from '@pilotiq/pilotiq'

export const adminPanel = Pilotiq.make('Admin')
  .path('/admin')
  .user(async (req) => req.session?.user ?? null)
  .resources([ArticleResource, UserResource])
  .pages([AnalyticsPage])
```

The user resolver returns `null` for anonymous; predicates that need a user must guard for that (or use `Pilotiq.guard()` to redirect to a sign-in route first).

## Examples

- `playground/app/Pilotiq/Articles/ArticleResource.ts` — minimal Resource using `static model` auto-fill.
- `playground/app/Pilotiq/Posts/PostResource.ts` — folder-per-resource layout with split `Pages/`, `Schemas/`, `RelationManagers/`.
- `playground/app/Pilotiq/Users/UserResource.ts` — authorization patterns (`canAccess` / `canEdit` / `canDelete`).
