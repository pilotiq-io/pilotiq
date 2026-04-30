---
name: Authorization
description: Plan #10 — Resource/Global policy methods (canViewAny/canView/canCreate/canEdit/canDelete/canAccess) + opaque user resolver
type: plan
---

# Authorization

Plan #10 from `admin-gap-audit.md`. Adds policy-style static methods to
`Resource` and `Global` so consumers can authorize per-resource access
without bolting on middleware. Pairs with `@rudderjs/auth` via an
**opaque user resolver** so pilotiq stays a runtime-zero peer of the
auth package (same shape we use for `@rudderjs/orm` via `ModelLike`).

Estimated effort: ~2 days. Touches `Pilotiq.ts`, `Resource.ts`,
`Global.ts`, `routes.ts`, `pageData.panelInfo()`, the four default page
classes, and the four `Action.create / edit / view / delete` factories.
No new package deps; no schema changes.

**Prereq:** `resource-navigation.md` ✅ DONE (Plan #9 — the nav tree we
filter is already in place).

**Companion memory:** `feedback_check_pro_on_panels_changes.md` —
verified pilotiq-pro has zero `can*` methods, so we get a clean slate.

## Why we want it

Every admin panel beyond a one-person tool needs role-based access.
Today the only gate is the panel-wide `Pilotiq.guard(req => boolean)`,
which is all-or-nothing. There's no way to say "editors can manage
Articles but only admins can manage Users" without writing custom
middleware per route, which defeats the point of a schema-driven
admin.

Filament's policy-class shape is the smallest surface that solves the
common 80%: six predicates, called by both the renderer (to hide nav,
disable buttons) and the route handlers (to 403 unauthorized POSTs).
Wire it through once, and every page / action / nav item respects it
with no per-feature plumbing.

## API

Six static methods on `Resource` (Global gets the same set minus the
list/create/delete trio). All async; all default to `true` so the
non-policy case is unchanged.

```ts
class ArticleResource extends Resource {
  static label = 'Articles'
  static model = Article

  // ── new in #10 ──
  static async canViewAny(user) { return !!user }                    // index page + nav visibility
  static async canView(user, record) { return !!user }                // view page
  static async canCreate(user) { return user?.role === 'editor' }     // create page + create action
  static async canEdit(user, record) { return user?.role === 'editor' || user.id === record.authorId }
  static async canDelete(user, record) { return user?.role === 'admin' }
  static async canAccess(user) { return !!user }                      // panel-level guard for this resource
}
```

### Method reference

| Method | Signature | Default | Where checked |
|---|---|---|---|
| `canAccess` | `(user) => bool` | `true` | All Resource routes; nav-tree inclusion |
| `canViewAny` | `(user) => bool` | `true` | `GET /:slug` (index); nav-tree fallback when `canAccess === true` |
| `canView` | `(user, record) => bool` | `true` | `GET /:slug/:id` (view) |
| `canCreate` | `(user) => bool` | `true` | `GET/POST /:slug/create`; auto-hides `Action.create` factory |
| `canEdit` | `(user, record) => bool` | `true` | `GET/POST /:slug/:id/edit`; auto-hides row+view `Action.edit` |
| `canDelete` | `(user, record) => bool` | `true` | `POST /:slug/:id/delete`; auto-hides row+view `Action.delete` |

`canAccess` is the broad "should this resource exist for this user at
all" gate — checked first in every route, and the predicate that drops
the resource from the nav tree entirely. The narrower predicates run
on top.

`Global` gets `canAccess` + `canView` + `canEdit` (no list / create /
delete).

`Page` gets `canAccess` only (custom pages are too freeform to assume a
record-level model).

### User resolver — staying decoupled from `@rudderjs/auth`

Pilotiq must not runtime-depend on `@rudderjs/auth` (same constraint
we've held for `@rudderjs/orm`; see
`project_pilotiq_orm_wiring.md`). The user object is opaque to
pilotiq — we just hand it through to `can*` callbacks.

New builder method:

```ts
import { Auth } from '@rudderjs/auth'

const adminPanel = Pilotiq.make('admin')
  .resources([ArticleResource, UserResource])
  .user(req => Auth.user())   // anything async-returning a user-or-null
```

