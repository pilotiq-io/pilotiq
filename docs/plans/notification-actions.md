# Notification actions plan

**Status:** ✅ SHIPPED (re-audited 2026-05-30 against `packages/pilotiq/src` — every file in the table below is live; closes the last open item on the database-notifications surface). The wiring landed across:
- `notifications/types.ts` — `NotificationActionMeta` + `NotificationActionHandler` / `NotificationActionContext` / `NotificationActionResult`.
- `notifications/Notification.ts` — `.actions([…])` slot, `toMeta()`/`toDatabase()` round-trip, `serializeForNotification()` (rejects modal/submit/bulk + closure-on-persist).
- `actions/Action.ts` — `.handler(fn|name)` widen (`_handlerName`), `.payload({…})`, `.markAsRead()`, `.openUrlInNewTab()` + getters.
- `Pilotiq.ts` — `.notificationHandlers({name: fn})` with `^[A-Za-z0-9_-]+$` validation + `getNotificationHandler()`.
- `notifications/database.ts` — `DatabaseNotificationMeta.actions?` + `parseStoredActions()` (malformed entries dropped with `console.warn`).
- `routes/panel.ts` — `POST {base}/_notifications/:id/_action/:actionName` via `dispatchNotificationAction`.
- `pageData/navigation.ts` — `DatabaseNotificationsMeta.actionUrl` template emitted by `buildDatabaseNotificationsMeta`.
- `react/NotificationActionStrip.tsx` (shared) → mounted in `react/NotificationBell.tsx` (bell rows) and `react/Toaster.tsx` (transient toasts; action toasts auto-extend to persistent).
- Tests: `notifications/Notification.test.ts`, `actions/Action.test.ts`, `notifications/database.test.ts`, `notifications/dispatchNotificationAction.test.ts`, `react/NotificationActionStrip.test.tsx`.
- Guide: `docs/guide/database-notifications.md` "Actions" + "Named handler registry" sections.

Original proposal (PROPOSED 2026-05-07) preserved below for context. All four v2 deferreds remain deferred.

**Goal:** let a notification — transient toast OR persisted bell row — carry a strip of actions the recipient can click. Match Filament's surface 1:1 on the API shape, beat it on closure-handler durability.

---

## Why now

- The notifications surface (transient toaster + database bell + broadcast) shipped feature-complete vs Filament v5 *except* this slot. Closing it lands the trio.
- The standalone `Action.markAsRead(basePath, id?)` factory shipped 2026-05-07 cont'd² covers the "explicit row button" case. The `actions([…])` slot covers the "inline action below the body" case — sister concept, separate surface.
- Filament's closure-handler limitation is well-known (and documented as such in their guide). Fixing it via a named-handler registry is the single biggest DX win on the table for this surface — and it's cheaper to land alongside the slot itself than as a follow-up.

---

## API surface

### Author side — `Notification.actions([…])`

```ts
import { Notification, Action } from '@pilotiq/pilotiq'

await Notification.make('New project assigned')
  .body('You have been added as a collaborator on Apollo.')
  .info()
  .actions([
    Action.make('view').url('/projects/123').markAsRead(),
    Action.make('archive')
      .label('Archive')
      .color('destructive')
      .handler('archive-project')                  // string registry key
      .payload({ projectId: 123 })
      .markAsRead(),
  ])
  .sendToDatabase(currentUser)
```

### App side — registering named handlers at boot

```ts
import { Pilotiq } from '@pilotiq/pilotiq'

panel.notificationHandlers({
  'archive-project': async (ctx) => {
    const { projectId } = ctx.payload as { projectId: number }
    await Project.update(projectId, { archivedAt: new Date() })
    return { notify: { title: 'Archived', type: 'success' } }
  },
})
```

