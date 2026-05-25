# TableWidget & View

## TableWidget — a compact "top N" table

Distinct from the resource list `Table` — `TableWidget` is a dashboard tile
showing a few rows + an optional "view all" link.

```ts
import { TableWidget, Column } from '@pilotiq/pilotiq'

export class RecentPosts extends TableWidget {
  static override label      = 'Recent posts'
  static override model      = Post
  static override viewAllUrl = '/admin/posts'

  static override columns() {
    return [
      Column.make('title').limit(40),
      Column.make('status'),
      Column.make('createdAt').since(),
    ]
  }
  static override async query(q) { return q.paginate(1, 5) }   // default: top 5
}
```

Fluent form:

```ts
TableWidget.make('recent-posts')
  .label('Recent posts')
  .model(Post)
  .query(q => q.paginate(1, 5))
  .columns([Column.make('title'), Column.make('status').dateTime()])
  .viewAllUrl('/admin/posts')
```

- Resolution order: `instance.records → static records → instance model+query → static model+query` (throws if none resolve). Default query = `q => q.paginate(1, 5)`.
- Per-row `Column.formatStateUsing` runs in the resolver and stamps `row._formatted[col]` (same as the big table). Columns inline under `meta.columns`, not `meta.children`.
- It's read-only — no sort / filter / pagination chrome. For those, it's a real resource list page, not a widget.

## View — a custom React component as a widget

When none of the built-ins fit, render your own component. The widget ships
the component **name** + resolved data; you register the component on the
client.

```ts
// 1. the widget element (server side — getData runs on the server)
import { View } from '@pilotiq/pilotiq'

export class ActivityFeedView extends View {
  static override componentName = 'ActivityFeed'
  static override async getData(ctx) {
    return { events: await Event.query().latest().paginate(1, 8) }
  }
}
```

```tsx
// 2. the component (client side) + registration, in pages/+Layout.tsx
import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'
import { ActivityFeed } from '../app/Pilotiq/widgets/ActivityFeed.tsx'

registerWidgetComponents({ ActivityFeed })
// ActivityFeed receives the resolved getData() payload as props.
```

Fluent form: `View.make('activity').component('ActivityFeed').getDataHandler(ctx => …)`.

- The component name must match a key passed to `registerWidgetComponents`. A missing / unregistered name renders an inline error panel (not a crash).
- `getData(ctx)` is server-side and async — query models, read `ctx`. Whatever you return is the component's props.
- `@pilotiq/pilotiq/widgets` is a **client-safe** subpath — import the registry there, not from the main package entry. (Parallel to `@pilotiq/pilotiq/entries` for `ComponentEntry`.)

For a brand-new *element type* (not just a component) — e.g. an adapter shipping its own widget — that's `registerWidgetRenderer` from `@pilotiq/pilotiq/react`; rare, and how `@pilotiq/recharts`'s `Chart` is wired.
