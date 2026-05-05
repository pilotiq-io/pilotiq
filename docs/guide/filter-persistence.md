# Filter persistence

`Resource.persistFiltersInSession = true` stashes the active list-page
URL state on the user's session so revisiting the resource from the
sidebar lands back on the same filtered view they last had open. Off by
default — opt in per resource.

> Scope: requires `@rudderjs/session` to be installed and configured on
> the host app. The feature no-ops silently when no session is mounted
> on the request, so it's safe to flip the flag in shared code that
> sometimes runs without a session driver.

## Quick example

```ts
import { Resource } from '@pilotiq/pilotiq'

export class PostResource extends Resource {
  static override label = 'Posts'
  static override slug  = 'posts'

  static override persistFiltersInSession = true

  static override table(t: Table) {
    return t
      .columns([Column.make('title').sortable().searchable()])
      .filters([
        SelectFilter.make('status').options([
          { value: 'draft',     label: 'Draft' },
          { value: 'published', label: 'Published' },
        ]),
      ])
  }
}
```

After the user filters the list down to `?status=draft&sort=title:asc`
and navigates away, the next bare visit to `/admin/posts` (e.g. clicking
the "Posts" link in the sidebar) redirects to
`/admin/posts?status=draft&sort=title:asc` — the URL stays the source
of truth, the session is just a memory of what the URL looked like
last.

## What's persisted

Everything in the URL query string EXCEPT `page` and `tab`:

- All filter values (`status`, `category`, etc.)
- `search`, `sort`, `perPage`, `group`

`page` resets to 1 on every restore — landing back on a stale page
number after the result set has changed isn't useful. `tab` has its own
URL semantics (each tab can have its own canonical link) and isn't
included in the persistence key, so all tabs of a single resource share
one filter slot in v1.

Empty-string filter values (`?status=`, the URL pattern emitted by
clicking the × on an active-filter pill) are written through to the
session but stripped on restore, so explicitly clearing a filter
prevents the bare list URL from springing back to the previous active
filter.

## How it decides to restore

1. **Bare visit** — request URL has zero query params. The route
   handler reads the persisted slice, drops empty values, and `302`
   redirects to the URL with the surviving params attached. Skipped
   when the persisted slice has nothing to restore (empty map or
   only-empty-values).
2. **Non-bare visit** — request URL has at least one query param. The
   route handler writes the current slice to the session (after
   stripping `page` / `tab`) and serves the page normally. Idempotent
   on no-change visits — the helper short-circuits when the slice is
   deep-equal to what's already stored, so revisits don't churn the
   `Set-Cookie` header.

To reset persisted filters in code, point a session driver at the same
storage (cookie / Redis) and `forget('pilotiq:filters:<basePath>:<slug>')`.

## Limitations (v1)

- **One slot per resource, not per tab.** All tabs of a resource share
  one filter slot. Switching tabs from a different page lands at the
  default tab with the previously-active filters reapplied. File a
  consumer-driven bug if you want per-tab keying.
- **No per-table-on-page disambiguation.** If a custom page hosts
  multiple tables, only the resource's own list page is in scope —
  custom-page tables are not persisted by this flag.
- **No "Reset filters" button in v1.** Users reset by clearing each
  active-filter pill individually; the empty-string round-trip stops
  the next bare visit from re-applying.

## Why a 302 instead of in-memory restore?

Redirecting keeps the URL honest — bookmarks, share-links, and the
browser back button all pick up the active filter state. An in-memory
restore would silently apply filters that the URL doesn't reflect,
which is confusing when users copy the URL out of the address bar.