The handler signature mirrors `ActionHandler` from `dispatchAction` — same `ctx.user`, same `{ notify, redirect, download }` return shape — minus `record(s)` (notifications aren't row-scoped) and plus `ctx.payload` (the per-fire context the action carried).

---

## Three serializable dispatch modes

| Mode | Wire shape | Bell rows | Toasts |
|---|---|---|---|
| `Action.url(href)` | `{ url }` | ✅ | ✅ |
| `Action.method('post').action(url)` | `{ post: url }` | ✅ | ✅ |
| `Action.handler('name').payload({…})` | `{ handler: name, payload }` | ✅ via new endpoint | ✅ via new endpoint |
| `Action.handler(closure)` | (closure) | ❌ throws at `sendToDatabase` | ✅ — dispatches to current page's `_action/:name` |

**Why the closure-handler mode still works on toasts:** transient toasts always render in the context of a Resource / page that already exposes `_action/:name`. The bell row has no such anchor — it lives in a chrome dropdown — so closures must be replaced with a registry lookup keyed on a stable name.

---

## Wire format

```ts
export interface NotificationActionMeta {
  name:               string
  label:              string
  // exactly one of the dispatch shapes:
  url?:               string                       // href
  post?:              string                       // method-POST URL
  handler?:           string                       // registry key
  payload?:           Record<string, unknown>      // serialized handler context
  // chrome:
  color?:             ActionColor
  icon?:              string
  outlined?:          boolean
  size?:              ActionSize
  openUrlInNewTab?:   boolean
  // chain modifier:
  markAsRead?:        boolean                      // fire read POST as side-effect
}
```

`Notification.toMeta()` and `Notification.toDatabase()` both grow an optional `actions?: NotificationActionMeta[]`. The wire format is a pure value-object — same shape on both transports. Bell-row read time JSON-decodes from the row's `data.actions` column and validates each entry shape (drops malformed entries with a `console.warn` rather than crashing the dropdown render).

---

## New POST endpoint

```
POST {base}/_notifications/:id/_action/:actionName
```

**Auth:** `401` when no `pilotiq.resolveUser(req)`; `404` when the row's `notifiable_id !== user.id` (also catches "id doesn't exist"); `404` when the stored row's `data.actions` doesn't contain a matching `actionName`; `404` when the matched action's `handler` field isn't a string (defends in depth — closures should already have been filtered at `sendToDatabase`); `404` when the registry doesn't have a function under that name.

**Dispatch:** resolves the handler, runs it with `{ user, payload: storedAction.payload, notificationId }`, returns `{ ok, redirect?, notifications?, download? }` parallel to `dispatchAction`. When the stored action's `markAsRead` flag is set, the route also flips `read_at` (server-side authoritative — the bell client doesn't need to fire a separate POST for handler dispatch).

**Body:** `{}` in v1 — payload comes from the stored row, not the request. Defends against tampered clients trying to inject extra payload keys.

---

## Files

| Path | Change |
|---|---|
| `src/Pilotiq.ts` | `notificationHandlers({ name: fn })` setter + `cfg.notificationHandlers` map (`Record<string, NotificationActionHandler>`); validate name pattern (`^[A-Za-z0-9_-]+$`) at registration |
| `src/notifications/Notification.ts` | `_actions?: Action[]` slot + `.actions([…])` setter; `toMeta()`/`toDatabase()` include `actions` when set; new `serializeForNotification(action, opts)` helper that emits the slim wire shape and rejects incompatible Action features (`bulk` placement, `submit`, `formField`, `schema`/`modal*`) at config time |
| `src/notifications/types.ts` | `NotificationActionMeta` type + `NotificationActionHandler` signature |
| `src/actions/Action.ts` | Widen `.handler(fn \| name)` overload — closure to `_handler`, string to `_handlerName` (mutually exclusive); add `.payload({…})` setter (`_payload`); add `.markAsRead()` chain modifier (`_markAsReadOnFire`); add getters |
| `src/notifications/database.ts` | `DatabaseNotificationMeta.actions?` round-trip; `rowToMeta` validates each action entry shape |
| `src/routes.ts` | New `POST {base}/_notifications/:id/_action/:actionName` handler — auth → row lookup → action lookup → registry lookup → dispatch → optional mark-read |
| `src/pageData.ts` | `panelInfo()` ships `databaseNotifications.actionUrl` template (`${base}/_notifications/:id/_action/:name`) so the bell client can build per-action URLs |
| `src/react/NotificationBell.tsx` | Action-strip renderer below row body; `<a>` for url, `<form method=post>` for post, `<button>` for handler-by-name (fetches the action endpoint with `Accept: application/json`, drains notifications via `useToast()`, navigates redirect); `markAsRead` fires read POST before navigating/submitting on url/post (handler dispatch handles it server-side) |
| `src/react/Toaster.tsx` | Same strip on transient toasts; closure-handler dispatch falls through to current page's `_action/:name` (toast-only escape hatch — no notification id) |
| `src/notifications/Notification.test.ts` | Actions setter, toMeta + toDatabase shape, throws on closure-handler at sendToDatabase, markAsRead flag round-trip, serializeForNotification rejects modal/submit/bulk |
| `src/actions/Action.test.ts` | `.markAsRead`, `.payload`, `.handler(string)` widen, mutual exclusion |
| `src/notifications/database.test.ts` | Actions array round-trip through `data` JSON column; malformed entry skipped with warn |
| `src/routes-notification-actions.test.ts` (new) | 401/404/handler success/markAsRead side-effect/registry miss |
| `docs/guide/database-notifications.md` | New "Actions" section + "Named handler registry" subsection |
| `~/.claude/projects/.../memory/project_pilotiq_database_notifications.md` | "Actions slot — shipped" bullet |
| `~/.claude/projects/.../memory/MEMORY.md` | Index entry stays; project memory updated in place |

