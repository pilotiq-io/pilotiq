# Defining Resources

A `Resource` is a class that declares a CRUD-managed entity for a pilotiq panel. Static methods describe the form, table, and (optionally) the detail view; the framework auto-generates list / create / edit / view pages from those declarations and registers the routes.

## Minimal Resource

The shortest path: point `static model` at a `@rudderjs/orm` `Model` and the framework infers CRUD from column metadata.

```ts
import { Resource, Form, Table, Column, TextField } from '@pilotiq/pilotiq'
import { Article } from '../Models/Article.js'

export class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override icon          = 'file-text'
  static override model         = Article

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').required().placeholder('Article title…'),
      TextField.make('slug').required(),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable(),
        Column.make('slug').searchable(),
        Column.make('createdAt').sortable().label('Created'),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
  }
}
```

Register on the panel:

```ts
Pilotiq.make('Admin').path('/admin').resources([ArticleResource])
```

You get working list / create / edit / view pages at `/admin/articles*`.

## What `static model` auto-fills

When `static model = SomeModel` is set, the framework wires:

- **`Form.save(ctx)`** — calls `Article.create(data)` on create, `Article.update(id, data)` on edit (discriminated by whether `ctx.record[primaryKey]` is set).
- **`Form.loadRecord(id)`** — calls `Article.find(id)`. Throws 404 if missing.
- **`Resource.deleteRecord(id)`** — calls `Article.delete(id)`. Soft-deletes work out of the box when `Article.softDeletes = true` AND `Resource.softDeletes = true` (two-sided opt-in).
- **`Table.records(ctx)`** — paginates `Article.query()`. Every `Column.searchable()` joins via `LIKE` / `orWhere`; `Column.sortable()` + `defaultSort()` map to `orderBy`.

Anything you set explicitly still wins:

```ts
static override form(form: Form): Form {
  return form
    .schema([...])
    .save(async (ctx) => {
      // explicit save handler — overrides the auto-wired Article.create
      const article = await Article.create({ ...ctx.values, authorId: ctx.user.id })
      return { redirect: `${ctx.basePath}/articles/${article.id}` }
    })
}
```

`ModelLike` is structural — you don't have to use `@rudderjs/orm`. Any object that satisfies the shape works (testing doubles, custom ORMs):

```ts
export class ArticleResource extends Resource {
  static override model = {
    query: () => CustomBackend.query('articles'),
    find: (id) => CustomBackend.find('articles', id),
    create: (data) => CustomBackend.create('articles', data),
    update: (id, data) => CustomBackend.update('articles', id, data),
    delete: (id) => CustomBackend.delete('articles', id),
  }
}
```

## Folder-per-resource layout

For non-trivial resources, split configuration across files:

```
app/Pilotiq/Articles/
├── ArticleResource.ts       # binds form / table / detail / pages / relations
├── Pages/
│   ├── ListArticles.ts      # extends ListPage
│   ├── CreateArticle.ts     # extends CreatePage
│   ├── EditArticle.ts       # extends EditPage
│   └── ViewArticle.ts       # extends ViewPage
├── Schemas/
│   ├── form.ts              # exported form(form) function
│   └── table.ts             # exported table(table) function
└── RelationManagers/
    └── CommentsRelationManager.ts
```

```ts
// ArticleResource.ts
export class ArticleResource extends Resource {
  static override model = Article
  static override form = articleForm        // imported from Schemas/form.ts
  static override table = articleTable
  static override pages() {
    return {
      list:   ListArticles,
      create: CreateArticle,
      edit:   EditArticle,
      view:   ViewArticle,
    }
  }
  static override relations() {
    return [CommentsRelationManager]
  }
}
```

## Navigation metadata

```ts
export class ArticleResource extends Resource {
  static override label         = 'Articles'           // sidebar label
  static override labelSingular = 'Article'            // singular for headings / breadcrumbs
  static override icon          = 'file-text'          // sidebar icon
  static override navigationGroup = 'Content'          // sidebar grouping heading
  static override navigationSort  = 10                 // smaller = earlier
  static override navigationLabel = 'All articles'     // alt label when grouped
  static override navigationBadge = async () => Article.where('isPublished', false).count()
  static override navigationBadgeColor = 'warning'     // primary / success / warning / destructive / info / gray
  static override navigationParentItem = 'BlogResource' // nest under another resource by class name
  static override recordTitleAttribute = 'title'        // used in breadcrumbs + global search
  static override breadcrumb = 'Posts'                  // optional override (label is the default)
}
```

