# Authorization

Pilotiq authorization is `Pilotiq.user(resolver)` + per-Resource `can*` static predicates. Predicates default to `true`; the framework runs them through a fail-closed wrapper (throws or rejected promises become `false`). Routes return 403 JSON or HTML when any predicate fails; the sidebar drops items the user can't reach.

## Wiring the user

```ts
Pilotiq.make('Admin')
  .path('/admin')
  .user(async (req) => req.session?.user ?? null)
  .resources([ArticleResource])
```

The resolver runs once per request. It can return any shape — pilotiq treats the user as opaque and just hands it to your predicates. Common shapes:

```ts
.user(async (req) => {
  const sessionId = req.session?.userId
  if (!sessionId) return null
  return User.find(sessionId)              // returns a Model instance or null
})

// Or returning a plain object
.user(async (req) => {
  if (!req.session?.user) return null
  return { id: req.session.user.id, role: req.session.user.role, name: req.session.user.name }
})
```

Returning `null` is the anonymous case. `canAccess(null)` is your gate.

## `Pilotiq.guard()` vs `canAccess`

The two layers are distinct:

- **`Pilotiq.guard(req => …)`** — 401 layer. Runs before any route handler. Use for "must be signed in to even visit this panel."
- **`Resource.canAccess(user)`** — 403 layer. Per-resource. Use for "this user is signed in, but doesn't have permission for this resource."

```ts
Pilotiq.make('Admin')
  .path('/admin')
  .guard(async (req) => {
    if (!req.session?.user) return Pilotiq.redirect('/login?next=/admin')
    return true                            // pass through to canAccess
  })
  .user(async (req) => req.session?.user)
  .resources([ArticleResource])
```

`Pilotiq.redirect(url)` is the return-value escape hatch — `guard` returns either `true` (pass), `false` (403), or a `Pilotiq.redirect(...)` payload.

## Resource predicates

Six async predicates on `Resource`, all defaulting to `true`:

```ts
class ArticleResource extends Resource {
  // Panel-level — can the user see this resource in the sidebar / list at all?
  static override async canAccess(user) {
    return Boolean(user)                   // any signed-in user
  }

  // List page — can the user see ANY of these records?
  static override async canViewAny(user) {
    return Boolean(user)
  }

  // View / edit page — can the user see THIS record?
  static override async canView(user, record) {
    return user.id === record.authorId || user.role === 'admin'
  }

  // Create page — can the user create a new record?
  static override async canCreate(user) {
    return user.role !== 'reader'
  }

  // Edit page — can the user edit THIS record?
  static override async canEdit(user, record) {
    return user.id === record.authorId
  }

  // Delete handler — can the user delete THIS record?
  static override async canDelete(user, record) {
    return user.role === 'admin'
  }
}
```

Soft-delete variants:

```ts
class ArticleResource extends Resource {
  static override softDeletes = true

  // Defaults to true
  static override async canRestore(user, record) {
    return user.role === 'admin'
  }

  // Defaults to delegating to canDelete (so canDelete being denied also denies force)
  static override async canForceDelete(user, record) {
    return user.role === 'admin'
  }
}
```

## RelationManager predicates

`RelationManager` has its own seven predicates — manager-scoped, not Resource-scoped:

```ts
class CommentsRelationManager extends RelationManager {
  static override relationName = 'comments'

  static override async canViewAny(user, parentRecord) { return true }
  static override async canView(user, child, parentRecord) { return true }
  static override async canCreate(user, parentRecord) { return Boolean(user) }
  static override async canEdit(user, child, parentRecord) { return user.id === child.authorId }
  static override async canDelete(user, child, parentRecord) { return user.role === 'admin' }

  // M2M only
  static override async canAttach(user, parentRecord)  { return Boolean(user) }
  static override async canDetach(user, child, parentRecord) { return user.role === 'admin' }
}
```

If a manager doesn't override a predicate, the framework falls through to the related `Resource`'s matching predicate (via reference-equality check on the prototype). `canAttach` / `canDetach` are manager-only and do NOT fall through — attach/detach are pivot operations, not record operations.

## Per-record evaluation on list pages

On the list page, `canView` / `canEdit` / `canDelete` evaluate PER ROW server-side before render. The framework stamps each row with `_visibleActions` and `_disabledActions` arrays. Row-action factories (`Action.edit(R, base)`, `Action.delete()`) auto-consult these stamps — buttons only render for permitted rows.

