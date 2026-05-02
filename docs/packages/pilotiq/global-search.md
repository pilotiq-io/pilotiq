# Global search

⌘K opens a command palette that searches across every resource that
opted in. Each match shows a title + subtitle and navigates to the
matching record on enter.

## Opting a resource in

```ts filename="app/Pilotiq/Resources/PostResource.ts"
export class PostResource extends Resource {
  static slug = 'posts'
  static globalSearch = true                          // opt in
  static recordTitleAttribute = 'title'

  // Optional overrides — sensible defaults are computed from
  // recordTitleAttribute + every Column.searchable() in static table()
  static globallySearchableAttributes() { return ['title', 'excerpt'] }

  static getGlobalSearchResultTitle(record)    { return record.title }
  static getGlobalSearchResultSubtitle(record) { return record.author?.name ?? '' }
  static getGlobalSearchResultUrl(record, base) { return `${base}/posts/${record.id}` }
}
```

## How matching works

The default `getGlobalSearchQuery(needle)` builds a `LIKE` chain against
`globallySearchableAttributes()`. Override it to use full-text search,
joins, or any custom backend:

```ts
static getGlobalSearchQuery(needle) {
  return Post.query()
    .with('author')
    .where('title', 'LIKE', `%${needle}%`)
    .orWhere('body', 'LIKE', `%${needle}%`)
}
```

> [!NOTE]
> Opt-in by design. Quiet resources (audit logs, system tables) shouldn't
> clutter the palette — leave `globalSearch = false` (the default).

## Limits + behavior

- Min query length: 2 chars
- Max query length: 200 chars
- Max results: 25 total / 5 per resource
- Per-resource `canAccess` + `canViewAny` are checked before any query
  runs
- Errors in one resource don't kill the others — they silently drop

The endpoint is `GET ${basePath}/_search?q=…`.