`navigationBadge` is async and resolved in parallel during `panelInfo()`. Errors are swallowed (badge silently absent).

## Detail view

Resource pages (`ViewArticle`) render the `Resource.detail()` infolist by default:

```ts
import { Resource, TextEntry, BadgeEntry, IconEntry } from '@pilotiq/pilotiq'

export class ArticleResource extends Resource {
  static override detail() {
    return [
      Section.make('Article')
        .columns(2)
        .schema([
          TextEntry.make('title').weight('bold').size('lg'),
          BadgeEntry.make('status').colors({ draft: 'gray', live: 'success' }),
          TextEntry.make('createdAt').since().label('Created'),
          IconEntry.make('isPublic').options({ true: { icon: 'globe' }, false: { icon: 'lock' } }),
        ]),
    ]
  }
}
```

Entry types: `TextEntry`, `BadgeEntry`, `IconEntry`, `ImageEntry`, `KeyValueEntry`, `ColorEntry`, `RepeatableEntry`, `ComponentEntry` (escape-hatch to a custom React component).

## Soft deletes

Two-sided opt-in: set `softDeletes = true` on BOTH the Model and the Resource. Missing either side silently drops the restore / force-delete UI without an error.

```ts
// app/Models/Article.ts
export class Article extends Model {
  static override softDeletes = true        // required on the Model
}

// app/Pilotiq/Articles/ArticleResource.ts
export class ArticleResource extends Resource {
  static override model       = Article
  static override softDeletes = true        // required on the Resource too
}
```

What you get:

- `TrashedFilter` auto-injected on the list page (`All / Active only / Only trashed`).
- `Action.delete()` flips its label to "Move to trash" and hides on already-trashed rows.
- `Action.restore()` / `Action.forceDelete()` appear on trashed rows.
- `Action.bulkRestore()` / `Action.bulkForceDelete()` available for bulk slots.
- Two new routes: `POST /:slug/:id/restore` and `POST /:slug/:id/force-delete`.

Override the column name with `static deletedAtColumn = 'archivedAt'` if you're not using the default.

## Globals (singleton resources)

`Global` extends the same builder for singletons — site settings, footer content. Same shape minus list/create/delete; routes are `GET/POST {base}/{slug}` for edit, `GET {base}/{slug}/view` for view.

```ts
import { Global, Form, TextField, Textarea, ColorPicker } from '@pilotiq/pilotiq'

export class SiteSettings extends Global {
  static override label = 'Site Settings'
  static override icon  = 'settings'
  static override model = Settings
  static override navigationGroup = 'Settings'         // default

  static override form(form: Form) {
    return form.schema([
      TextField.make('siteName').required(),
      Textarea.make('description'),
      ColorPicker.make('brandColor'),
    ])
  }

  static override canEdit(user) { return user.role === 'admin' }
}
```

Register via `.globals([SiteSettings])`.

## Common pitfalls

- **Forgetting `static override`.** Without it, TypeScript happily lets you create instance methods that never run. Lint with `noImplicitOverride` to catch this at compile time.
- **`static model = X` vs `static get model() { return X }`** — Both work. The getter form is useful when `X` is defined in the same file and you hit class-evaluation ordering issues.
- **`Resource.model` requires `ModelLike`, not the Prisma client.** If you're consuming the framework's Prisma adapter, point at the `@rudderjs/orm` `Model` class, not the Prisma delegate. The adapter bridges between them.
- **`static slug` collisions** with reserved tokens (`_action`, `_form`, `_search`, `_uploads`, `_widget`, `_notifications`, `theme`, `api`) throw a clear boot error. The slug auto-derivation falls through to `kebab(className)`.
- **Resources auto-register pages — don't `.pages([])` them too.** `Pilotiq.make().resources([R])` already registers R's four pages. The `.pages([])` slot is for *custom* (non-resource-bound) pages.
