# Extending pilotiq

Pilotiq's UI is schema-driven: every form input, table column, infolist
entry, and dashboard widget is an `Element` subclass that emits a
declarative wire shape, which a registered React component renders on
the client. The same machinery is open to your code — you can add new
field types, column types, infolist entries, and widgets without
forking the package.

This guide consolidates the four extension points. They all share the
same shape:

1. **Subclass** an `Element` base (`Field` / `Column` / `Entry` / a
   widget element like `View`) and emit a custom wire meta from
   `toMeta(ctx)`.
2. **Register** a React component for the wire shape's discriminator,
   so `SchemaRenderer` knows what to mount.

```ts
import { Field } from '@pilotiq/pilotiq'
import { registerFieldRenderer } from '@pilotiq/pilotiq/react'

class CoordinatesField extends Field {
  static override make(name: string): CoordinatesField {
    const f = new CoordinatesField(name, 'coordinates')
    return f
  }
}

// bootstrap/providers.ts
registerFieldRenderer('coordinates', CoordinatesInput)
```

`CoordinatesField.make('location')` then drops into any
`Resource.form()` like every built-in field.

## Picking the right extension point

| Need | Extension | Renders inside |
|---|---|---|
| Editable form input | **Custom field** | `Resource.form()` / `CreatePage` / `EditPage` / form modals |
| Display cell in a table | **Custom column** | `Resource.table()` / any `Table.make()` |
| Read-only label/value pair | **Custom infolist entry** | `Resource.detail()` / view pages |
| Server-data widget on a dashboard / list page | **Custom widget** | `Page.schema()` dashboards / `Resource.headerSchema()` |

Reach for the **`ComponentEntry` / `View` escape hatches first** — both
let you ship a one-off React component without writing a new
`Element` subclass. Subclass when (a) you want stable static metadata
(`static componentName`, `static getData`, server-side hooks) or (b)
the same surface lands in many places and a fluent name reads better
than `.component('...')` at every call site.

## Wire-shape mental model

Every Element subclass implements two halves:

- **Server side** — `toMeta(ctx)` returns a plain object containing a
  **discriminator** (`fieldType` / `columnType` / `entryType` / `type`)
  plus whatever bonus keys your renderer needs. The base class fills
  in the chrome (label, helper text, formatters), so you only spread
  custom keys on top.
- **Client side** — `SchemaRenderer` looks up a component by the
  discriminator (or by a name on the meta, for `ComponentEntry` and
  `View`) and renders it with a narrow prop signature. Renderers read
  the rest off the meta directly — keeps the prop contract stable
  across types.

The wire shape ships through Vike's `viewProps`, so it must be plain
JSON. Do not stash class instances, functions, or `Date` objects on
your meta — they will not survive serialization.

## Custom field

A custom field subclasses `Field`, sets a unique `fieldType` string,
and registers a React renderer keyed by that string.

### 1. Subclass `Field`

```ts
import { Field, type FieldMeta } from '@pilotiq/pilotiq'
import type { RenderContext } from '@pilotiq/pilotiq'

export class CoordinatesField extends Field {
  protected _zoom = 14

  static override make(name: string): CoordinatesField {
    return new CoordinatesField(name, 'coordinates')
  }

  zoom(level: number): this {
    this._zoom = level
    return this
  }

  override toMeta(ctx?: RenderContext): FieldMeta & { zoom: number } {
    return { ...this.buildMeta(ctx), zoom: this._zoom }
  }
}

export const Coordinates = CoordinatesField
```

`buildMeta(ctx)` is a `protected` hook on `Field` that emits every
standard key (`label`, `required`, `defaultValue`, validator
serialization, formatters, `_layout`, etc.). Spread it, then add any
custom keys your renderer needs.

The constructor's second argument (`'coordinates'` here) is the
`fieldType` discriminator — keep it unique across your app and any
adapter packages you use.

### 2. Register the renderer

```ts
// bootstrap/providers.ts
import { registerFieldRenderer } from '@pilotiq/pilotiq/react'
import { CoordinatesInput } from '#fields/CoordinatesInput.js'

registerFieldRenderer('coordinates', CoordinatesInput)
```

The component receives `FieldRendererProps`:

```ts
interface FieldRendererProps {
  el:           ElementMeta  // your FieldMeta — read `el.zoom` etc.
  name:         string
  defaultValue: unknown
  required:     boolean
  disabled:     boolean
  placeholder:  string | undefined
}
```