The list itself doesn't pre-filter — it shows the rows your `canViewAny` allowed; per-record reads at view/edit time enforce the finer gate. If you need pre-filtering (so unauthorized records never appear at all), override `Resource.query()`:

```ts
class ArticleResource extends Resource {
  static override query(user) {
    if (!user) return Article.query().whereRaw('1 = 0')   // anonymous: no rows
    if (user.role === 'admin') return Article.query()
    return Article.query().where('authorId', user.id)
  }
}
```

`Resource.query(user)` is called by list / search / find-by-PK paths. Soft-delete restore intentionally bypasses (you need to see trashed rows to restore them).

## Page-level authorization

Custom (non-resource) pages have one `canAccess` predicate:

```ts
class AnalyticsPage extends Page {
  static override slug = 'analytics'

  static override async canAccess(user) {
    return user?.role === 'admin'
  }
}
```

Record sub-pages can also gate per-record:

```ts
class AuditLogPage extends Page {
  static override slug = 'audit'

  static override async canAccess(user, record) {
    return user?.id === record.authorId || user?.role === 'admin'
  }
}
```

## Fail-closed posture

The framework runs every predicate through `safePolicy()`:

```ts
async function safePolicy(fn, user, record?) {
  try {
    const result = await fn(user, record)
    return Boolean(result)                 // anything truthy → allowed
  } catch (err) {
    console.error('[pilotiq] policy threw:', err)
    return false                            // throws → denied
  }
}
```

What this means for your code:

- **Return `true` / `false` (or a Promise of). Don't throw to deny** — throwing logs and denies, but the log noise is for misconfiguration not deliberate denial.
- **Bare `return user.role === 'admin'`** crashes when `user` is `null`. Either guard up-front (`if (!user) return false`) or use optional chaining (`user?.role === 'admin'`).
- **Async predicates are fine** — the framework awaits each in parallel where possible (per-row eval) and serially where needed (gate chains).

## Authorization vs visibility

Predicates control whether the route fires. `Action.visible(...)` / `Field.visible(...)` / `Section.visible(...)` control UI presence regardless of authorization. Two layers — use both:

```ts
// Authorization: only admins can hit POST /articles/:id/publish
class ArticleResource extends Resource {
  static override async canPublish(user, record) { return user.role === 'admin' }
}

// Visibility: hide the Publish button on already-published rows (regardless of role)
Action.make('publish')
  .visible(({ record }) => record.status === 'draft')
  .handler(...)
```

A button you visibility-hide that the user could still POST to directly stays accessible. Use authorization predicates for security; visibility for UX.

## Action authorization

Actions support `.visible(rule)`, `.hidden(rule)`, `.disabled(rule)`, and `.authorize(rule)`:

- **`.visible()` / `.hidden()`** — UI presence. Server still routes the dispatch.
- **`.disabled()`** — UI present but greyed; the dispatch handler should still re-check.
- **`.authorize(rule)`** — authoritative server-side gate. Action factory wraps it so dispatch returns 403 when it fails.

```ts
Action.make('approve')
  .icon('check')
  .visible(({ record }) => record.status === 'pending')
  .authorize(({ user }) => user.role === 'moderator')
  .handler(async (ctx) => {
    await ctx.record.approve()
    return { notify: Notification.success('Approved') }
  })
```

`visible` and `authorize` look similar but are different layers — `visible` is UI, `authorize` is the route gate. For actions that change state (publish, delete, archive), set both.

## Common pitfalls

- **Returning a Model instance from `canX`** — `safePolicy` calls `Boolean(result)`, and a Model instance is always truthy. Use `Boolean(record?.id)` or compare an explicit field.
- **Forgetting `static override`.** Without `override`, you silently create instance methods that never run — the framework calls statics on the class.
- **`canEdit` without a record arg.** The framework calls `canEdit(user, record)`; defining `canEdit(user)` works but ignores the record. Use both args for record-aware gates.
- **`canAccess` returning a Promise that rejects** — fail-closed treats rejections as `false`. If you want a clearer error for misconfiguration, log inside `canAccess` and return false.
- **Using `Resource.query()` for security AND for list scoping** — if you scope rows in `query()`, also gate `canView(user, record)` for direct deep links. The row not appearing in `query()` doesn't stop a user from typing `/admin/articles/:hidden-id`.
- **Anonymous `null` users**. `canAccess(null)` is the standard signature for "is sign-in required?". Returning `Boolean(user)` is the most common predicate body.
