# Infolists

Read-only label-value pairs for `ViewPage`. Each **entry** is the
record-bound counterpart to a form field: same composability, same
chrome surface (color / weight / size / tooltip), no input components,
no validators, no submit. Built for `Resource.detail(record)`.

| Entry           | Renders                                                                |
|-----------------|------------------------------------------------------------------------|
| `TextEntry`     | Plain text. Default. Honors all built-in formatters.                   |
| `BadgeEntry`    | Pill / chip with a per-value color preset (`gray`, `success`, …).      |
| `IconEntry`     | Icon + a11y label, picked from a per-value option map.                 |
| `ImageEntry`    | Inline `<img>` from a URL state value. Square / rounded / circle.      |
| `KeyValueEntry` | Two-column key/value table. Reads objects or JSON-string blobs.        |
| `ColorEntry`    | Swatch chip + raw value. For hex / rgb / oklch CSS color strings.      |
| `CodeEntry`     | Monospace `<pre><code>` for JSON blobs / config snippets / commands.   |
| `ComponentEntry`| Escape-hatch — hands rendering to a registered React component.        |

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

Resolves to `record['email']` by default — plain attribute access keyed
on the entry's `name`.

### `state(path | fn)`

Override the default lookup when the value lives at a nested path or
needs to be derived from the record. Two forms:

```ts
// Dotted-path traversal (joined / nested data)
TextEntry.make('authorName').state('author.name').label('Author')

// Numeric segments index into arrays
TextEntry.make('firstTag').state('tags.0.label')

// Function accessor (computed values)
TextEntry.make('total').state(
  (r) => Number((r as { subtotal: number }).subtotal)
       + Number((r as { tax: number }).tax),
)
```

The entry's `name` still drives the auto-derived label and the wire-side
discriminator key, so call `.label(...)` alongside `.state(...)` when the
path doesn't read well as a heading.

Missing intermediates (`record.author === null`) and walking past a
primitive resolve to `undefined` — no throws. Function accessors that
throw fail soft (value falls back to `undefined`); the renderer then
shows the `default(...)` placeholder.

### `formatStateUsing(fn)`

`state()` resolves the *value*; `formatStateUsing` formats it. Compose
both:

```ts
TextEntry.make('authorName')
  .state('author.name')
  .formatStateUsing((v) => String(v).toUpperCase())
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

## `KeyValueEntry`

```ts
KeyValueEntry.make('headers')
  .keyLabel('Header')
  .valueLabel('Value')
```

The state value can be a plain object **or** a JSON-encoded string —
the renderer parses strings on the way out, so it pairs cleanly with
`KeyValueField` (which serializes to a JSON blob on submit). Nested
values render as their JSON string for compactness; non-JSON strings
fall through to the entry's `default()` fallback.

Useful for debug surfaces — request headers, webhook payloads, plan
metadata — anywhere you'd otherwise dump `<pre>{JSON.stringify(...)}</pre>`.

---

## `ColorEntry`

```ts
ColorEntry.make('brandColor').dimensions(28).circle()
```

State value is a CSS color string (`#aabbcc`, `rgb(...)`, `oklch(...)`,
…) rendered as a colored chip. The raw value is shown beside the swatch
by default; toggle with `.hideValue()` for a chip-only layout. Same
`.width / .height / .dimensions / .square / .rounded / .circle` setters
as `ImageEntry`.

---

## `RepeatableEntry`

Display-side sibling of `Repeater` — renders an array stored on the
record as a stack of cards (default), an n-column grid, or a compact
HTML table.

```ts
RepeatableEntry.make('lineItems').schema([
  TextEntry.make('description'),
  TextEntry.make('quantity').numeric(),
  TextEntry.make('total').money('USD'),
]).table([
  { label: 'Item' },
  { label: 'Qty', alignment: 'right' },
  { label: 'Total', alignment: 'right', width: '8rem' },
])
```

The inner schema resolves once per row with `record` scoped to that
row's data, so inner entries (`TextEntry / BadgeEntry / IconEntry / …`)
read state via the same `record[childName]` lookup they use anywhere
else.