`Pilotiq.user(fn)` stores a `(req: unknown) => Promise<unknown | null>`
on the panel config. Routes call `await pilotiq.resolveUser(req)` once
per request and forward the result into every `can*` call. When the
resolver isn't set, `resolveUser` returns `null` and every default
`can*` (which doesn't read user) still returns `true` — so the
non-auth case keeps working.

Apps using `@rudderjs/auth` will pass `req => Auth.user()`. Apps with
JWT / bearer / custom auth pass whatever resolves their user. The
resolver is never required.

### Conditional checks: existing `Pilotiq.guard()`

`Pilotiq.guard(req => bool)` (panel-wide auth gate) stays. It runs
*before* per-resource `canAccess` and short-circuits with a 401 when
unauthenticated. Plan #10 does not change its shape — it composes with
the new policy methods, it does not replace them.

## Where the checks fire

### 1. Route handlers (`routes.ts`)

Every GET / POST handler resolves the user once at the top, then calls
the right predicate before doing work:

```ts
// inside resource index handler
const user   = await pilotiq.resolveUser(req)
if (!await R.canAccess(user))   return forbidden(res, json)
if (!await R.canViewAny(user))  return forbidden(res, json)
// … rest of handler
```

`forbidden()` is a small helper that returns `403` with `{ ok: false,
error: 'Forbidden' }` for JSON requests, or a 403 HTML response for
browser navigation. POST handlers return 403 directly; we **do not
redirect to login** — that's `Pilotiq.guard()`'s job (401 →
auth-redirect via the consumer's middleware).

Insertion points across the 10 handlers in `routes.ts`:

| Route | Predicate(s) |
|---|---|
| `GET /:slug` (index) | `canAccess` + `canViewAny` |
| `POST /:slug/_action/:name` | `canAccess`; per-action `canCreate / canEdit / canDelete` based on action's record-resolution shape |
| `GET/POST /:slug/create` | `canAccess` + `canCreate` |
| `GET /:slug/:id` (view) | `canAccess` + `canView(user, record)` |
| `GET/POST /:slug/:id/edit` | `canAccess` + `canEdit(user, record)` |
| `POST /:slug/:id/delete` | `canAccess` + `canDelete(user, record)` |
| `GET/POST /:slug` (Global) | `canAccess` + `canEdit` (POST) / `canView` (GET) |
| `GET /:pageSlug` (custom) | `canAccess` |

Record-aware predicates need the record resolved first. Edit / delete /
view already load the record (or hand the id to `Resource.model`) — we
just thread it into the predicate. For the index `_action` endpoint the
resolved record (or records, for bulk) feeds in via the same
`resolveRecord` shim that already exists.

### 2. Nav-tree filter (`pageData.panelInfo()`)

`panelInfo()` already builds the nav tree from registered resources +
globals + pages (Plan #9). Add a per-item `canAccess(user)` check
during the flatten step:

```ts
// in buildNavigation()
for (const R of cfg.resources) {
  if (!await R.canAccess(user)) continue   // dropped from nav entirely
  const item: RawNavItem = { … }
  raw.push(item)
}
```

`buildNavigation` becomes user-aware: takes `pilotiq` + `user` and
threads the user through every flat-step. `panelInfo(pilotiq, req)`
gains an `req` param and resolves the user once, same as the route
handlers. Every callsite in `routes.ts` and the per-page-role data
builders (`dashboardData`, `resourceIndexData`, etc.) already passes
`req` — wiring is mechanical.

Items that fail `canAccess` simply don't appear. Items that pass
`canAccess` but fail `canViewAny` (e.g., "you can manage Users but
shouldn't see the list page") render in nav but their URL 403s — same
graceful degradation as Filament.

### 3. Default action factories

`Action.create / Action.edit / Action.view / Action.delete` (in
`src/actions/factories.ts`) already produce the standard CRUD shapes.
Today they're always-visible; in Plan #10 they auto-attach the matching
`.visible()` rule using the resource's policy:

```ts
// inside Action.create(R, baseUrl)
return Action.make('create')
  .label(`New ${R.labelSingular}`)
  .href(`${baseUrl}/create`)
  .visible(async ({ user }) => R.canCreate(user))   // auto
```

Opt-out: pass `.visible(true)` explicitly to override (the last
`.visible()` call wins, same as today).

The existing `ActionVisibilityContext` already carries `user?` —
`evaluate()` becomes async-friendly via a small refactor (see
"Async visibility" below). Row-placement actions get the per-row
record + user threaded into their visibility eval inside
`loadTableRecords`, which already stamps `_visibleActions` /
`_disabledActions` per row.

### 4. Per-page action defaults (`getHeaderActions` / `getActions`)

The default `EditPage.getActions()` returns `[Action.delete(R, base)]`
(if `R.canDelete` returned `true`). These are static-class hooks so
they evaluate once per request — but the underlying actions get the
auto-`.visible()` from #3, so the visibility check runs at
schema-resolve time per actual request and the result is correct
regardless of how the user shadows `getActions`.

## Failure modes

| Failed check | UI response | Status |
|---|---|---|
| `canAccess === false` | Item missing from nav; URL 403s | 403 (HTML or JSON) |
| `canViewAny === false` | Index URL 403s; item still in nav | 403 |
| `canView === false` | View URL 403s; row links still render | 403 |
| `canCreate === false` | "New X" action hidden; create URL 403s | 403 |
| `canEdit === false` | Edit row action hidden; edit URL 403s; save POST 403s | 403 |
| `canDelete === false` | Delete row action hidden; delete POST 403s | 403 |

We **do not** redirect 403 → login. That's a category error: 401 means
"unauthenticated, please log in", 403 means "authenticated but not
allowed." Apps that want a soft-redirect for 403 can install their own
hono error handler.

JSON responses (`Accept: application/json` — covers all SPA-dispatched
actions and form-submits) get `{ ok: false, error: 'Forbidden' }` with
status 403. The client renderer already treats non-2xx as toast
errors.

## Default action factories — auto-consult vs explicit

Default behavior:

| Factory | Auto-visible rule |
|---|---|
| `Action.create(R)` | `({ user }) => R.canCreate(user)` |
| `Action.edit(R, _, recordId)` | `({ user, record }) => R.canEdit(user, record ?? recordId-resolved)` |
| `Action.view(R, _, recordId)` | `({ user, record }) => R.canView(user, record ?? recordId-resolved)` |
| `Action.delete(R, _, recordId)` | `({ user, record }) => R.canDelete(user, record ?? recordId-resolved)` |

Opt-out by passing `.visible(true)` (or any explicit rule). The
factories check whether `_visible` / `_hidden` is already set on the
returned Action and skip auto-attachment if so. This keeps custom
visibility rules predictable.

## Async visibility refactor

`Action.evaluate()` is currently sync. Plan #10 needs async (since
`canEdit` / `canDelete` are user-defined and may hit the DB). Two
options:

1. **Make `evaluate()` async.** Touches every callsite (mostly
   `resolveSchema` + `loadTableRecords`). Both are already async, so
   the change is mechanical.
2. **Resolve the predicate eagerly at factory-call time.** Doesn't
   work — `record` isn't known yet at schema build for row actions.

Option 1. We'll bump `evaluate()` → `async evaluate()`, swallow rejects
as `visible: false`, and update the two callsites. Pre-existing sync
rules keep working (a sync function is awaited transparently).

## Out of scope

- **Per-field authorization.** Filament has `Field.visible(fn)` based
  on user; we don't ship it in #10. Add later as a focused plan if
  demand surfaces — not blocking.
- **ABAC / CASL composable rules.** No `Gate.define('articles.edit',
  fn)` registry, no policy classes registered against models. The six
  static methods on the Resource class are the policy. If users want
  composability they write helpers themselves (`if (await
  isOwner(user, record)) return true; return user.role === 'admin'`).
- **Auth-package-specific helpers.** No `pilotiq.useAuth()` shortcut, no
  `Pilotiq.policies(map)` ceremony. The `user(req => …)` resolver is
  the entire integration surface.
- **Audit logging of denied requests.** Apps using
  `@rudderjs/auth`'s gate observers already get this for free; pilotiq
  doesn't duplicate.

## Test plan

| Area | Tests |
|---|---|
| `Pilotiq.user(fn)` resolver | unset → resolveUser returns null; set → returns resolver result; throws → swallow + return null |
| Route handlers | each of the 10 handlers: 403 on canAccess fail, 403 on canViewAny/canView/canCreate/canEdit/canDelete fail, 200 when all pass; JSON vs HTML response shape |
| `panelInfo()` nav filter | resources/globals/pages with failing canAccess dropped; passing items kept in tree; user threaded through `req` |
| Action factories auto-visible | `Action.create/edit/view/delete` auto-attach visibility unless `_visible` set explicitly |
| Async `Action.evaluate()` | sync rule still works; async rule resolved correctly; throwing rule treated as `visible: false` |
| Global subset | `canAccess` + `canEdit` + `canView` work; `canCreate / canDelete / canViewAny` not exposed on Global |

Target: ~30 new tests, bringing the suite to ~515.

## Rollout

1. `Pilotiq.user(fn)` builder + `resolveUser(req)` helper.
2. Add `can*` statics to `Resource` / `Global` / `Page` with
   `true` defaults.
3. Make `Action.evaluate()` async; update `resolveSchema` +
   `loadTableRecords`.
4. Auto-attach visibility rules in `Action.create/edit/view/delete`
   factories.
5. Wire predicates into all 10 route handlers in `routes.ts`.
6. Wire `canAccess` filter into `panelInfo() / buildNavigation()`.
7. Update playground-pilotiq with one demo resource using a role-based
   policy to confirm UX end-to-end.

Each step is independently testable and ship-able; merge as one PR
because the public-API additions only stop being internal-test-only
once the route wiring lands.
