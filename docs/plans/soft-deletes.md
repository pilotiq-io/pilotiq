---
name: Soft deletes
description: Plan #13 — Resource.softDeletes opt-in + TrashedFilter + Restore/ForceDelete actions on top of the rudder ORM soft-delete primitives
type: plan
---

# Soft deletes

Plan #13 from `admin-gap-audit.md`. Wires the existing `@rudderjs/orm`
soft-delete primitives (`Model.softDeletes`, `withTrashed / onlyTrashed`,
`Model.restore`, `Model.forceDelete`, `instance.trashed()`, `restoring /
restored` events) into pilotiq Resources so admin pages get **TrashedFilter
+ Restore + ForceDelete** with a single `Resource.softDeletes = true` flag.

Estimated effort: ~1 week. Touches `Resource.ts`, `orm/modelDefaults.ts`,
`pageData.ts`, `routes.ts`, `filters/`, `actions/Action.ts`, the four default
page classes, and the playground demo. No new package deps; no schema
changes inside pilotiq (the Prisma migration that adds `deletedAt` is the
app's responsibility).

**Status:** ✅ DONE 2026-05-01. All 9 steps closed in a single autonomous session. Tests 834 → 885 (+51).

> **Was this blocked?** Phase-3 memory previously claimed Plan #13 was
> "blocked on `@rudderjs/orm` soft-delete support." That note was stale.
> Verified 2026-05-01: rudder ships the full soft-delete surface. See
> "Verified rudder primitives" below.

## Verified rudder primitives

Spot-checked against `rudder/packages/orm/src/index.ts` and
`rudder/packages/orm-prisma/src/index.ts`:

| Surface | Path | Status |
|---|---|---|
| `Model.softDeletes = false` opt-in flag | `orm/src/index.ts:399` | ✅ |
| `Model.restore(id)` static | `orm/src/index.ts:831` | ✅ |
| `Model.forceDelete(id)` static | `orm/src/index.ts:841` | ✅ |
| `instance.trashed()` | `orm/src/index.ts:1078` | ✅ |
| `restoring` / `restored` lifecycle events | `orm/src/index.ts:110, 126` | ✅ |
| `delete()` writes `deletedAt` when `softDeletes = true` | `orm/src/index.ts:584, 619` | ✅ |
| QueryBuilder `withTrashed()` / `onlyTrashed()` | `orm-prisma/src/index.ts:85,86` | ✅ |
| QueryBuilder `restore(id)` / `forceDelete(id)` | `orm-prisma/src/index.ts:202, 206` | ✅ |
| Default-scope `WHERE deletedAt IS NULL` injected by query | `orm-prisma/src/index.ts:124` | ✅ |

Pilotiq has zero work on the rudder side. Everything below is pilotiq-side
plumbing.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. `Resource.softDeletes` opt-in | ✅ DONE 2026-05-01 | `static softDeletes = false` + `static deletedAtColumn = 'deletedAt'` on `Resource`. Threads into routes / Action factories / TrashedFilter auto-inject. |
| 2. `ModelLike` soft-delete contract | ✅ DONE 2026-05-01 | Added optional `restore?(id)` / `forceDelete?(id)` to `ModelLike`; `withTrashed?()` / `onlyTrashed?()` to `ModelQuery`. Boot-time check throws a clear error when `Resource.softDeletes = true` but rudder side is missing them. |
| 3. `TrashedFilter` | ✅ DONE 2026-05-01 | `filters/TrashedFilter.ts` — three-state (active / withTrashed / onlyTrashed). Auto-injected via `applyTableDefaults` when `R.softDeletes = true` and the user hasn't added one. Renders as `'select'` kind so existing renderer handles it. 12 tests. |
| 4. Authorization predicates | ✅ DONE 2026-05-01 | `static async canRestore(user, record)` (default `true`) + `static async canForceDelete(user, record)` (default delegates to `canDelete` via `this.canDelete(user, record)`). Override-detection via reference equality matches the Plan #11 pattern. 4 tests. |
| 5. Restore / force-delete routes | ✅ DONE 2026-05-01 | Two POST routes registered only when `R.softDeletes = true`: `POST /:slug/:id/restore`, `POST /:slug/:id/force-delete`. Lookup via `query.withTrashed().where(pk, id).paginate(1, 1)` to bypass default scope. Two-tier auth (canAccess + canRestore/canForceDelete). JSON + 303 paths. 10 tests. |
| 6. `Action.restore` / `Action.forceDelete` factories | ✅ DONE 2026-05-01 | New factories mirroring `Action.delete` shape. Auto-visibility: restore/forceDelete visible only on trashed rows; delete auto-hides on trashed rows when `softDeletes = true`. Custom `deletedAtColumn` honored. 14 tests. |
| 7. Default page wiring | ✅ DONE (no-op) 2026-05-01 | Filament-style explicit-actions convention preserved (per `feedback_filament_explicit_actions.md`); default `getRowActions / getActions` stay returning `[]`. Users wire all four actions explicitly via `recordActions([…])`; per-row visibility from step 6 filters to the right pair. Documented in the guide. |
| 8. Bulk variants | ✅ DONE 2026-05-01 | `Action.bulkDelete / bulkRestore / bulkForceDelete` factories — handler-style, iterate `ctx.records`, run policy per-row, call `R.deleteRecord` / `R.model.restore` / `R.model.forceDelete`. Reuses existing `_action/:actionName` route — no new routes. Notification reports succeeded count. 7 tests. |
| 9. Playground demo | ✅ DONE 2026-05-01 | `playground-pilotiq` `PostResource.softDeletes = true` + four explicit row actions + three bulk actions. Rudder `Post` model gets `static softDeletes = true` + `deletedAt!: Date \| null`. `deletedAt DateTime?` mirrored across both playgrounds' `app.prisma`. (Run `pnpm exec prisma db push --schema prisma/schema` from each playground to apply.) |
| 10. Tests | ✅ DONE 2026-05-01 | 51 new tests across `Resource.test.ts` (8), `TrashedFilter.test.ts` (12), `routes.test.ts` (10), `Action.test.ts` (21). Total 834 → 885. |
| 11. Docs | ✅ DONE 2026-05-01 | `docs/guide/soft-deletes.md` (canonical guide: opt-in two-sided, URLs, per-row visibility table, authorization, custom column, bulk patterns, failure modes, out-of-scope). `CLAUDE.md` extended with `Resource.softDeletes` + soft-delete routes + filter. `admin-gap-audit.md` Plan #13 flipped to ✅. |

**Tests at start:** 834/834. Build clean.
**Tests at completion:** 885/885 (+51 — exceeded the +25-30 target because we covered visibility/per-row/bulk paths more thoroughly than planned).

## Why we want it

Soft-deletes are the single most common admin-table feature we still lack.
Three concrete frictions today:

1. **Accidental deletes are permanent.** No undo. Power users want a 30-day
   buffer; ops users want a "trash" view they can sweep weekly.
2. **Audit trails break on hard delete.** Foreign keys to deleted rows go
   stale; downstream reports show "Unknown user" for legitimate
   activity. Soft-delete keeps the row queryable from `withTrashed()`
   contexts (audit log, exports) while hiding it from the default scope.
3. **Cascade-restore is the killer.** Soft-delete a User → their Posts
   stay (the manager scopes default-active, so they look gone) → restore
   the User → Posts return automatically. No data backfill, no migration
   dance.

Composes with already-shipped features:

- **Authorization (#10):** `canRestore / canForceDelete` plug into the
  same `safePolicy` pipeline as `canDelete`. Defaults `true`; fail-closed
  on throws.
- **Per-row server-side eval (`feedback_per_row_server_eval_convention.md`):**
  trashed-row visibility is just another `_visibleActions` lookup at
  render time. No client-side branching.
- **Relations (#11):** when a parent is soft-deleted, manager queries
  return its (still-live) children by default. Users wanting "show me
  posts of trashed users too" pass `?trashed=withTrashed` on the manager
  list URL. Free composition — no manager-level changes.
- **Cmd+K palette (#12):** `searchAllResources` already defers per-resource
  `getGlobalSearchQuery` — soft-delete adds a default `WHERE deletedAt IS NULL`
  via `R.model.query()` and trashed rows naturally drop out. No code
  changes; verify in step 9.

## API

### `Resource.softDeletes`

```ts
class PostResource extends Resource {
  static label = 'Posts'
  static model = Post

  // ── new in #13 ──
  static softDeletes = true

  static async canRestore(user, record)     { return user?.role === 'editor' }
  static async canForceDelete(user, record) { return user?.role === 'admin' }
}
```

That's the entire opt-in. Default page wiring + filter + actions all flow
from the flag.

### `ModelLike` additions

```ts
interface ModelLike {
  // existing surface unchanged
  find(id): Promise<unknown>
  query(): ModelQuery
  // ...

  // new (optional — default falls back to query().forceDelete / restore)
  restore?(id: string | number):     Promise<unknown>
  forceDelete?(id: string | number): Promise<void>
}

interface ModelQuery {
  // existing surface unchanged
  where(...): this
  paginate(...): Promise<...>
  // ...

  // new (optional — TrashedFilter checks for them, no-ops otherwise)
  withTrashed?(): this
  onlyTrashed?(): this
}
```

Both sides are optional — pilotiq detects support at runtime. When a user
sets `R.softDeletes = true` but the model lacks the methods, pilotiq throws
a clear boot-time error pointing at the rudder upgrade.

### `TrashedFilter`

```ts
import { TrashedFilter } from '@pilotiq/pilotiq'

class PostResource extends Resource {
  static softDeletes = true

  static table(table) {
    return table
      .columns([...])
      // No need to add the filter explicitly — auto-injected when
      // softDeletes is true. Add manually only to override placement
      // or label:
      .filters([
        TrashedFilter.make().label('Trash status'),
      ])
  }
}
```

URL key: `?trashed=active` (default) / `?trashed=withTrashed` / `?trashed=onlyTrashed`.

Active state injects nothing into the query (default scope hides trashed).
`withTrashed` calls `query.withTrashed()`. `onlyTrashed` calls
`query.onlyTrashed()`.

### `Action.restore` / `Action.forceDelete`

```ts
Action.restore(R, basePath, recordId?)       // POST /:slug/:id/restore
Action.forceDelete(R, basePath, recordId?)   // POST /:slug/:id/force-delete
Action.bulkRestore(R, basePath)              // POST /:slug/_bulk/restore
Action.bulkForceDelete(R, basePath)          // POST /:slug/_bulk/force-delete
Action.bulkDelete(R, basePath)               // POST /:slug/_bulk/delete (NEW — landing alongside)
```

Same shape + visibility pattern as `Action.delete`. Auto-visibility:
- `Action.restore` — visible only when `record.deletedAt != null` AND
  `R.canRestore(user, record)` returns true.
- `Action.forceDelete` — visible only when `record.deletedAt != null` AND
  `R.canForceDelete(user, record)` returns true.
- `Action.delete` — when `R.softDeletes = true`, auto-hides on
  already-trashed rows (no double-soft-delete). Otherwise unchanged.

Trashed-row detection: per-row eval reads `record.deletedAt` directly.
Resources can override the column name via `R.deletedAtColumn = 'archivedAt'`
(rare — keep convention).

## Routes

Four new routes per soft-delete-enabled resource:

```
POST /:slug/:id/restore           single-row restore
POST /:slug/:id/force-delete      single-row hard delete
POST /:slug/_bulk/restore         bulk restore (body: { ids: [] })
POST /:slug/_bulk/force-delete    bulk hard delete (body: { ids: [] })
```

Plus: `POST /:slug/_bulk/delete` (which doesn't exist today) — not
soft-delete-specific but landing alongside since the bulk-action skeleton
is shared. Lives in this plan; gets called out in step 8.

Each handler:
1. `R.canAccess(user)` — same gate as every other route.
2. `R.model.find(id)` — load the record.
3. For force-delete / restore: load `withTrashed()` so the lookup finds
   currently-soft-deleted rows.
4. `R.canRestore(user, record)` or `R.canForceDelete(user, record)` —
   per-action policy.
5. `R.model.restore(id)` or `R.model.forceDelete(id)`.
6. Notification + redirect (Accept-aware: JSON for SPA-fetch, 303 for
   form-post).

Bulk variants iterate `ids[]`, run policy per-row, run the action per-row,
flash a single `"X posts restored"` notification.

## Where the checks fire

| Surface | Predicate | When |
|---|---|---|
| Default scope on list | (built-in) | Every `R.model.query()` — rudder injects `WHERE deletedAt IS NULL` automatically when `softDeletes = true`. |
| Restore route | `canRestore(user, record)` | `POST /:slug/:id/restore` and bulk. |
| Force-delete route | `canForceDelete(user, record)` | `POST /:slug/:id/force-delete` and bulk. |
| Action.restore visibility | `record.deletedAt != null && canRestore(user, record)` | Per-row eval (server-side, stamped into `_visibleActions`). |
| Action.forceDelete visibility | `record.deletedAt != null && canForceDelete(user, record)` | Per-row eval. |
| Action.delete visibility | `R.softDeletes ? record.deletedAt == null && canDelete(user, record) : canDelete(user, record)` | Per-row eval. Hides delete on already-trashed rows when soft-deletes are on. |
| TrashedFilter UI | always shown when `R.softDeletes = true` | List-page filter dropdown. |

## Authorization defaults

- `canRestore` defaults to `true`, matching the rest of Plan #10's surface.
- `canForceDelete` defaults to `R.canDelete(user, record)` — restore is
  generally lower-privilege than force-delete (it's reversible), so
  conservative defaults make hard-delete inherit whoever could delete in
  the first place. Override explicitly when an org wants tighter control.
- Both fail-closed on throws (matches `safePolicy` convention).

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Resource X has softDeletes = true but model.restore is missing` | App is on an old `@rudderjs/orm-prisma` | Upgrade — see `Verified rudder primitives` table. |
| Trashed rows show up in default list | `Model.softDeletes = false` or `deletedAt` column missing | Set `softDeletes = true` on the rudder Model class AND add `deletedAt DateTime?` to Prisma schema. The pilotiq flag does NOT enable rudder's behavior — both sides opt in independently (deliberately decoupled so users can stage the rollout). |
| `Action.delete` 200s but row stays | Hidden trashed in default-scope view; user thought it was a permanent delete | Show the TrashedFilter prominently and surface a "in trash" notification on success. Captured in step 7 (default toast title for soft-delete is `"Post moved to trash"` not `"Post deleted"`). |
| Restore route 404s | Default scope on `R.model.find(id)` excludes trashed rows | Restore handler must call `R.model.query().withTrashed().where(pk, id).first()` instead of `R.model.find(id)`. Captured in step 5. |
| Bulk POST returns 200 but partial failures | Per-row policy denies some, allows others | Bulk handler returns `{ ok, succeeded: [...], denied: [...] }` JSON. Form-post path flashes `"X of Y posts restored"`. |

## Out of scope (deferred to follow-up plans)

- **Auto-purge after N days.** A trashed-row sweeper. Out of scope —
  trivial cron job in the app, doesn't belong in pilotiq.
- **Cascading soft-delete to children.** When the parent goes to trash,
  do its children follow? Up to the rudder Model's relation hooks
  (`deleting / deleted` events), not pilotiq's job. Mention this in
  the guide.
- **Per-user trash isolation.** Currently the trash is global per
  resource. Multi-tenant trash isolation lives in user-defined
  `getEloquentQuery` overrides — not a pilotiq feature.
- **Trash views as separate routes.** No `/posts/trash` URL — the
  TrashedFilter inside the list page is the canonical UX. Adding a
  route is trivial later if users ask.
- **Soft-deleted relations in `RelationManager`.** Plan #11 managers
  inherit the related Resource's `getEloquentQuery` automatically, so
  trashed children drop out of manager lists by default. Showing
  trashed manager rows behind a filter is a follow-up; not blocking.

## Test plan

| Area | Test |
|---|---|
| `Resource.softDeletes` flag | Boot detects missing `model.restore` and throws clear error. |
| Default scope | List route excludes `deletedAt != null` rows when filter is `active`. |
| `TrashedFilter` parsing | URL `?trashed=onlyTrashed` calls `query.onlyTrashed()`. |
| `TrashedFilter` auto-inject | Filter appears on list when `softDeletes = true` and user didn't add one. |
| `TrashedFilter` user override | When user adds `TrashedFilter.make().label('X')`, no double-injection. |
| Restore route | 200 + record un-trashed on success. |
| Restore route | 403 when `canRestore` returns false. |
| Restore route | 404 when record id doesn't exist (in any scope). |
| ForceDelete route | 200 + record gone permanently. |
| ForceDelete route | 403 when `canForceDelete` returns false. |
| ForceDelete route | Default `canForceDelete` = `canDelete` (verified by override-detection like Plan #11's `safeManagerPolicy`). |
| Per-row Action.delete visibility | Hidden when `record.deletedAt != null` and `softDeletes = true`. |
| Per-row Action.restore visibility | Visible when `record.deletedAt != null && canRestore`. |
| Per-row Action.forceDelete visibility | Visible when `record.deletedAt != null && canForceDelete`. |
| Bulk routes | `ids[]` POST runs policy per-row. |
| Bulk routes | Returns `{ succeeded, denied }` JSON. |
| Page-data flash | Soft-delete success notification reads `"Post moved to trash"`, not `"Post deleted"`. |
| Reactive integration | `Action.restore` SPA-nav refreshes the list; trashed row disappears (or stays visible depending on filter). |
| Manager integration | RelationManager list defaults to active children; `?trashed=withTrashed` flows through to manager query. |

Total: ~25-30 tests across `softDeletes.test.ts` (new), `routes.test.ts`
(extended), `Action.test.ts` (extended), `TrashedFilter.test.ts` (new).

## Approach by step

The implementation order matches the Status table. Each step is
independently committable and shippable behind the boot-time `softDeletes`
opt-in (so partial state never affects existing apps).

1. **`Resource.softDeletes` opt-in + ModelLike additions** — pure types
   + flag plumbing. No behavior change yet (flag isn't read anywhere).
2. **TrashedFilter** — new filter primitive. Auto-injection on list
   builder; URL parsing in `parseTableQuery`. Self-contained.
3. **Authorization predicates** — add `canRestore / canForceDelete` to
   `Resource`. Default `canForceDelete` reads `canDelete` via the same
   reference-equality detection Plan #11 uses for managers.
4. **Restore / force-delete routes (single-row)** — POST handlers in
   `routes.ts`. Use `query.withTrashed().where(pk, id).first()` to
   bypass the default scope when looking up the row.
5. **Action factories** — `Action.restore` / `Action.forceDelete` mirror
   `Action.delete`. Update `Action.delete` factory to consult
   `R.softDeletes` for label + auto-hide-on-trashed visibility.
6. **Default page wiring** — `ListPage.getRowActions` and
   `ViewPage.getActions` consult `R.softDeletes` and emit the right
   action set. Per-row visibility via existing `_visibleActions` plumbing.
7. **Bulk routes + bulk actions** — covers bulk-delete (which we don't
   have), bulk-restore, bulk-force-delete. Shared `_bulk` URL pattern.
8. **Tests** — co-located `.test.ts` per step. Run after every step.
9. **Playground demo** — opt `PostResource` into soft-deletes; add
   `deletedAt` to both playgrounds' Prisma schemas.
10. **Docs** — `docs/guide/soft-deletes.md`, README + audit + CLAUDE.md
    updates.

## Companion memories (to write at completion)

- `project_pilotiq_soft_deletes.md` — landing summary (file map, test
  delta, verified-against-rudder spot check, override patterns).
- `feedback_softdelete_two_sided_optin.md` — capture the gotcha that
  `Resource.softDeletes` and `Model.softDeletes` are independent (apps
  must set both). Surfaced via the boot-time error in step 1.
