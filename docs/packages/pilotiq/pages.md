# Pages

A Page is "anything with a `schema()`" — the unit of routing, content, and lifecycle in pilotiq. There's **one** Page class. Custom standalone pages, resource pages (list/create/edit/view), and global pages all extend it directly. No `ResourcePage` / `ListPage` / `CreatePage` hierarchy.

The same `Page` covers two callers:

- **Custom pages** registered via `panel.pages([AnalyticsPage])` — anything you want; full schema control.
- **Resource pages** registered automatically via `defaultPages(R)` and overridable via `Resource.pages()` — the framework auto-generates ones that wrap `R.form()` / `R.table()` / `R.detail()` for you.

The two are interchangeable: a resource page is just a `Page` subclass with a non-`'custom'` mode and an optional `getResource()` back-reference.

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

---

## See also

- [Resources](./resources.md) — declarative CRUD entities
- [Globals](./globals.md) — singleton resources
- [Schema reference](./schema.md) — Element model + Form / Table / Action lifecycle
