# Pages

A Page is "anything with a `schema()`" — the unit of routing, content, and lifecycle in pilotiq. The base `Page` class is the route-dispatch unit; resource-bound pages can additionally extend the optional bases `ListPage`, `CreatePage`, `EditPage`, or `ViewPage`, which provide ergonomic override hooks (`getHeader`, `getFormActions`, lifecycle methods like `beforeCreate` / `afterUpdate`, etc.) on top of `Page`.

The same `Page` covers two callers:

- **Custom pages** registered via `panel.pages([AnalyticsPage])` — anything you want; full schema control.
- **Resource pages** registered automatically via `defaultPages(R)` and overridable via `Resource.pages()` — the framework auto-generates ones that wrap `R.form()` / `R.table()` / `R.detail()` for you, optionally subclassing `ListPage` / `CreatePage` / `EditPage` / `ViewPage` for the override surface.

The two are interchangeable: a resource page is just a `Page` subclass (often via one of the role-specific bases) with a non-`'custom'` mode and a `getResource()` back-reference.

---

## The class

```ts
import { Page } from '@pilotiq/pilotiq'

class AnalyticsPage extends Page {
  static override slug  = 'analytics'      // optional — derived from class name
  static override label = 'Analytics'      // optional — derived from class name
  static override icon  = 'bar-chart-3'    // sidebar icon (optional)

  static override schema(ctx) {
    // return Element[] (sync or async)
    return [
      Heading.make('Site analytics').level(1),
      Card.make().schema([
        Text.make('Stats coming soon.'),
      ]),
    ]
  }
}
```

Register on the panel:

```ts
Pilotiq.make('Admin').path('/admin').pages([AnalyticsPage])
```

That gives you `GET /admin/analytics` rendering the schema.

---

## API

| Member                             | Returns                                                | Purpose                                                                                  |
| ---------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `slug?`                            | `string`                                               | URL slug. If unset, derived from class name (`AnalyticsPage` → `analytics`).             |
| `label?`                           | `string`                                               | Sidebar label. If unset, derived from class name (`AnalyticsPage` → `Analytics`).        |
| `icon?`                            | `string`                                               | Sidebar icon name.                                                                       |
| `schema(ctx?)`                     | `Element[]` \| `Promise<Element[]>`                    | Return the page content. Override this for custom rendering.                             |
| `define(def)`                      | `typeof Page`                                          | Stash a `SchemaDefinition` (array or `(ctx) => Element[]`); used by `schema()` if set.   |
| `getSlug()`                        | `string`                                               | Resolved slug — explicit `slug` or class-name derivation.                                |
| `getLabel()`                       | `string`                                               | Resolved label.                                                                          |
| `getResource()`                    | `ResourceClass \| undefined`                           | Optional back-reference. Auto-set on default resource pages; standalone pages return `undefined`. |
| `getMode()`                        | `'list' \| 'create' \| 'edit' \| 'view' \| 'custom'`   | Mode discriminator. Default `'custom'`.                                                  |
| `toMeta()`                         | `{ slug, label, icon, mode }`                          | Used for nav listing.                                                                    |
| `hasSchema()`                      | `boolean`                                              | True if `schema()` is overridden or `define()` was called.                               |

---

## Schema context

`schema(ctx?)` receives a `SchemaContext` — the framework injects request-scoped data the page may need:

```ts
interface SchemaContext {
  mode?:      'table' | 'create' | 'edit' | 'view'
  recordId?:  string                          // edit / view modes
  basePath?:  string                          // panel base path, e.g. '/admin'
  record?:    unknown                         // edit / view: the loaded record
  user?:      { name?: string; email?: string; ... }
  [key: string]: unknown                      // open-ended for plugins
}
```

For example, a custom edit page can build a redirect that knows the panel base:

```ts
static override schema(ctx) {
  const id = ctx?.recordId
  return [
    Form.make()
      .schema([TextField.make('title').required()])
      .save(async data => prisma.article.update({ where: { id }, data }))
      .redirectAfterSave(() => `${ctx?.basePath}/articles/${id}/edit`),
  ]
}
```

---

## Custom pages with forms

Custom pages can include a `Form` Element — the framework registers `POST ${base}/${slug}` for any custom page so submits go to the same URL as the GET. The form lifecycle (`save`, `redirectAfterSave`, etc.) runs identically to a resource form:

```ts
class FeedbackPage extends Page {
  static override slug = 'feedback'

  static override schema() {
    return [
      Heading.make('Send feedback'),
      Form.make()
        .schema([
          TextField.make('email').required(),
          TextareaField.make('message').required(),
        ])
        .save(async (data) => {
          await sendFeedback(data)
          return data
        })
        .redirectAfterSave(() => '/feedback?sent=1'),
    ]
  }
}
```