The component owns posting the value into the form — typically by
rendering a `<input type="hidden" name={name} value={...}>` alongside
its UI controls. Read everything else (validation rules, custom keys
you serialized) directly off `el`.

### 3. Use it

```ts
static override form(form: Form): Form {
  return form.schema([
    Coordinates.make('location').zoom(16).required(),
  ])
}
```

### Reactive fields

Live re-resolve hooks and client-side handlers compose with custom
fields automatically:

```ts
Coordinates.make('location')
  .live()
  .afterStateUpdated(({ $set }) => $set('locationLabel', 'Updated'))
```

For `live()` to fire on input you typically need to call
`triggerLive(name, value)` from your renderer when the value changes
— mirror the pattern in `react/fields/SliderInput.tsx`.

### First-party reference

`packages/tiptap/src/RichTextField.ts` — a field with rich
server-side options + a complex client-side editor (Tiptap), wired
through the same two-step pattern.

### Failure mode

An unregistered `fieldType` falls through to a plain `<input>`. No
errors, no warnings — check the field type spelling on both sides if
your custom UI doesn't show up.

## Custom column

Columns subclass `Column`, set a `columnType` discriminator via
`setColumnType()`, and serialize extra keys via `serializeExtras()`.
**Note:** unlike fields/entries/widgets, the renderer dispatch lives in
a built-in switch inside `SchemaRenderer.tsx` — there is no public
runtime registry for new column types. To extend tables, your options
are:

1. **Reuse an existing `columnType` and customize via formatters.** This
   covers most cases — `.formatStateUsing(fn)` runs server-side per
   row and stamps `row._formatted[colName]`, which the built-in
   renderers prefer over the raw value.
2. **Subclass an existing column type** to add new fluent setters that
   land under existing wire keys (e.g. add a sugar `.statusColor()`
   helper that calls `setColumnType('badge')` and writes to the
   existing `badgeColors` map).
3. **Contribute upstream** if you need a brand-new `columnType` with
   distinct rendering semantics. In practice, the eight built-ins
   (`text` / `badge` / `icon` / `boolean` / `image` / `color` /
   `textInput` / `toggle` / `select`) cover almost everything; pair
   them with `.formatStateUsing` and you rarely need a new type.

### Subclass example (existing column type)

```ts
import { Column, type ColumnMeta } from '@pilotiq/pilotiq'

export class StatusColumn extends Column {
  protected _statusColors: Record<string, string> = {
    draft: 'gray', published: 'success', archived: 'warning',
  }

  static override make(name: string): StatusColumn {
    const c = new StatusColumn(name)
    c.setColumnType('badge')
    return c
  }

  protected override serializeExtras(meta: ColumnMeta): void {
    meta.badgeColors = this._statusColors
  }
}
```

### First-party reference

`packages/pilotiq/src/columns/BadgeColumn.ts` — the canonical
"subclass `Column`, set columnType, override `serializeExtras`"
pattern, in 33 lines.

## Custom infolist entry

Infolist entries are read-only label/value pairs in a `Resource.detail()`
schema. Every entry subclass extends `Entry`, sets `getEntryType()`,
and (if it ships custom UI) registers a React component via
`registerEntryComponents`.

For most one-off displays, **start with `ComponentEntry`** rather
than a new subclass — it's the entry escape hatch. Subclass `Entry`
directly only when you want the typed setters to live on a stable
class.

### Quick path — `ComponentEntry`

```ts
// CoordinatesMap.tsx
export function CoordinatesMap({ value }: { value: unknown }) {
  const coords = value as { lat: number; lng: number } | null
  if (!coords) return <span>—</span>
  return <Map lat={coords.lat} lng={coords.lng} />
}
```

```ts
// bootstrap/providers.ts
import { registerEntryComponents } from '@pilotiq/pilotiq/entries'
import { CoordinatesMap } from '#entries/CoordinatesMap.js'

registerEntryComponents({ CoordinatesMap })
```

```ts
// PostResource.detail()
import { ComponentEntry } from '@pilotiq/pilotiq'

ComponentEntry.make('location').component('CoordinatesMap')
```

The component receives `{ value }` only — the resolved state value
from `record[name]` (or whatever `.state(...)` returns).

If your component needs more than one record field, pack them via
`.state()`:

```ts
ComponentEntry.make('location')
  .component('CoordinatesMap')
  .state(record => ({ lat: record.lat, lng: record.lng }))
```

