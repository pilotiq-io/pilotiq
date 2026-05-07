# Globals

A `Global` is a single-record resource — site settings, brand config, on-call rotation, anything that exists exactly once. It reuses the same Form-as-Element machinery as [`Resource`](./resources.md), minus the list / create / delete affordances and minus the `:id` segment in the URL.

By default a Global ships only an edit page. View mode is opt-in via `Global.pages()`.

---

## Minimal example

When the singleton lives in its own table, point `static model` at a `ModelLike` and the framework auto-wires both `loadRecord` and `save`:

```ts
import { Global, Form, TextField } from '@pilotiq/pilotiq'
import { siteSettingsModel } from '../models/SiteSettings.js'

export class SiteSettings extends Global {
  static override label         = 'Site Settings'
  static override labelSingular = 'Site Settings'
  static override slug          = 'site-settings'
  static override icon          = 'settings'
  static override model         = siteSettingsModel

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('siteName').required(),
      TextField.make('tagline'),
    ])
  }
}
```

Register on the panel:

```ts
Pilotiq.make('Admin').path('/admin').globals([SiteSettings])
```

That gives you `GET /admin/site-settings` (renders the form pre-filled from the first row in the model — empty defaults on first visit) and `POST /admin/site-settings` (creates the row on first save, updates it on subsequent saves, 303-redirects back to the same URL).

For singletons stored in a generic key-value table, JSON file, or external service, hand-wire `Form.loadRecord` + `Form.save` instead — see "Hand-wired `loadRecord`" below.

---

## API

| Member             | Returns / accepts            | Purpose                                                                  |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------ |
| `label`            | `string`                     | Sidebar label (also used as the page heading).                           |
| `labelSingular`    | `string`                     | Singular variant; defaults to `label` if you don't override.             |
| `slug`             | `string`                     | URL slug. Optional — derived from `label` when unset.                    |
| `icon`             | `string`                     | Sidebar icon name.                                                       |
| `model?`           | `ModelLike`                  | Auto-wires `Form.loadRecord` + `Form.save` against a single record. See "Singular-record auto-wiring" below. |
| `findSingular?`    | `(q) => ModelQuery`          | Strategy for finding the singular record. Default: first row. Override for fixed-id or slug-style lookups. |
| `form(form)`       | `Form`                       | Configure the singleton's form. Wire `loadRecord` + `save` here when `model` is unset (or to override the auto-wire). |
| `detail(record)`   | `Element[]`                  | Schema for the optional `view` page.                                     |
| `pages()`          | `{ edit?, view? }`           | User-overridable page map.                                               |
| `resolvePages()`   | `{ edit?, view? }`           | Final page map — defaults overlaid with `pages()` overrides.             |
| `getSlug()`        | `string`                     | Returns explicit `slug` if set, else lowercased label.                   |

`Global.deleteRecord` does not exist — globals can't be deleted through the framework. If you want to "reset" a singleton, expose an Action with a `method('post')` that hits a custom endpoint.

---

## Singular-record auto-wiring

Point `static model` at a `ModelLike` and the framework auto-wires both ends of the round-trip — no `loadRecord`, no `save`. The first POST creates the record; subsequent submits update it.

```ts
import { Global, Form, TextField } from '@pilotiq/pilotiq'
import { siteSettingsModel } from '../models/SiteSettings.js'

export class SiteSettings extends Global {
  static override label  = 'Site Settings'
  static override slug   = 'site-settings'
  static override icon   = 'settings'
  static override model  = siteSettingsModel  // ← that's it

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('siteName').required(),
      TextField.make('tagline'),
    ])
  }
}
```

The default strategy fetches the first row (`paginate(1, 1)`). For fixed-id or slug-keyed singletons, override `static findSingular`:

```ts
class BrandConfig extends Global {
  static override model        = brandConfigModel
  static override findSingular = (q) => q.where('id', '=', 1)
}

class FeatureFlags extends Global {
  static override model        = featureFlagsModel
  static override findSingular = (q) => q.where('key', '=', 'global')
}
```

