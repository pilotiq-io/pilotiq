# Visibility & Authorization

Every action exposes four conditional setters. They differ in *intent*; all use the same predicate shape.

```ts
type VisibilityRule =
  | boolean
  | ((ctx: ActionVisibilityContext) => boolean | Promise<boolean>)

type ActionVisibilityContext = {
  record?:  Record               // present on row-placement
  records?: Record[]             // present on bulk-placement
  user?:    OpaqueUser | null    // from Pilotiq.user()
}
```

## The four setters

```ts
Action.make('publish')
  .visible(({ record, user }) => !record.publishedAt && user?.role === 'editor')
  .hidden(({ record }) => record.archived)
  .disabled(({ record }) => record.locked)
  .authorize(async ({ user, record }) => await canPublish(user, record))
```

- **`.visible(rule)`** — mounts the button only when rule resolves truthy. Default: visible.
- **`.hidden(rule)`** — sugar inverse of `visible`. Last write wins; if you set both, the more recent setter is the active one.
- **`.disabled(rule)`** — renders the button but as a non-interactive (greyed) chip. The user sees it exists but can't fire it.
- **`.authorize(rule)`** — semantically equivalent to `.visible()` but reads as a permission gate at call sites. Use when the predicate is policy-shaped (`canEdit`, `canDelete`).

`visible` + `authorize` both gate *presence*. Composing them is fine; both must resolve truthy. Default is `true` for both, so omitting them leaves the action always-visible.

## Fail-closed semantics

Predicates that throw or reject → button hides (or for `.disabled`, treats as disabled-true). This is the **opposite** of the layout `visible()` posture in `pilotiq-fields`, which fails *open* for in-progress data safety. Actions are operations, not data — silently hiding a bad button is safer than rendering one with broken logic.

```ts
Action.make('publish')
  .visible(async ({ record }) => {
    if (!record) throw new Error('record missing')   // silently hides; no toast, no log
    return record.status === 'draft'
  })
```

If you want errors loud, log inside the predicate yourself. Don't expect a framework-level toast.

## Per-row gating on tables

Row-placement actions evaluate predicates **per row** during `loadTableRecords`. The framework:

1. Walks the registered row actions (from `Resource.table().recordActions([…])` or page-override `getRowActions()`).
2. Filters to actions with at least one conditional rule (`visible` / `hidden` / `disabled` / `authorize`).
3. Calls each rule in parallel via `Promise.all` for each row.
4. Stamps the row with `_visibleActions: name[]` (names that resolved truthy on visible/authorize) and `_disabledActions: name[]` (names that resolved truthy on disabled).
5. The renderer's `renderRowActions` filters its strip against `_visibleActions` and applies disabled styling per `_disabledActions`.

**Performance** — every conditional rule × every row × every page load. Heavy predicates (DB queries, network calls) inside `visible()` will dominate list-page latency. Prefer reading from the row record itself when possible:

```ts
// Cheap — reads from the record server-side stamped fields
.visible(({ record }) => record.status === 'draft')

// Expensive — DB query per row
.visible(async ({ record }) => await UserPolicy.canEdit(user, record))
```

If you need expensive checks, stamp the result on the row via `Column.formatStateUsing` upstream and read from `record._formatted[col]` instead.

## Bulk-placement gating

Bulk-action predicates receive `records: Record[]` instead of `record`. They evaluate ONCE per page render (against the rendered row set), not per row:

```ts
Action.make('bulkDelete')
  .label('Delete selected')
  .color('destructive')
  .handler(async ({ records, user }) => {
    for (const r of records) {
      if (!await canDelete(user, r)) continue
      await Article.delete(r.id)
    }
    return { notify: { title: `Deleted ${records.length}`, kind: 'success' } }
  })
  .visible(({ user }) => user?.role === 'editor')      // gates the bulk button
```

For *per-row* exclusion inside a bulk handler, the convention is: iterate `records` in the handler, run the per-row predicate yourself, skip / accumulate errors. The framework doesn't pre-filter `records` against row-side predicates — the bulk button either shows or doesn't, and the handler owns row-level safety.

## Composing with Resource policies

Resource statics (`canView` / `canEdit` / `canDelete` / `canCreate` etc.) return `boolean | Promise<boolean>` against `(user, record?)`. Built-in factories (`Action.delete`, `Action.edit`, `Action.replicate`) auto-attach a `.visible()` rule that consults the matching policy:

```ts
// Resource
class ArticleResource extends Resource {
  static async canDelete(user, record) {
    return user?.role === 'editor' && !record.locked
  }
}

// page-override row actions
Action.delete(ArticleResource, base, row.id)
// equivalent to: Action.make('delete').method('POST').action(...).visible(({ record, user }) => ArticleResource.canDelete(user, record))
```

Override the auto-attach by setting `.visible(...)` explicitly — your setter wins.

## Async + parallel

All four predicates may be `async`. Per-row eval runs every row's predicates in parallel via `Promise.all`. Don't fan-out further inside a predicate — each row already pays one round-trip if you go async. Batch reads upstream if you need them.

## Pitfalls

- **`hidden(true)` does NOT permanently hide.** It's just the inverse of `visible(true)`. To permanently disable an action conditionally on config rather than data, hide it at the schema-builder level (don't include it in `recordActions([…])` at all).
- **`disabled(true)` still POSTS if you mount it elsewhere.** The disabled flag is purely chrome. The action's dispatch URL is still live server-side — if a user crafts the POST manually, the handler still fires. Always gate inside the handler too for security.
- **Predicates can see `record` as `undefined`** when an action is placed in a context that doesn't have a record (e.g. inline placement on a non-row page). Guard with `if (!record) return false` or use `?.` chaining.
- **`user` may be `null`** when no user resolver runs or the resolver returns null. Predicates that need a user must guard.
- **Don't read mutable state in predicates** (counter increments, request-scoped caches). They run multiple times per render in parallel — the same predicate may fire 5× concurrently for 5 rows.

## See also

- `dispatch-modes.md` — what the button does when allowed to fire.
- `factories.md` — built-in factories auto-attach visibility rules; this rule covers the manual setter form.
- `pilotiq-resource/rules/authorization.md` — Resource-level `can*` policies that feed factory auto-visibility.
