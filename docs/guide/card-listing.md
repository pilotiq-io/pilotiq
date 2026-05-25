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

Want a table on desktop that only becomes cards on small screens? Reach
for [`Table.stackOnMobile()`](#tablestackonmobilebreakpoint--md) instead of
`cards()` — same card content, but the classic table stays put on wide
viewports.

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

### `Table.cardSchema((record, auto, ctx) => Element[])`

**Optional.** Without it, cards mode renders an **auto-card** built from
the columns (see below). With it, you control the card content. The
handler receives:

- `record` — the row.
- `auto` — the elements pilotiq built automatically (title / image /
  description / `Label · value` lines). Return `[...auto, extra]` to
  **extend** the default card; ignore `auto` to **replace** it entirely.
- `ctx` — the active `TableContext` (search / sort / filters / user).

```ts
// extend the auto-card with one extra element
.cardSchema((record, auto) => [...auto, Badge.make(record.status)])

// replace it completely
.cardSchema((record) => [Image.make(record.coverUrl), Heading.make(record.title)])
```

The schema is resolved server-side via `resolveSchema` once per row
(parallel to `_formatted` / `_visibleActions` stamping), so condition
callbacks and visibility rules see `ctx.record === row`.

### The auto-card

With no `cardSchema`, each card is assembled from what the resource
already knows:

- **Image** — `Resource.recordImageAttribute` (e.g. `'thumbnail'`); if
  unset, the first `ImageColumn` in the table, if any.
- **Title** — `Resource.recordTitleAttribute` (heading), falling back to
  `name` → `title` → `id`.
- **Description** — `Resource.recordDescriptionAttribute` (muted
  subtitle); omitted when unset.
- **Rest** — the other columns as muted `Label · value` lines, reusing
  each row's formatted cell value.

```ts
export class ArticleResource extends Resource {
  static recordTitleAttribute       = 'title'
  static recordImageAttribute       = 'coverImage'   // optional
  static recordDescriptionAttribute = 'excerpt'      // optional
}
```

### `Table.stackOnMobile(breakpoint = 'md')`

Responsive fallback: render the **classic table at/above** the breakpoint
and **one card per row below** it — killing the mobile horizontal scroll
without committing the resource to cards everywhere. Opt-in; breakpoint is
`'sm' | 'md' | 'lg'` (default `'md'`). The mobile card uses the same
content as `cards()` — the auto-card, or your `cardSchema`.

```ts
t.stackOnMobile()        // table ≥ md, cards < md
t.stackOnMobile('lg')    // table ≥ lg, cards < lg
```

| | desktop | mobile |
|---|---|---|
| (nothing) | table | table (horizontal scroll) |
| `stackOnMobile()` | table | auto-card / `cardSchema` |
| `cards()` | cards | cards |

### `Column.visibleFrom(bp)` / `Column.hiddenFrom(bp)`

Per-column responsive visibility (`bp`: `sm | md | lg | xl | 2xl`).
`visibleFrom('md')` shows the column from `md` up (hidden below);
`hiddenFrom('md')` hides it from `md` up (a mobile-only column). Mutually
exclusive. Applies to the desktop table cell **and** the mobile card: a
column visible only at/above the `stackOnMobile` breakpoint is desktop-only
and is dropped from the card. Works on a plain table too (trim columns on
small screens while keeping horizontal scroll).

```ts
Column.make('slug').visibleFrom('lg')   // desktop detail only
Column.make('tags').hiddenFrom('md')    // mobile only
```

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

**`cardSchema` is optional.** Columns drive data semantics (search / sort
/ filter / group / summarize); without a schema the auto-card derives the
visuals from those same columns + the resource's record-identity
attributes. Provide a `cardSchema` only when you want to extend or replace
that default.

**Per-row schema resolution costs N×schema-resolves per page.** Same
shape as `Resource.detail()` — fine for typical 25-row pages. If you
ship card schemas with expensive nested resolvers and large `paginate`
counts, pair with `Resource.deferLoading = true` so the SSR pass skips
records work.

**The auto-card is a sensible default, not a detail page.** It lists the
columns as `Label · value` lines under the title — fine for a compact
mobile card or a quick gallery, but for a media-led layout (large cover,
custom hierarchy) author a `cardSchema`.