When the query returns no row, `loadRecord` returns `null` and the form renders with empty defaults. The first POST runs `M.create(submittedData)`. After that, every subsequent visit loads the now-existing row and updates it via `M.update(pk, submittedData)`.

Hand-wired `Form.loadRecord` / `Form.save` always win — the auto-wire only fills empty slots. Mix and match: keep `static model` for the query-shaped path, but override `Form.save(...)` for custom upsert semantics (e.g. dual-write to a cache).

---

## Hand-wired `loadRecord` (without `static model`)

Skip the `static model` shortcut when the singleton's storage doesn't fit a `ModelLike` — JSON file, key-value blob, external service. The `Form.loadRecord` signature is `(id, ctx) => Promise<R | null>`. Globals ignore the `id` — the framework calls it with an empty string. Common patterns:

```ts
.loadRecord(async () => prisma.siteConfig.findFirst())
.loadRecord(async () => readJson('config/site.json'))
.loadRecord(async () => {
  const row = await prisma.panelGlobal.findUnique({ where: { slug: 'panel__site' } })
  return row?.data ? JSON.parse(row.data) : {}      // empty object on first visit
})
```

Returning `null` or `{}` produces an empty form on first visit; subsequent saves persist via `save(data)` and round-trip on next load.

---

## Save lifecycle

`POST ${base}/${slug}` runs the same dispatch pipeline as a resource form via `dispatchFormSubmit(form, body, ctx)`. Globals always run in update mode (the singleton record is loaded into `ctx.record` first), so the create-side hooks never fire here:

```
validateSchema(form.children, body)
  → form-level validators
  → mutateData(data, ctx)               ← both modes
  → mutateDataBeforeUpdate(data, ctx)   ← update-only (always fires for globals)
  → beforeSave(data, ctx)
  → beforeUpdate(data, ctx)
  → handleUpdate || save                ← user-implemented upsert
  → afterUpdate(record, ctx)
  → afterSave(record, ctx)
  → redirectAfterSave(record, ctx) → url   ← defaults to the same edit URL
```

`save()` is responsible for upsert semantics — typically `prisma.foo.upsert()` keyed by a fixed slug or singleton row id. Validation failures re-render the form with errors + 422, just like resources.

A success toast is auto-emitted (default `"${G.labelSingular} saved"`); customize via `Form.savedNotification(...)`. Notifications persist across the 303 redirect via `@rudderjs/session`'s flash primitive — see `docs/packages/pilotiq/resources.md#submit-lifecycle` for full details.

---

## Opt-in `view` page

`Global.detail(record)` returns Element[] just like `Resource.detail`. It's not exposed by default — to register a view page at `${base}/${slug}/view`, override `pages()`:

```ts
import { defaultGlobalEditPage, defaultGlobalViewPage } from '@pilotiq/pilotiq'

class SiteSettings extends Global {
  // ...form / detail as above...

  static override pages() {
    return {
      edit: defaultGlobalEditPage(this),
      view: defaultGlobalViewPage(this),
    }
  }
}
```

The default view page composes `[Heading, EditAction(href→edit), ...G.detail(record)]`. Substitute your own Page subclass for full control.

---

## When to reach for a Global vs. a custom page

- **Use `Global`** when the page has form fields and persists to storage. Get validation, error re-rendering, redirect on success, and consistent UI for free.
- **Use a custom `Page`** with a `Form` element when the page submits but doesn't represent a record (e.g. a "send feedback" form, a "trigger import" button). Custom pages also support `POST` to the same URL.
- **Use Resource** when there are multiple records.

---

## See also

- [Resources](./resources.md) — multi-record CRUD entities
- [Pages](./pages.md) — the unified Page class
- [Schema reference](./schema.md) — Form lifecycle reference
