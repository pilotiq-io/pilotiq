# Card listing

Switch a resource's list page from the default HTML table to a grid of
**cards** with `Table.cards()` plus a per-row content schema. Useful for
visually rich records — articles with cover images, products with
thumbnails, team members with avatars — where row-by-column doesn't read
as well as a media-led card.

Columns still drive search / sort / filter / group / summarize semantics
in cards mode; only the row-level *rendering* swaps. The top bar gains a
"Sort by" dropdown since column headers (the usual sort affordance) are
hidden.

## Quick example

```ts
import {
  Resource, Table, Column,
  Image, Heading, Text, Group,
} from '@pilotiq/pilotiq'

export class PostResource extends Resource {
  static override label = 'Posts'
  static override slug  = 'posts'

  static override table(t: Table) {
    return t
      .cards()
      .columns([
        Column.make('title').sortable().searchable(),
        Column.make('publishedAt').sortable().dateTime(),
        Column.make('status'),
      ])
      .cardSchema((post: Post) => [
        Image.make(post.coverUrl).rounded().height(160),
        Heading.make(post.title).level(3),
        Group.make().schema([
          Text.make(post.author?.name ?? 'Unknown').size('sm').color('muted'),
          Text.make(formatDate(post.publishedAt)).size('xs').color('muted'),
        ]),
      ])
      .cardsPerRow({ default: 1, sm: 2, lg: 3 })
  }
}
```

## API

### `Table.cards()` / `Table.contentLayout('cards' | 'table')`

Flips the table into cards mode. `cards()` is sugar for
`contentLayout('cards')`. Default is `'table'` (classic HTML table).

```ts
t.cards()                  // cards mode
t.contentLayout('cards')   // explicit
t.contentLayout('table')   // back to default
```

### `Table.cardSchema((record, ctx) => Element[])`

Required when cards mode is on — `toMeta()` throws otherwise. Receives
the row record plus the active `TableContext` (search / sort / filters /
user). Returns a tree of display elements rendered inside each card.

The per-row schema is resolved server-side via `resolveSchema` once per
row (parallel to existing `_formatted` / `_visibleActions` stamping), so
condition callbacks and visibility rules see `ctx.record === row`.

### `Table.cardsPerRow({ default, sm, md, lg, xl, '2xl' })`

Responsive grid column counts. Each entry maps to a Tailwind breakpoint
(`sm`, `md`, `lg`, `xl`, `2xl`); `default` is the base. Values clamp to
`[1, 12]`. Default `{ default: 1, sm: 2, lg: 3 }`.

```ts
t.cardsPerRow({ default: 1, md: 2, xl: 4 })
```

## What goes inside a card

Display-only — `Form` / `Field` / `Filter` / `Action` are unsupported
inside `cardSchema` in v1. Reuse anything that doesn't carry interactive
state:

- **Layout primitives** — `Group`, `Split`, `Grid`, `Section`, `Card`
- **Display primes** — `Heading`, `Text`, `Image`, `Icon`, `Markdown`,
  `Html`, `Alert`, `Divider`, `UnorderedList`
- **Read-only entries** — `TextEntry`, `BadgeEntry`, `IconEntry`,
  `ImageEntry`, `KeyValueEntry`, `ColorEntry`, `ComponentEntry`

## Composes with existing chrome

Every other Table feature keeps working in cards mode:

| Feature | Behavior in cards mode |
|---|---|
| `searchable()` columns | Search input still in top bar |
| `sortable()` columns | Top-bar "Sort by" dropdown (since `<thead>` is hidden) |
| `.filters([...])` | Same filter popover above the cards |
| `.recordUrl(fn)` | Whole card becomes a stretched link (cmd-click opens new tab) |
| `.recordActions([...])` | Renders as an action bar inside each card's footer |
| `.bulkActions([...])` | Per-card checkbox top-right; bulk toolbar appears above cards on selection |
| `.headerActions([...])` | Same top-right placement as table mode |
| `.defaultGroup(col)` / `.groups([...])` | Heading row above each section; per-section grid |
| `.summarize([...])` | Footer aggregates render below the grid |
| `Resource.persistFiltersInSession` | Same — filters/sort persist between visits |
| `Resource.deferLoading` | Cards mode still loads via the deferred JSON endpoint |
| `Table.poll(seconds)` | Auto-refresh re-renders the grid |

`Table.reorderable()` and editable cell columns are not supported in
cards mode in v1 — drop them or use the default `'table'` layout.

## Tradeoffs

**Both `columns` and `cardSchema` required.** Columns drive data
semantics (search / sort / filter / group / summarize); the schema drives
visuals. v1 keeps these as two separate authorings rather than auto-
deriving one from the other.

**Per-row schema resolution costs N×schema-resolves per page.** Same
shape as `Resource.detail()` — fine for typical 25-row pages. If you
ship card schemas with expensive nested resolvers and large `paginate`
counts, pair with `Resource.deferLoading = true` so the SSR pass skips
records work.

**Cards don't dump every column.** Skip `cardSchema` entirely and the
renderer shows a "No card content configured" placeholder — explicit
opt-in only, no auto-fallback to "render every column stacked." Author
the card content the way you'd author a detail page.