---

## Tests

- `Notification.actions([Action…])` round-trip: `toMeta()`, `toDatabase()` carry the slim wire format.
- `serializeForNotification(action)` accepts: `.url()`, `.method('post').action(url)`, `.handler('name').payload({})`, plus chrome (color/icon/outlined/size/openUrlInNewTab) and `.markAsRead()`.
- `serializeForNotification(action)` rejects with clear errors: closure-handler at `sendToDatabase` time, `submit`/`schema`/`modalHeading`/`bulk` placement at any time.
- `Pilotiq.notificationHandlers({ name: fn })` rejects non-conforming names at registration.
- `database.ts → rowToMeta`: malformed action entries dropped with `console.warn`, valid entries pass through.
- New route `POST /_notifications/:id/_action/:name`: 401 (no user), 404 (id mismatch / wrong owner / action missing / closure handler / registry miss), success path (notify drained, redirect echoed, `read_at` flipped when `markAsRead`).
- Existing tests unchanged.

Target: `2514 → ~2545` (+30 cases).

---

## Deferreds (v2)

- **Modal-form actions inside notifications.** Filament's notification actions can mount a small modal form. Surface fits naturally — `Action.schema([…])` is already there on Action — but adds a second dispatch leg (validate / coerce / handler with values). Defer until a consumer asks.
- **Bulk-from-notification (e.g. "approve 12 pending"):** notifications today carry one row's worth of context. Bulk dispatch from a single notification would need `payload.recordIds[]` plus a per-id loop in the route. Defer.
- **`Action.dispatch('event-name')` (Filament's Livewire-style event dispatch).** No equivalent in pilotiq's React tree — would need a custom event-bus surface. Defer until a consumer asks. The current alternatives (`url`, `post`, `handler`) cover the "click an action" case end-to-end.
- **Per-notification action visibility callbacks.** Today's `Action.visible(({ user, record }) => …)` won't compose cleanly because notifications don't carry a `record`. Workable via `payload`-driven gating, but the first cut sticks to "all stored actions render"; revisit if a consumer needs server-side gating after persistence.

---

## Risk register

- **Closure handler smuggled into `actions([…])`:** caught at config time by `serializeForNotification` checking `action.getHandlerName()` is a string and `action.getHandler()` is undefined. The config-time error points at the registry pattern.
- **Tampered `actionName` in the URL:** route reads the action *only* from the stored row's `data.actions` array; the URL `:actionName` is just the lookup key. A client can't synthesize an action name that wasn't already serialized into the row.
- **Tampered `payload` in the request body:** v1 endpoint takes no body — `payload` reads exclusively from the stored row.
- **Registry name collision with future Resource action names:** the registry is panel-scoped, separate namespace; no overlap with Resource/page action names.
- **Stored handler name no longer in registry (e.g. after a deploy that renamed handlers):** route returns 404 with a clear message ("notification action handler X not registered"). Bell client surfaces a generic error toast — no silent failure.
