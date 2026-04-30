# Flash notifications

Deliver notifications produced on the form-post 303 redirect path (create, edit, delete, form-method actions). Today `dispatchFormSubmit` and `dispatchAction` resolve a `NotificationMeta[]`, but the 303 path drops it because there's nowhere to stash a value across the redirect. Wire the existing `@rudderjs/session` flash primitive into pilotiq's POST handlers and the `pageData` builders.

**Status:** ✅ DONE — shipped 2026-04-30. Tests 442 → 445 (+3 routes-level flash roundtrip tests; helper unit tests already in `flash.test.ts`).

**Depends on:** `@rudderjs/session` (already a default provider, configured in playground), `dispatchFormSubmit.notifications`, `dispatchAction` notification result, `Toaster` provider.

**Companion plan:** `page-lifecycle-hooks.md` (closes the limitation noted at the bottom of that doc), `actions-tier-1.md` (closes the same limitation for form-method actions).

---

## Where does flash live: rudder or pilotiq?

**Rudder** — the primitive **already exists** in `@rudderjs/session` (`SessionInstance.flash(key, value) / getFlash(key)`, with cookie + Redis drivers). No other rudder package consumes it yet; pilotiq is the first.

**Pilotiq** — this plan. A thin wrapper that calls `req.session.flash('pilotiq:notifications', meta)` on POST and reads it back on the next GET. Five-ish lines per call site.

**Recommendation:** flash logic lives on **pilotiq side**. Rudder's session already offers exactly the API we need; building a higher-level `redirect().with(key, value)` Laravel-style helper in rudder's router would be nicer ergonomics but is sugar over the same two calls and not necessary to ship this. Keep it pilotiq-side for now; revisit a router-level helper as a separate (optional) rudder enhancement once we've used the raw API for a release.

The pilotiq side is also the right place because:
1. **Naming convention** — flash keys need a namespace (`pilotiq:notifications`); a generic rudder helper wouldn't pick our prefix for us.
2. **Shape of the value** — `NotificationMeta[]` is a pilotiq type; rudder shouldn't know about it.
3. **Read site** — only pilotiq route GET handlers / `pageData` builders consume them; nothing else in the host app needs them.

---

## End state

After this lands:

```ts
// In any pilotiq POST handler — already runs dispatchFormSubmit / dispatchAction
const result = await dispatchFormSubmit(form, values, { values, record })
if (result.ok) {
  flashNotifications(req, result.notifications)   // new — one line
  return res.redirect(result.redirect ?? defaultUrl, 303)
}
```

```ts
// In any pageData builder — already produces viewProps
return {
  …
  notifications: consumeFlashedNotifications(req),   // new — one line
}
```

`AppShell` already reads `viewProps.notifications` and forwards them to `<ToasterProvider initialNotifications=…>`. No client-side changes needed.

---

## Implementation

### 1. Helpers

New file `packages/pilotiq/src/notifications/flash.ts`:

```ts
import type { AppRequest } from '@rudderjs/contracts'
import type { NotificationMeta } from './Notification.js'

const FLASH_KEY = 'pilotiq:notifications'

/** Stash notifications for the next request (consumed by AppShell on the redirect target). */
export function flashNotifications(req: AppRequest, notifications: NotificationMeta[]): void {
  if (!notifications || notifications.length === 0) return
  // Coalesce with anything already flashed earlier in the same request,
  // so a handler that produces both a save toast and an action toast
  // doesn't lose either.
  const prior = (req.session?.getFlashNext?.<NotificationMeta[]>(FLASH_KEY)) ?? []
  req.session?.flash(FLASH_KEY, [...prior, ...notifications])
}

/** Read & clear the flashed notifications. Returns [] when nothing or no session. */
export function consumeFlashedNotifications(req: AppRequest | undefined): NotificationMeta[] {
  if (!req?.session) return []
  return req.session.getFlash<NotificationMeta[]>(FLASH_KEY) ?? []
}
```

Note: `getFlashNext` doesn't currently exist on `SessionInstance` — it'd let us read what we just flashed in the same request to coalesce. The simpler version is fine for v1: `flash()` overwrites by key, and we only call `flashNotifications` once per response. If we later need coalescing, add `getFlashNext` to rudder's session as a tiny addition.

**v1 simplification:** drop the coalesce branch; document "called once per response" as an invariant.

### 2. Apply at every POST callsite in `routes.ts`

Six 303-redirect callsites today (counting both form lifecycle and action dispatch):

- `POST {base}/{slug}/create`               → `flashNotifications(req, result.notifications)` before redirect
- `POST {base}/{slug}/{id}/edit`            → same
- `POST {base}/{slug}/{id}/delete`          → no notifications today; add one if `R.deleteRecord` returns/throws something. Out of scope for v1.
- `POST {base}/{slug}/_action/{name}`       → form-method 303 branch (the modal-form JSON branch already delivers via the response body)
- `POST {base}/{slug}` (Global)             → form lifecycle, same as edit
- `POST {base}/{pageSlug}/_action/{name}`   → form-method 303 branch on custom-page actions