### Subclass form (stable component name)

For a component used across many resources, fix the registry key on a
subclass so `.component(...)` doesn't repeat at every call site:

```ts
import { ComponentEntry } from '@pilotiq/pilotiq'

export class CoordinatesMapEntry extends ComponentEntry {
  static componentName = 'CoordinatesMap'
}

// Resource.detail()
CoordinatesMapEntry.make('location')
```

### Custom typed entry (rare)

When you want a brand-new typed entry leaf (its own `entryType`
discriminator + bespoke fluent setters), extend `Entry` and override
`getEntryType()` + `toMeta()`. Currently the SchemaRenderer's entry
switch dispatches built-in types directly; new typed entries need
either the `ComponentEntry` route or an upstream contribution.

### First-party references

- `packages/pilotiq/src/entries/TextEntry.ts` — minimal `Entry`
  subclass with auto-render of richtext.
- `packages/pilotiq/src/entries/ComponentEntry.ts` — the escape-hatch
  pattern detailed above.

### Failure mode

Calling `.component('Missing')` against an unregistered name renders
an inline error panel pointing at the registration site:

```
This entry's component is not registered.
import { registerEntryComponents } from '@pilotiq/pilotiq/entries'
registerEntryComponents({ Missing: Missing })
```

Calling `ComponentEntry.make()` without `.component()` and without
`static componentName` falls back to using the entry's `name`, which
typically also misses — same error panel.

## Custom widget

"Widget" covers two distinct extension paths:

- **Path A — register a `View` component (most common).** Hand any
  React component to a `View` widget element. Use this for one-off
  dashboard widgets: contribution heatmaps, embedded charts, custom
  status panels.
- **Path B — register a new widget element type (rare).** Build a new
  widget primitive (chart, custom table) that adapter packages can
  ship. Use this when the surface is reusable across consumers — see
  how `@pilotiq/recharts` ships the `Chart` widget.

### Path A — register a `View` component

```ts
// CalendarHeatmap.tsx
export function CalendarHeatmap({ data }: { data?: unknown }) {
  const days = (data as { days?: number[] })?.days ?? []
  return <Heatmap days={days} />
}
```

```ts
// bootstrap/providers.ts
import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'
import { CalendarHeatmap } from '#widgets/CalendarHeatmap.js'

registerWidgetComponents({ CalendarHeatmap })
```

Use it via the fluent form for a one-off:

```ts
import { View } from '@pilotiq/pilotiq'

View.make('contributions')
  .component('CalendarHeatmap')
  .getDataHandler(async () => ({ days: await Activity.last(365).countByDay() }))
```

…or via the subclass form when the same widget appears in many
places:

```ts
export class ContributionMap extends View {
  static columnSpan = 3
  static componentName = 'CalendarHeatmap'
  static async getData() {
    return { days: await Activity.last(365).countByDay() }
  }
}

// Page.schema()
ContributionMap.make()
```

`View` extends `ServerDataElement`, which means the framework handles
the lazy-fetch / poll / loading-skeleton lifecycle for you — your
component just receives `{ data }` once it's resolved.

### Path B — register a new widget element type

For an adapter package shipping a new widget primitive (its own
`type` discriminator separate from `'view'` / `'stats'` /
`'tableWidget'`):

1. Subclass `ServerDataElement`, override `getType()` to return your
   new type string, and emit your custom meta from `toMeta()`.
2. Register a renderer for the new type in your package's boot helper:

```ts
import { registerWidgetRenderer, type WidgetRendererProps } from '@pilotiq/pilotiq/react'

function ChartWidget({ meta }: WidgetRendererProps) {
  // read meta.data, meta.kind, etc.
  return <RechartsThing data={meta.data} kind={meta.kind} />
}

export function registerChartRenderer(): void {
  registerWidgetRenderer('chart', ChartWidget)
}
```

Consumers call `registerChartRenderer()` once at boot.

### First-party references

- `packages/pilotiq/src/schema/View.ts` — Path A: the `View`
  escape-hatch widget.
- `packages/recharts/src/` (in the `@pilotiq/recharts` adapter
  package) — Path B: a brand-new `chart` widget element type
  registered via `registerWidgetRenderer`.

### Failure modes

- **Path A** — calling `.component('Missing')` (or letting the id
  fallback) without registering shows an inline amber alert with the
  exact registration snippet to copy.
