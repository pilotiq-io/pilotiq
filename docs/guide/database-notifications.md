# Database notifications

Pilotiq ships a bell-icon dropdown that surfaces persistent notifications
authored elsewhere in your app. Author rows from any action handler with

```ts
import { Notification } from '@pilotiq/pilotiq'

await Notification.make('Saved successfully')
  .body('Changes to the post have been saved.')
  .success()
  .sendToDatabase(currentUser)
```

The current user sees the new row on the bell's next poll — or
immediately, if they click the bell to refetch.

---

## Storage

Pilotiq doesn't ship its own table. Rows live on the `notification`
table that `@rudderjs/notification`'s `NotificationProvider` already
publishes — the same one Laravel-style channel notifications write to.
Add `NotificationProvider` to your providers list to vendor the schema:

```bash
pnpm rudder vendor:publish --tag=notification-schema
pnpm exec prisma db push --schema prisma/schema
```

Or copy `prisma/schema/notification.prisma` from the package directly.
Either way the table looks like:

| Column | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | Primary key |
| `notifiable_id` | `String` | Recipient id (coerced to string) |
| `notifiable_type` | `String` | `'users'` by default |
| `type` | `String` | `'PilotiqNotification'` for rows pilotiq writes |
| `data` | `String` | JSON-encoded payload |
| `read_at` | `String?` | ISO timestamp; null = unread |
| `created_at` / `updated_at` | `String` | ISO timestamps |

Pilotiq queries the table through `@rudderjs/orm`'s `ModelRegistry`
adapter, so any orm-supported database works (SQLite / Postgres /
MySQL via Prisma, Drizzle adapters too).

---

## Enabling the bell

Two preconditions:

1. A user resolver — `Pilotiq.user(req => …)` must return an object with
   a non-null `id`. The bell scopes every read/write through that id, so
   no resolver = no inbox.
2. The opt-in toggle:

```ts
import { Pilotiq } from '@pilotiq/pilotiq'

Pilotiq.make('admin')
  .user(req => Auth.user())
  .databaseNotifications()         // defaults: topbar / 30s poll / 25 rows
```

When both are present, `panelInfo()` ships a `databaseNotifications`
block to the renderer and the bell mounts in the panel chrome between
`<ThemeToggle>` and `<UserMenu>`.

---

## Configuration

Every option is keyword-only. Pass them in the toggle, or use the sugar
setters for the common knobs:

```ts
.databaseNotifications({
  position:   'topbar',  // or 'sidebar' (sidebar layout only)
  polling:    30,        // seconds; null disables auto-poll
  pageSize:   25,        // max rows the list endpoint returns
  badgeColor: 'primary', // 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'
  trigger:    {          // bell trigger overrides
    icon:  'inbox',      // any registered icon name
    label: 'Inbox',      // aria-label
  },
  notifiableType: 'users',  // matches the `notifiable_type` column
})

// Sugar setters (no-ops without `.databaseNotifications()` first):
.databaseNotificationsPolling(120)         // bump the interval
.databaseNotificationsPolling(null)        // disable auto-poll
.databaseNotificationsPosition('sidebar')  // move to the sidebar footer
```

`position` only honors `'sidebar'` in the sidebar layout; the topbar
layout has no sidebar to mount into and falls back to the topbar.

---

## Sending notifications

`Notification.make(title)` is the same builder that emits transient
toasts — calling `.sendToDatabase(recipient)` persists it instead of
returning the meta. The two are independent: a handler can do both.

```ts
import { Action, Notification } from '@pilotiq/pilotiq'

Action.make('publish')
  .label('Publish')
  .handler(async ({ record, user }) => {
    await publishPost(record)

    // Drop a row on every editor's inbox.
    for (const editor of await getEditors()) {
      await Notification.make('Post published')
        .body((record as any).title)
        .icon('check-circle-2')
        .success()
        .url(`/new-admin/posts/${(record as any).id}`)
        .sendToDatabase(editor)
    }

    // Toast the action's invoker.
    return {
      notify: Notification.make('Published').success().toMeta(),
    }
  })
```

`recipient` is anything with a non-null `id`. The bell coerces the id
to a string before reading or writing — mixed `number`/`string` ids
stay consistent on disk.

### Click-through URLs