`Form.loadRecord` works on custom pages too — the GET handler runs it (id is `''`, there's no record URL segment) and stamps the returned record's values onto the form, so inputs render pre-filled. The resolved panel user rides on the `FormContext` for both `loadRecord` and the save lifecycle, which makes the self-serve profile-page pattern a one-liner:

```ts
Form.make()
  .schema([TextField.make('name'), EmailField.make('email')])
  .loadRecord(async (_id, ctx) => {
    const user = ctx.user as { id: string }
    return await User.find(user.id)
  })
  .save(async (data, ctx) => {
    const user = ctx.user as { id: string }
    return await User.update(user.id, data)
  })
```

---

## Mode discriminator

`getMode()` defaults to `'custom'`. Resource-bound pages override it:

| Mode      | When                                                   |
| --------- | ------------------------------------------------------ |
| `'list'`  | Resource index page                                    |
| `'create'`| Resource create page                                   |
| `'edit'`  | Resource edit page or `Global` edit page               |
| `'view'`  | Resource view page or opt-in `Global` view page        |
| `'custom'`| Standalone Pages (the default)                         |

Plugins can switch on `mode` to conditionally inject elements (e.g. a "comments" panel only on `view` mode).

---

## Standalone vs. resource pages

A standalone Page goes through `panel.pages([P])` — the framework registers `GET/POST ${base}/${P.slug}` for it. URLs are 2-segment.

A resource page goes through `Resource.pages()` (or its auto-generated default). The framework registers `GET ${base}/${R.slug}`, `${R.slug}/create`, `${R.slug}/:id`, `${R.slug}/:id/edit`, plus `POST` counterparts on create and edit. URL conventions are role-based, not slug-based — the page's own `slug` is informational (used in `toMeta()` for breadcrumbs).

The two coexist cleanly: a panel can have both a `BlogResource` (with auto-generated CRUD pages) and a custom `FeedbackPage` registered separately.

---

## Auto-generated default pages

`defaultPages(R)` returns four `Page` subclasses for a `Resource`:

```ts
function defaultPages(R: ResourceClass): { index, create, edit, view } {
  return {
    index:  defaultListPage(R),    // [Heading, Table.from(R.table())]
    create: defaultCreatePage(R),  // [Heading, Form.from(R.form()).save(sentinel)]
    edit:   defaultEditPage(R),    // [Heading, Form.from(R.form())] + loadRecord
    view:   defaultViewPage(R),    // [Heading, EditAction, DeleteAction, ...R.detail(record)]
  }
}
```

Each default page sets `getResource() = R` and the appropriate `getMode()`. Sentinel handlers (for `save` / `loadRecord`) only fire when the user hasn't configured them on `R.form()` — that's why wiring `loadRecord` + `save` on the form alone is enough to make the auto-generated edit page persist.

For singletons, `defaultGlobalPages(G)` returns `{ edit }` only; `view` is opt-in.

### `ListPage` / `CreatePage` / `EditPage` / `ViewPage` base classes

For resources that need page-level customization, extend the role-specific bases instead of `Page` directly. Each base class derives slug/label/icon from `getResource()`, calls the resource's `form()` / `table()` / `detail()`, and exposes ergonomic override hooks:

```ts
class EditArticle extends EditPage {
  static override getResource() { return ArticleResource }

  // Override the heading (still keeps the form below + page-header save action)
  static override getHeader(R) { return [Heading.make(`Editing ${R.labelSingular}`)] }

  // Lifecycle hooks (install onto the form during schema())
  static override beforeUpdate = async (data) => { data.editedAt = new Date() }
  static override getSavedNotificationTitle() { return 'Article updated' }
}
```

Override surface:
- **`ListPage`**: `getHeader(R)`, `getHeaderActions(R, basePath)`, `getRowActions(R, basePath)`, `getBulkActions(R, basePath)`, `getTabs(R)`.
- **`CreatePage`**: `getHeader(R)`, `getFormActions(R, basePath)` plus form lifecycle (`mutateFormDataBefore/AfterFill`, `mutateData`, `mutateDataBeforeCreate`, `beforeSave`, `beforeCreate`, `afterCreate`, `afterSave`, `handleCreate`, `getRedirectUrl`, `getCreatedNotificationTitle`).
- **`EditPage`**: same surface but with `getFormActions(R, basePath, recordId?)`, `…BeforeUpdate / handleUpdate / getSavedNotificationTitle`.
- **`ViewPage`**: `getHeader(R, record)`, `getActions(R, recordId, basePath)`.

The `defaultListPage(R)` / `defaultCreatePage(R)` / etc. factories return anonymous subclasses of the matching base bound to `R`, so they're equivalent to a one-line `class extends ListPage { static override getResource() { return R } }`.

For the full lifecycle hook surface and ordering, see [Resources › Submit lifecycle](./resources.md#submit-lifecycle) and [docs/guide/migrating-from-panels.md › Form lifecycle hooks](../../guide/migrating-from-panels.md#form-lifecycle-hooks).

### EditPage header actions — Delete / View / etc.

`EditPage.getFormActions(R, basePath, recordId)` is the slot for the cluster of buttons rendered to the right of the page heading. The default returns just a primary `Save changes` submit; override it to mix in destructive / navigational actions next to Save:

```ts
class EditArticle extends EditPage {
  static override getResource() { return ArticleResource }

  static override getFormActions(R, basePath, recordId) {
    return [
      Action.delete(R, basePath, recordId),
      Action.view  (R, basePath, recordId),
      Action.make('submit').label('Save changes').submit(),
    ]
  }
}
```

Why one slot for both submit and non-submit buttons: every Action attached to the page heading renders in the same right-aligned cluster — the submit is auto-targeted at the form below via the HTML `form=` attribute, and non-submit buttons go through their own dispatch path (handler, href, or method-form). A single ordered list keeps the visual order under your control.

`recordId` is baked into the URLs the factories produce (`/admin/articles/42/delete` instead of `/admin/articles/:id/delete`) so the buttons work in the page-header context — no row-level `:id` placeholder substitution needed.

The same widening lands on `CreatePage.getFormActions(R, basePath)` — useful when overrides want to drop in a Cancel link that points back to the index:

```ts
class CreateArticle extends CreatePage {
  static override getResource() { return ArticleResource }
  static override getFormActions(R, basePath) {
    return [
      Action.make('cancel').label('Cancel').href(`${basePath}/${R.getSlug()}`).outlined(),
      Action.make('submit').label(`Create ${R.labelSingular}`).submit(),
    ]
  }
}
```

---

## Custom resource pages

The four built-in resource page roles (List / Create / Edit / View) cover the common CRUD surface. For anything else — an analytics dashboard scoped to a resource, a manage-imports page, a publish-schedule calendar — register a regular `Page` subclass alongside the resource and tell pilotiq to nest it under the resource in the sidebar:

```ts
import { Page, Heading, Card } from '@pilotiq/pilotiq'

class PostsAnalytics extends Page {
  static override slug  = 'post-analytics'
  static override label = 'Analytics'
  static override icon  = 'bar-chart-3'

  // Nest under the PostResource sidebar item. Value is the JS class
  // name of the parent (NOT the slug) — Plan #9 navigation metadata.
  static override navigationParentItem = 'PostResource'

  static override schema() {
    return [
      Heading.make('Posts analytics').level(1),
      Card.make().schema([/* charts, stat cards, etc. */]),
    ]
  }
}
```

Register it as a regular standalone page on the panel:

```ts
Pilotiq.make('Admin')
  .path('/admin')
  .resources([PostResource])
  .pages([PostsAnalytics])
```

What you get:

- **Sidebar nesting** — `PostsAnalytics` renders as a child item under `PostResource` in the sidebar. Same nav-tree machinery that powers `navigationGroup` / `navigationSort` / `navigationBadge`.
- **Authorization** — `static async canAccess(user)` runs the same gate every other Page does. Throwing fails closed.
- **Active state** — the nav item highlights based on URL prefix; visiting `/admin/post-analytics` keeps `PostResource` expanded.

The trade-off: the URL is a panel-level sibling (`/admin/post-analytics`), not a child of the resource (`/admin/posts/analytics`). True URL nesting is on the Tier-3 backlog — it requires a route-registry change to deconflict with the existing `${slug}/:id` view route. The current pattern covers ~95% of "extra page tied to a resource" cases without that complexity.

**Linking from a resource page** — the panel's `basePath` is whatever you set on `Pilotiq.make().path(...)`, so build hrefs in your `getRowActions` / `getHeaderActions` overrides as `${basePath}/post-analytics`:

```ts
class ListPosts extends ListPage {
  static override getResource() { return PostResource }
  static override getHeaderActions(R, basePath) {
    return [
      Action.create(R, basePath),
      Action.make('analytics').label('Analytics').href(`${basePath}/post-analytics`).outlined(),
    ]
  }
}
```

For pages that need parameters (e.g. a per-record analytics page), use a custom Page with route params via `Pilotiq.make().pages(...)` and read the request params inside `schema(ctx)`. The schema context carries `recordId` only when pilotiq's own role-based routing populated it; for ad-hoc URL parameters, read from `ctx.request` (the underlying Hono `Context`).

---

## See also

- [Resources](./resources.md) — declarative CRUD entities
- [Globals](./globals.md) — singleton resources
- [Schema reference](./schema.md) — Element model + Form / Table / Action lifecycle
