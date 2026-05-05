# Defer loading

`Resource.deferLoading = true` skips server-side row loading on the
list page and paints a skeleton on first frame. The actual rows fetch
asynchronously after mount from `GET {base}/{slug}/_table`. Off by
default — opt in per resource when the table's `records()` query is
slow enough that an initial blocking paint feels broken.

## Quick example

```ts
import { Resource, Table, Column } from '@pilotiq/pilotiq'

export class ReportResource extends Resource {
  static override label = 'Reports'
  static override slug  = 'reports'

  static override deferLoading = true

  static override table(t: Table) {
    return t
      .columns([Column.make('title').sortable().searchable()])
      .records(async () => {
        // Slow aggregate / cross-shard / external API — paints a
        // skeleton instantly, fills in once this resolves.
        return slowReportQuery()
      })
  }
}
```

The first frame paints chrome (heading, filter pills, current sort,
pagination shell — all derived from the URL and the schema) plus a
skeleton row stack. Once the JSON response lands, the renderer swaps
in the real rows.

## What still runs on the SSR pass

- Schema resolution (columns / filters / actions / header & footer
  widgets — those load eagerly through the existing widget path).
- Filter parsing + mirroring (active-filter pills show on first frame).
- Sort / page / search reconciliation against the URL (the chrome shows
  the user's current state).
- Active-tab + tab badge resolution.

## What's deferred

- The `Table.records()` handler.
- Per-row server-side `formatStateUsing` evaluation.
- Per-row `recordUrl` / `recordClasses` / row-action visibility stamping.
- Footer + per-group summarizers.
- `_cellEditUrls` for editable columns.

All of those run inside the `_table` JSON endpoint when the client
fetches it, so the eventual frame is identical to a non-deferred
render.

## Composes with `persistFiltersInSession`

Bare-visit redirects happen BEFORE the deferred-load decision. A user
opening `/admin/reports` with persisted filters gets `302` redirected
to `/admin/reports?status=published`, then the redirected URL paints
the skeleton + fetches `/_table?status=published`. The two flags are
orthogonal — turn either on or both.

## SPA navigation

Filter / sort / page changes trigger Vike SPA nav. The new URL re-runs
the SSR data builder, which re-stamps the table as deferred and
re-paints the skeleton; the deferred-load effect fires another fetch
against `_table` with the new query string. Every navigation pays one
skeleton frame.

## Limitations (v1)

- **Always-on per resource.** No per-page / per-table override — every
  list-page table for a deferred resource is deferred. Custom-page
  tables aren't in scope.
- **No prefetch on idle.** The fetch only fires after mount. Clients
  with very fast networks see a sub-100ms skeleton blip even when the
  query itself is fast; opt out for tables that already paint quickly.
- **One fetch per nav.** Polling tables (`Table.poll(seconds)`) keep
  their existing refresh behavior on top of deferred loading — the
  initial paint is deferred, then `poll` resumes its setInterval refresh.