| Setter | Effect |
|---|---|
| `.schema([Entry…])` | Inner entries rendered per row. |
| `.columns(n)` | Grid the inner schema *inside* one card (mirrors `Repeater.columns`). |
| `.grid(n)` | n cards across (`n >= 2`); lower clears the grid mode. |
| `.table([{label, alignment?, width?}])` | Compact `<table>` layout — columns map 1:1 to inner schema by declaration order. |
| `.contained(false)` | Strip the outer card chrome. |

The renderer dispatches `table > grid > stack` — the most-specific
layout wins.

Empty / non-array / null falls through to the inherited `default()`
placeholder. For arrays of primitives, target them via a reserved
`_value` key:

```ts
RepeatableEntry.make('tags').schema([TextEntry.make('_value').label('Tag')])
// record.tags = ['featured', 'sale', 'new']
```

---

## `CodeEntry`

```ts
CodeEntry.make('payload').language('json').copyable()
```

Read-only sibling of `CodeEditorField` — renders the resolved value as
`<pre><code>` with a monospace font. `language(id)` is a hint passed
through to the meta; v1 ships **without bundled syntax highlighting**
to keep the core small. For pretty-printing JSON / objects, pair with
`formatStateUsing(JSON.stringify)`:

```ts
CodeEntry.make('config')
  .language('json')
  .formatStateUsing(v => JSON.stringify(v, null, 2))
  .copyable()
```

---

## `ComponentEntry`

Escape hatch for cases the built-in entries don't fit — a coordinates
map, an audit-trail timeline, a syntax-highlighted JSON viewer.
`ComponentEntry` hands rendering off to a user-supplied React component
registered at app boot.

```ts
// app/Pilotiq/Posts/ReadingStats.tsx
import type { EntryComponentProps } from '@pilotiq/pilotiq/entries'

export function ReadingStats({ value }: EntryComponentProps) {
  const text  = typeof value === 'string' ? value : ''
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
  return <div>{words.toLocaleString()} words</div>
}
```

```ts
// pages/+Layout.tsx (client-side bootstrap)
import { registerEntryComponents } from '@pilotiq/pilotiq/entries'
import { ReadingStats } from '../app/Pilotiq/Posts/ReadingStats.js'

registerEntryComponents({ ReadingStats })
```

```ts
// PostResource.ts
ComponentEntry.make('readingStats')
  .component('ReadingStats')
  .state((r) => (r as { body?: string }).body ?? '')
  .label('Reading stats')
```

The component receives `{ value }` as its sole prop — `value` is the
entry's resolved state (honors `.state(path | fn)` like any other
entry). Use `state(r => composedObject)` when the component needs
several record fields:

```ts
ComponentEntry.make('coords')
  .component('CoordinatesMap')
  .state((r) => ({ lat: (r as any).lat, lng: (r as any).lng }))
```

### Subclass form

For repeated use, extend `ComponentEntry` so the component name lives
on a stable class:

```ts
export class CoordinatesMap extends ComponentEntry {
  static override componentName = 'CoordinatesMap'
}

CoordinatesMap.make('location').label('Where')
```

The instance setter (`.component('Other')`) overrides the static.

### Failure modes

Both wiring mistakes paint inline error panels rather than throwing:

- **No `component` name** — neither `static componentName` nor
  `.component('...')` set. Reminder shown.
- **Component not registered** — name set but no matching entry in the
  registry. Reminder shown with the exact `registerEntryComponents`
  snippet.

Render-time errors inside the user component propagate to React's
nearest error boundary — the chrome around `ComponentEntry` doesn't
wrap each instance in its own boundary.

### When *not* to use it

If the cosmetic surface of an existing entry is close (e.g. a styled
text snippet), prefer `TextEntry` + `formatStateUsing` — the wire stays
tiny and you don't need a registered component. Reach for
`ComponentEntry` only when the rendering itself isn't expressible
through the built-in entries.

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
