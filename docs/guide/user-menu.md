# User menu

The panel's top-right user-menu dropdown surfaces the current user
plus optional links (profile, billing, docs, …) and a sign-out
endpoint. It mounts whenever `Pilotiq.user(req => …)` resolves a
non-null user.

## Quick start

```ts
import { Pilotiq, UserMenuItem } from '@pilotiq/pilotiq'
import { Auth } from '@rudderjs/auth'

Pilotiq.make('admin')
  .user(req => Auth.user())
  .userMenuItems([
    UserMenuItem.make('billing').label('Billing').icon('credit-card').url('/billing'),
    UserMenuItem.make('docs')
      .label('Documentation')
      .icon('book-open')
      .url('https://docs.example.com')
      .openUrlInNewTab(),
  ])
  .signOut('/logout')
```

The dropdown shows:

```
┌─────────────────────────┐
│  <render hook: before>  │
│  Demo Admin             │  ← identity (name + email + avatar)
│  admin@example.com      │
│ ─────────────────────── │
│  Edit profile           │  ← auto-injected by .profile(P)
│  Billing                │  ← from .userMenuItems([...])
│  Documentation          │
│  <render hook: after>   │
│ ─────────────────────── │
│  Sign out               │  ← from .signOut(...)
└─────────────────────────┘
```

Anonymous requests never see the dropdown — when `Pilotiq.user(...)`
returns `null`, the trigger is suppressed entirely.

## `UserMenuItem`

```ts
UserMenuItem.make('profile')
  .label('My profile')                 // string or ({ user }) => string
  .icon('user')                        // icon-registry key
  .url('/profile')                     // string or ({ user }) => string
  .openUrlInNewTab()                   // external link
  .color('destructive')                // 'default' (omit) or 'destructive'
  .sort(10)                            // ascending; registration order breaks ties
  .visible(({ user }) => isAdmin(user))// boolean or ({ user }) => boolean | Promise<boolean>
```

### Visibility

`.visible(rule)` mirrors `Action.visible(...)` — receives an
`ActionVisibilityContext` with just `{ user }` populated. Throwing
rules fail closed (item hidden), matching the `canAccess` posture
elsewhere.

### Dynamic label / URL

Labels and URLs accept callbacks so items can be personalised:

```ts
UserMenuItem.make('profile')
  .label(({ user }) => `Signed in as ${(user as any).name}`)
  .url(({ user }) => `/users/${(user as any).id}/profile`)
```

Returning a Promise is supported. The callback fires server-side
inside `panelInfo()`.

## `.signOut(...)`

```ts
.signOut('/logout')                                          // POST /logout, label "Sign out"
.signOut({ url: '/auth/logout', method: 'GET', label: 'Log out' })
```

The dropdown's sign-out entry renders as a `<form method="POST">`
(not a bare `<a href>`) so CSRF middleware downstream can validate
the request. Set `method: 'GET'` for traditional logout endpoints
that redirect on a normal navigation.

Without `.signOut(...)`, the menu shows custom items (if any) and
the user identity, but no sign-out affordance.

## `.profile(P)` — auto-inject "Edit profile"

```ts
import { Page, Form, TextField } from '@pilotiq/pilotiq'

class ProfilePage extends Page {
  static override slug  = 'profile'
  static override label = 'My profile'
  static override icon  = 'user-circle'
  static override schema(ctx) {
    return [Form.make().schema([
      TextField.make('name').required(),
      TextField.make('email').email().required(),
    ])]
  }
}

Pilotiq.make('admin').profile(ProfilePage)
```

`Pilotiq.profile(P)` registers the page in `cfg.pages` (so routing
and `canAccess` wire up) AND auto-prepends an "Edit profile" entry
to the user menu pointing at it. The entry's label and icon read
from `Page.label` / `Page.icon` with `'Edit profile'` and
`'user-circle'` defaults.

Author the page schema against your own auth model — pilotiq treats
the user object as opaque, so the form is just a normal `Page`
subclass.

## Render hooks

Two splice points let plugins add to the menu without owning the
slot:

| Slot | Position |
|---|---|
| `panels::user-menu.before` | Top of the dropdown (above the identity row) |
| `panels::user-menu.after` | Above the separator before sign-out |

```ts
Pilotiq.make('admin')
  .renderHook('panels::user-menu.after', () => [
    Alert.make('You have 3 unread invites').info(),
  ])
```

## User identity row

The identity row at the top of the dropdown reads `name`, `email`,
and `avatar` from your user object. Pilotiq tries common shapes
(`user.name` / `user.fullName`; `user.email`; `user.avatar` /
`user.profilePhotoUrl`) — anything else is invisible unless you
inject it via render hook.

## What's not in v1

- Nested sub-menus inside the user menu (use `.url()` to a custom
  page if you need a multi-step settings flow).
- Per-item authorisation against `Resource.canAccess` — items rely
  on `.visible(rule)` only; cross-resource policy gates aren't
  inferred.
- A built-in language switcher / theme override inside the menu;
  use a render hook or a custom `Pilotiq.components({ nav })`
  component.

## Reference

- `Pilotiq.userMenuItems(items)` / `Pilotiq.signOut(config)` /
  `Pilotiq.profile(P)` — `src/Pilotiq.ts`
- `UserMenuItem` — `src/UserMenuItem.ts`
- `<UserMenu>` renderer — `src/react/UserMenu.tsx`
- See also: [Render hooks](./render-hooks.md), [Pages](../packages/pilotiq/pages.md)