Where the JSON branch already delivers, do nothing. Where the 303 branch returns, call `flashNotifications` first.

### 3. Read at every page-data builder in `pageData.ts`

Each builder gets passed the `req` (already available where called from `routes.ts`; `+data.ts` doesn't have it but doesn't need it since SPA-nav doesn't go through redirects anyway). Two paths:

- **SSR after redirect** — `routes.ts` GET handler invokes `dashboardData / resourceIndex / resource{Edit,View} / globalEdit / customPage` with `req`; the builder reads flash and merges into the returned `notifications` array.
- **SPA nav (`+data.ts`)** — no req available; flash isn't applicable (no redirect happened); return empty.

To keep the builder signature backward-compatible, accept an optional `req` arg:

```ts
export async function resourceIndexData(
  pilotiq: Pilotiq,
  slug:    string,
  query:   Record<string, string> = {},
  req?:    AppRequest,
): Promise<Record<string, unknown> | null> {
  …
  return {
    …
    notifications: consumeFlashedNotifications(req),
  }
}
```

`AppShell` already reads `notifications` from viewProps; no client change.

### 4. Threading `req` through

`routes.ts` GET handlers gain a `req` arg passed to each builder. The handlers already have `req` from the route function — wire it. `+data.ts` (auto-generated by `vite.ts`) doesn't pass `req`; the builder treats `undefined` as "no flash" and returns empty.

### 5. Cookie size budget

Cookie-driven flash has a 4KB limit (shared with all session data). `NotificationMeta` is small (id ≤ 30B, type ≤ 8B, title ≤ 80B, optional body ≤ 200B, optional icon ≤ 24B, optional duration 4B); a typical toast is < 350B serialized. Even half a dozen flashed at once stays well under budget. No special truncation needed.

The Redis driver has no practical limit, but we shouldn't rely on it — keep payloads small enough for the cookie driver to be a viable choice.

---

## File touch list

```
packages/pilotiq/src/notifications/
  flash.ts                       # new — flashNotifications + consumeFlashedNotifications
  flash.test.ts                  # new — covers stash → consume roundtrip with a mock SessionInstance
  index.ts                       # re-export the two helpers

packages/pilotiq/src/
  routes.ts                      # ~6 callsites: flashNotifications(req, result.notifications) before redirect
  pageData.ts                    # add optional req?: AppRequest to each builder; merge flashed notifications into viewProps.notifications

packages/pilotiq/src/react/
  AppShell.tsx                   # no change — already reads viewProps.notifications
```

No rudder-side changes.

---

## Implementation steps

1. **Helpers + tests.** New `flash.ts` with `flashNotifications / consumeFlashedNotifications`. Test by mocking `req.session` with `flash / getFlash` (matching `SessionInstance` interface). Cover: empty array no-ops; single + multiple notifications roundtrip; missing session is a silent no-op (host app didn't install `@rudderjs/session`).

2. **Wire writes.** Update `routes.ts` POST handlers (create, edit, global edit, both action dispatches' 303 branches) to call `flashNotifications(req, result.notifications)` before `res.redirect`.

3. **Wire reads.** Add optional `req?: AppRequest` to every `pageData.ts` builder; in each, merge `consumeFlashedNotifications(req)` into the returned `notifications` field. SSR path passes `req`; SPA `+data.ts` passes nothing → `[]` → no-op.

4. **Routes.ts GETs.** Pass `req` into each builder call (single-line change per route).

5. **Smoke test.** In playground: edit an article, save, verify toast appears after the 303 redirect. Delete a row, verify toast. Verify modal-form action still shows toast (regression check on JSON path).

---

## Tests target

435 → ~445. New coverage:
- `flash.ts` — empty, single, multiple, missing session, and that read-then-read returns empty (flash consumed once).
- `routes.test.ts` (if present) — POST returning a notification flashes it; subsequent GET on the redirect target picks it up.

---

## Out of scope

- **Laravel-style `redirect().with(key, value)` router sugar** in rudder. Worth doing once we've used the raw API for a release; would replace `flashNotifications(req, x); res.redirect(url, 303)` with `res.redirect(url, 303).with('pilotiq:notifications', x)`. Defer.
- **Validation errors via flash.** Pilotiq currently returns 422 + re-render in the same request (no redirect, no flash needed). If we later switch to a redirect-based old-input pattern, flash would carry it — but the inline pattern is cleaner and we have no plans to change.
- **`with(...)` chain on `res.redirect`** for non-notification flash values. Same thing — defer to the rudder router sugar plan.
- **Cross-app notifications.** Notifications stay scoped to `pilotiq:` prefix; a host app's own flashes coexist on different keys.

---

## Decision summary

| Question | Answer |
|---|---|
| Does rudder need flash support? | Already has it (`@rudderjs/session.flash / getFlash`). |
| Should pilotiq build its own flash? | No — consume rudder's. |
| Should rudder add `redirect().with(...)` helper? | Not yet. Revisit after this lands and we have usage data. |
| Will this work without rudder session? | The helpers no-op silently if `req.session` is missing. App without session installed loses notifications on 303 path — same as today. |