`.url(href)` stores a URL alongside the row. The bell renders the row
as a real `<a>`; clicking it marks the row read AND SPA-navigates in a
single step. Modified clicks (cmd / ctrl / shift) preserve native
browser semantics for opening in new tabs.

### Wire payload

`.toDatabase()` builds the JSON blob written to the `data` column:

```jsonc
{
  "type":  "success",     // mirrors the toast type chip on the bell
  "title": "Saved",
  "body":  "All good.",   // optional
  "icon":  "check-circle-2",
  "url":   "/admin/posts/42"
}
```

Rows authored by other tools (e.g., a regular `@rudderjs/notification`
subclass via `Notifier.send`) round-trip too — the bell parses
`title` / `body` / `icon` / `url` / `type` from whatever's in `data`
and ignores the rest.

---

## Endpoints

`databaseNotifications()` mounts four endpoints under `${basePath}`:

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/_notifications?unread=true&limit=25` | List rows + unread count |
| `POST` | `/_notifications/:id/read`            | Mark one row read |
| `POST` | `/_notifications/:id/unread`          | Mark one row unread |
| `POST` | `/_notifications/read-all`            | Mark every unread row read |

Every route 401s when no user resolves. Mark-read routes scope by
`notifiable_id` so a tampered POST can't mark another user's row.

### `Action.markAsRead()` factory

For custom inbox pages or any UI that surfaces persistent
notifications outside the bell, `Action.markAsRead(basePath, id?)`
produces a method-POST action that targets the read endpoint
directly:

```ts
import { Action } from '@pilotiq/pilotiq'

table.recordActions([
  Action.markAsRead('/admin')                              // row context — :id template
    .visible(({ record }) => !record.readAt),              // hide on already-read rows
  Action.markAsRead('/admin', 'n-7'),                      // single-record context — id baked in
])
```

No auto-visibility ships with the factory — wrap in `.visible(({
record }) => …)` if the surrounding context should hide already-read
rows. The Filament-style chain modifier (`Action::make('view')->markAsRead()`,
which adds an implicit mark-read side-effect to a custom action) is
deferred until a consumer asks.

---

## Polling

The default 30-second interval matches Filament. The bell pauses
polling while `document.visibilityState !== 'visible'` so a
backgrounded tab doesn't keep tickling the server.

Set `polling: null` to disable polling entirely — the bell still
fetches once on mount and after every mark-read mutation.

---

## Broadcast (Phase 2)

Polling is the default refresh path. For low-latency push, opt into
broadcast — pilotiq publishes every persisted row to the recipient's
private WebSocket channel and the bell client subscribes on mount,
triggering an immediate refetch when the event fires.

```ts
Pilotiq.make('admin')
  .user(req => Auth.user())
  .databaseNotifications()
  .databaseNotificationsBroadcast()         // same-origin /ws
  // .databaseNotificationsBroadcast({ wsUrl: 'wss://x.test/ws' })
```

### Requirements

1. `@rudderjs/broadcast` installed and `BroadcastingProvider` registered
   in your app's providers list. The provider wires the WebSocket
   upgrade handler at `/ws` (configurable via `broadcast.path` config).
2. Vendor the client with
   `pnpm rudder vendor:publish --tag=broadcast-client` so
   `@rudderjs/broadcast/client/RudderSocket.ts` resolves at runtime
   from the bell. Apps that vendor it elsewhere can register the
   constructor manually:

   ```ts
   import { RudderSocket } from './RudderSocket'
   if (typeof window !== 'undefined') {
     (window as any).__pilotiqRudderSocket = RudderSocket
   }
   ```

### Channel + auth

Pilotiq registers an auth callback for
`private-pilotiq-notifications.*` at panel boot. A subscription is
allowed only when `pilotiq.resolveUser(req).id === channel.userId` —
the upgrade request's cookies feed the same user resolver every other
request uses, so apps using `@rudderjs/auth` get the gate for free.

### Pushing without persisting

`Notification.make('Hi').broadcast(user)` pushes the toast payload
without writing a row. Pair with `sendToDatabase(user, { broadcast:
true })` to do both in one call.

### Soft-fail behavior

The whole broadcast surface soft-fails:

- `@rudderjs/broadcast` not installed → bell silently falls back to polling.
- WebSocket connect fails → polling covers the gap.
- Auth callback rejects → subscription drops; polling unaffected.

Apps that opt into broadcast can therefore ship the same bundle to
environments without WebSocket support; functionality degrades, but
nothing breaks.

---

## Actions

Notifications can carry a strip of action buttons rendered below the
body — same shape on transient toasts and persisted bell rows. Three
serializable dispatch modes, plus a Filament-style chain modifier
(`.markAsRead()`) that works with any of them.

```ts
import { Notification, Action } from '@pilotiq/pilotiq'

