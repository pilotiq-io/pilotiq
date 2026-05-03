# Infolists

Read-only label-value pairs for `ViewPage`. Each **entry** is the
record-bound counterpart to a form field: same composability, same
chrome surface (color / weight / size / tooltip), no input components,
no validators, no submit. Built for `Resource.detail(record)`.

| Entry        | Renders                                                                |
|--------------|------------------------------------------------------------------------|
| `TextEntry`  | Plain text. Default. Honors all built-in formatters.                   |
| `BadgeEntry` | Pill / chip with a per-value color preset (`gray`, `success`, …).      |
| `IconEntry`  | Icon + a11y label, picked from a per-value option map.                 |
| `ImageEntry` | Inline `<img>` from a URL state value. Square / rounded / circle.     |

Entries compose inside the same layout primitives forms use — `Section`,
`Grid`, `Card`, `Tabs`, `Split`, `Group`, `Fieldset`. They inherit
`visible(rule)` / `columnSpan(n)` from `Element` so layout-level
visibility and grid placement work out of the box.

---

## Quick example

```ts
// app/Pilotiq/Posts/PostResource.ts
import {
  Resource, Section, Grid,
  TextEntry, BadgeEntry, IconEntry,
  type Element,
} from '@pilotiq/pilotiq'

export class PostResource extends Resource {
  static override label         = 'Posts'
  static override labelSingular = 'Post'
  static override slug          = 'posts'

  static override detail(_record: unknown): Element[] {
    return [
      Section.make('Overview').schema([
        Grid.make().columns(2).schema([
          TextEntry.make('title').size('lg').weight('semibold'),
          BadgeEntry.make('status').colors({
            draft:     'gray',
            published: 'success',
          }),
        ]),
      ]),
      Section.make('Details').schema([
        Grid.make().columns(2).schema([
          TextEntry.make('authorId').label('Author').inlineLabel().copyable(),
          TextEntry.make('createdAt').label('Created').since(),
          TextEntry.make('updatedAt').label('Updated').dateTime(),
          IconEntry.make('status').label('Live?').options({
            published: { icon: 'check-circle', color: 'success' },
            draft:     { icon: 'x-circle',     color: 'warning' },
          }),
        ]),
      ]),
    ]
  }
}
```

The view page's record loader (the form's `loadRecord` hook, or the
auto-wired ORM `model.find` when `static model` is set) populates
`ctx.record`. Each entry resolves its value at meta-build time via
`record[name]`, runs the formatter chain server-side, and ships the
final wire shape to the renderer.

---

## State resolution

```ts
TextEntry.make('email')
```

Resolves to `record['email']`. Plain attribute access — nested-path
lookup is deferred to a follow-up. Use `formatStateUsing((value, record)
=> string)` when you need to derive a value from sibling fields.

```ts
TextEntry.make('email').formatStateUsing((v, r) => {
  if (!v) return '—'
  return `${v} (verified ${(r as { verifiedAt?: string }).verifiedAt ?? 'no'})`
})
```

`formatStateUsing` runs once at resolve. The result is stamped onto
`_formatted` in the wire payload; the renderer prefers it over re-applying
the built-in `format` spec. Throwing handlers fail soft — the framework
drops `_formatted` and the renderer falls back to the raw value (or the
`default` placeholder).

---

## Built-in formatters (TextEntry only)

Mirror `Column`'s shape exactly so list rows and detail pages stay
visually consistent:

| Method                                | Output                       |
|---------------------------------------|------------------------------|
| `.since()`                            | `"5 minutes ago"`            |
| `.dateTime(pattern?)`                 | `"Jan 1, 2026, 9:00 AM"`     |
| `.money('USD', locale?)`              | `"$1,234.56"`                |
| `.numeric({ decimals?, locale? })`    | `"1,234.56"`                 |
| `.limit(n)`                           | First `n` chars + ellipsis   |

The last formatter wins — chaining `.since().dateTime()` keeps only the
final spec.

---

## Chrome (every entry)

| Method                            | Effect                                              |
|-----------------------------------|-----------------------------------------------------|
| `.label(text)`                    | Override the auto-derived label                     |
| `.inlineLabel()`                  | Lay label to the left of the value                  |
| `.default(s)` / `.placeholder(s)` | Fallback when the resolved value is null / empty    |
| `.helperText(text)`               | Small grey hint below the value                     |
| `.tooltip(text)`                  | Info-icon tooltip next to the label                 |
| `.weight(w)`                      | `normal | medium | semibold | bold`                 |
| `.color(c)`                       | `default | muted | primary | destructive | …`        |
| `.size(s)`                        | `xs | sm | base | lg | xl` (`TextEntry` only)       |
| `.lineClamp(n)`                   | CSS `-webkit-line-clamp` for multi-line truncation  |
| `.wrap()`                         | Allow wrapping (default is `whitespace-nowrap`)     |
| `.copyable(label?)`               | Copy-icon button next to the value                  |
| `.visible(rule)` / `.hidden(rule)`| Inherited from `Element` — layout-level gating      |
| `.columnSpan(n)`                  | Inherited — grid placement under a parent `Grid`    |

Default label = startCase of the attribute name (`publishedAt` →
`Published At`, `first_name` → `First name`).

---

## `BadgeEntry`

```ts
BadgeEntry.make('status').colors({
  draft:     'gray',
  published: 'success',
  archived:  'warning',
})
```

Renders the value as a colored pill. Successive `.colors()` calls
**merge** rather than replace, so you can build the map incrementally.
Unknown values fall back to `gray`. Available presets: `gray`,
`primary`, `success`, `warning`, `destructive`, `info`.

---

## `IconEntry`

```ts
IconEntry.make('verified').options({
  true:  { icon: 'check-circle', color: 'success', label: 'Verified' },
  false: { icon: 'x-circle',     color: 'destructive' },
})
```

Per-value icon name (resolved through the icon registry — same as
`Resource.icon`), optional color preset, optional accessible label. The
`label` falls back to `String(value)` when omitted; missing options
render the entry's `default` fallback or `—`.

---

## `ImageEntry`

```ts
ImageEntry.make('avatarUrl').dimensions(96).circle()
```

State value is the URL. `.width(px)` / `.height(px)` set dimensions
independently; `.dimensions(px)` is a square-image shortcut. Three
shapes: `.square()` / `.rounded()` (default) / `.circle()`. `Entry.size`
(text-size) is inherited but doesn't affect image rendering — use
`dimensions()` for pixels.

---

## When to use entries vs display primes

`Text`, `Heading`, `Alert`, `Image`, `Icon`, `Markdown`, `Html` are
display **primes** — bare-string chrome, no record binding. Use them for
static page chrome (a heading above a section, a "this resource is
read-only" alert, a brand mark).

Entries are **record-bound** label-value pairs. Use them for the actual
data on the detail page.

In a typical detail layout you mix both: a `Heading` for the section
title, then `TextEntry` / `BadgeEntry` for the columns.

---

## Composing inside layouts

Every entry inherits `Element` so all the layout primitives accept them
as children:

```ts
Section.make('Profile').schema([
  Split.make().schema([
    Group.make().schema([
      TextEntry.make('name').size('xl').weight('bold'),
      TextEntry.make('email').copyable(),
    ]),
    Section.make('Membership').aside().schema([
      BadgeEntry.make('tier').colors({ free: 'gray', pro: 'success' }),
      TextEntry.make('joinedAt').since(),
    ]),
  ]),
])
```

`columnSpan(n)` works the same way it does for fields — span entries
across a parent `Grid`'s columns.