- **Path B** — an unknown widget `type` shows the same amber alert
  pointing at `registerWidgetRenderer`. Adapter packages should ship
  a single `registerXyz()` boot helper rather than asking consumers to
  call the registry directly.

## Field label slot

`registerFieldLabelSlot` lets a plugin inject a React component inline
next to any field label that has opted into the slot via extra meta
keys. It's a plugin-author API — regular app code doesn't call it
directly.

```ts
import { registerFieldLabelSlot, type FieldLabelSlotProps } from '@pilotiq/pilotiq/react'

function MyTrigger({ fieldName, actions, agentRunBase }: FieldLabelSlotProps) {
  return <button>✦</button>
}

// Call once from your plugin's register(panel) step:
registerFieldLabelSlot(MyTrigger)
```

`SchemaRenderer` calls `getFieldLabelSlot()` inside `renderField`.
When a slot is registered and the field's resolved meta carries
`aiActions` + `_agentRunBase` (stamped server-side by
`tagFieldAiUrls`), the component renders inside the `<label>` row.

Only one slot can be registered globally (last write wins). The
`FieldLabelSlotProps` shape is:

```ts
interface FieldLabelSlotProps {
  fieldName:    string
  actions:      Array<{ slug: string; label: string; icon?: string }>
  agentRunBase: string  // pre-composed POST base URL
}
```

**First-party reference:** `@pilotiq-pro/ai` uses this to mount the
✦ quick-action button + dropdown on every field that called `.ai([...])`.

## Subpath cheatsheet

```ts
// Top-level surface
import { Field, Column, Entry, View, ComponentEntry, ServerDataElement } from '@pilotiq/pilotiq'

// React-side registries
import { registerFieldRenderer, registerWidgetRenderer } from '@pilotiq/pilotiq/react'
import { registerFieldLabelSlot } from '@pilotiq/pilotiq/react'
import type { FieldRendererProps, WidgetRendererProps, FieldLabelSlotProps } from '@pilotiq/pilotiq/react'

// Component-by-name registries (kept on dedicated subpaths so they
// don't drag SchemaRenderer onto Node-only paths at boot)
import { registerEntryComponents }  from '@pilotiq/pilotiq/entries'
import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'
import { registerSlotComponents }   from '@pilotiq/pilotiq/slot-components'
```

The `entries`, `widgets`, and `slot-components` subpaths are
deliberately separate from the main package entry — that lets
`bootstrap/providers.ts` register components on the server without
pulling in the React renderer tree. Mirror the pattern when you split
your own extensions into a side-effect-free boot file.

## Plugin-contributed UI via `SlotComponent`

`Entry` and `View` are record-shaped (label / value / state); `Field`
binds to form input. When you need to mount a plugin-contributed React
component **anywhere a layout slot accepts an Element** — toolbar
chips, header dropdowns, sidebar contributions, custom action rows —
reach for `SlotComponent`. It's a generic escape hatch: the schema
element ships only the registered component name + a serialisable
`props` bag, and the renderer mounts the registered component verbatim
at that position.

The headline use case is the **resource-page header actions row**.
Pilotiq's render-hook API exposes
`panels::resource.pages.{list,create,edit,view}-record(s).header.actions.{before,after}`
— a plugin (or your `bootstrap/providers.ts`) registers a callback that
returns `[SlotComponent.make('YourComponent').props({ basePath, recordId })]`,
and the renderer mounts the React component alongside the built-in
`Create` / `View` / `Delete` / `Save` chips. Same applies to alert /
empty-state action rows and the table bulk-toolbar — `SlotComponent`
passes their `'action' | 'actionGroup'` filter alongside.

The example below adds a "bookmark this page" star chip into every
resource role's header. Same shape works for any custom component —
swap `BookmarkButton` for the React component you actually need.

```tsx
// BookmarkButton.tsx — your custom React component
import { useNavigate } from '@pilotiq/pilotiq/react'

export interface BookmarkButtonProps {
  basePath:     string
  resourceSlug: string
  recordId?:    string
}

export function BookmarkButton({ basePath, resourceSlug, recordId }: BookmarkButtonProps) {
  // …handle bookmark add/remove against your favourites table…
  return <button type="button">★</button>
}
```

```ts
// bootstrap/providers.ts — register the component by name
import { registerSlotComponents } from '@pilotiq/pilotiq/slot-components'
import { BookmarkButton } from '#components/BookmarkButton.js'

registerSlotComponents({ BookmarkButton })
```