await Notification.make('New project assigned')
  .body('You have been added as a collaborator on Apollo.')
  .info()
  .actions([
    // 1) navigate-on-click (href) — works on toasts and bell rows
    Action.make('view').url('/projects/123').markAsRead(),

    // 2) form-POST — works on toasts and bell rows
    Action.make('archive')
      .label('Archive')
      .method('post')
      .action('/projects/123/archive')
      .color('destructive'),

    // 3) registered handler — works on bell rows; see "Named handler
    //    registry" below for the registration step
    Action.make('mark-priority')
      .label('Mark priority')
      .handler('mark-priority')
      .payload({ projectId: 123 })
      .markAsRead(),
  ])
  .sendToDatabase(currentUser)
```

### Chain modifier — `Action.markAsRead()`

When you tag an action with `.markAsRead()`, firing it also flips the
notification's `read_at` column. URL and form-POST actions fire the
read mutation as a client-side side-effect (the bell client POSTs to
`readUrl` before navigating); registry-handler actions handle it
server-side inside the action route, so the round-trip is one request.

```ts
Action.make('view').url('/projects/123').markAsRead()
```

Use `.markAsRead(false)` to clear the flag — handy when you've inherited
an Action factory that armed it.

### Named handler registry

Closures don't survive the JSON round-trip into the `data.actions`
column, so persisted bell rows can't carry `Action.handler(async ctx
=> …)` directly. Register the handler under a name at boot, then
reference it by string from inside `Notification.actions([…])`:

```ts
import { Pilotiq } from '@pilotiq/pilotiq'

panel.notificationHandlers({
  'mark-priority': async (ctx) => {
    const { projectId } = ctx.payload as { projectId: number }
    await Project.update(projectId, { priority: 'high' })
    return { notify: { title: 'Marked priority', type: 'success' } }
  },
})
```

Handler names must match `^[A-Za-z0-9_-]+$` — they ride in the action
endpoint URL (`{base}/_notifications/:id/_action/:actionName`), so a
URL-unsafe character throws at registration rather than 404ing days
later when an old row is clicked.

The handler context carries `user` (resolved by `Pilotiq.user(...)`),
`payload` (the `.payload({…})` you set at send time), and
`notificationId` (the row the click came from). Returning `{ redirect,
notify, … }` works the same way as a `Resource.recordActions(...)`
handler.

### Closure handlers on transient toasts

For transient toasts emitted from a Resource action handler, you can
keep using the closure form — no registration step required:

```ts
return {
  notify: Notification.make('Saved')
    .success()
    .actions([
      Action.make('undo').handler(async () => {
        await Post.update(id, { status: 'draft' })
        return { notify: { title: 'Reverted', type: 'info' } }
      }),
    ])
    .toMeta(),
}
```

The toaster wires closures back to the current page's
`_action/:actionName` endpoint. (Bell rows can't reach back to the
emitting page — that's why persisted notifications need the registry.)

### Compatibility

- **`Action.markAsRead(basePath, id?)` factory** (the one shipped
  earlier) is a different surface — it produces a standalone
  *standalone-button* Action that posts to the read endpoint. Useful
  in a custom inbox `recordActions(...)` slot. Not the same as the
  chain modifier above.
- The action wire format ignores Action features that don't fit a
  notification context — modal-form (`.schema()` / `.modal*()`),
  submit (`.submit()`), bulk placement, and visibility callbacks all
  throw at config time with a clear pointer.

---

## v1 limits

- **Single notifiable type per panel.** Every read/write uses the same
  `notifiableType` (default `'users'`).
- **No bulk inbox modal page.** The dropdown is the primary surface;
  a full inbox page (Filament's `database-notifications` modal) is
  deferred until a consumer asks.
- **Modal-form actions inside notifications are deferred.** Use the
  registry-handler path for "click → run logic" flows; a small modal
  with form fields would need a second dispatch leg.