```ts
// app/Pilotiq/AdminPanel.ts — contribute the chip via render-hooks
import { Pilotiq, SlotComponent, type RenderHookName } from '@pilotiq/pilotiq'

const RESOURCE_HEADER_SLOTS = [
  'panels::resource.pages.list-records.header.actions.before',
  'panels::resource.pages.create-record.header.actions.before',
  'panels::resource.pages.edit-record.header.actions.before',
  'panels::resource.pages.view-record.header.actions.before',
] as const satisfies readonly RenderHookName[]

export const adminPanel = Pilotiq.make('Admin')
  .resources([/* … */])
  .use({
    name: 'app:bookmark-button',
    register(panel) {
      for (const slot of RESOURCE_HEADER_SLOTS) {
        panel.renderHook(slot, (ctx) => {
          if (!ctx.resource) return []
          return [
            SlotComponent.make('BookmarkButton').props({
              basePath:     ctx.basePath,
              resourceSlug: ctx.resource.getSlug(),
              recordId:     ctx.recordId,
            }),
          ]
        })
      }
    },
  })
```

The component is registered by name (string), not by reference. That
keeps the wire shape small (a string id, not a serialised React tree)
and lets the schema travel through SSR / SPA-nav `viewProps` without
ever shipping the renderer reference itself. Same model as `View`
widgets and `ComponentEntry` infolist leaves.

## Layout providers

`Pilotiq.layoutProvider(C)` registers a React component that wraps the
panel's `<AppShell>` children at the layout root. Use this when a
plugin needs to install a React context / provider that should be in
scope for every page in the panel — an AI chat queue context, a
tenant theme switcher, a feature-flag overlay, etc — without forcing
consumers to edit their `+Layout.tsx`.

```ts
// Inside a plugin's register(panel):
panel.layoutProvider(({ children, basePath }) =>
  <AiUiProvider panelPath={basePath}>{children}</AiUiProvider>
)
```

The provider receives `{ children, basePath? }` props. Registration
order is preservation order: the first provider sits **outermost**
(closest to the layout root); the last sits **innermost** (closest to
the page tree). When two providers depend on each other, register the
producer first.

Bulk variant:

```ts
panel.layoutProviders([ProviderA, ProviderB])
```

Layout-provider components are harvested into the build-time
`layoutProviderRegistry` (parallel to `componentRegistry` /
`rightPanelRegistry`) — the refs never travel over the wire.

> Want to *replace* a region of the panel chrome instead of wrapping
> it? Use [`Pilotiq.components({ nav, header, footer })`](./component-slots.md)
> for full region replacement, or [render hooks](./render-hooks.md) to
> splice into named positions.

## AI suggestion mode

`Pilotiq.aiSuggestionsMode(mode)` sets the panel-wide policy for what
happens when an AI agent calls a write tool against a form field.

```ts
Pilotiq.make('admin').aiSuggestionsMode('review')
```

| Mode | Effect |
|---|---|
| `'auto'` (default) | Agent writes apply immediately to the form state. Existing behavior. |
| `'review'` | Writes stage as `PendingSuggestion`s. Text fields show an inline diff; other field types show a current → suggested comparison with Approve / Reject buttons. Approve runs the field's registered applier (`registerPendingSuggestionApplier`); Reject discards. |

Field types can also override the panel mode per-field — see the
`afterStateUpdated` / `PendingSuggestionApplier` registries in
`@pilotiq/pilotiq/react` for the per-applier wire-up. Most consumers
just set the panel-level mode and rely on the bundled appliers shipped
by each field type.

The mode rides through `panelInfo()` onto a window global
(`__pilotiqAiSuggestionsMode`) so the AI plugin's client-side write
tool can read it without context plumbing. Singleton — doesn't change
between pages within the same panel.

## Related

- Reference: [`docs/packages/pilotiq/schema.md`](../packages/pilotiq/schema.md) — the `Element`
  contract, base classes, and built-in subtypes in full.
- Plan: [`docs/plans/phase-1-schema-foundation.md`](../plans/phase-1-schema-foundation.md) —
  why the schema/serialize/render split exists.
- Adapter examples: `@pilotiq/tiptap` (custom field), `@pilotiq/recharts`
  (custom widget element type), `@pilotiq/codemirror` (custom field
  with a hand-rolled register helper).
