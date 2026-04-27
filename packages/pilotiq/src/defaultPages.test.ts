import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Resource } from './Resource.js'
import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'
import { Heading } from './schema/Heading.js'
import { Action } from './actions/Action.js'
import {
  defaultPages,
  defaultListPage,
  defaultCreatePage,
  defaultEditPage,
  ListPage,
  CreatePage,
  EditPage,
  ViewPage,
} from './defaultPages.js'

class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override slug          = 'articles'
  static override icon          = 'file-text'

  static override form(form: Form): Form {
    return form.schema([TextField.make('title').required()])
  }
  static override table(table: Table): Table {
    return table.columns([Column.make('title').sortable()])
  }
}

describe('defaultPages factory', () => {
  it('produces { index, create, edit } page classes', () => {
    const pages = defaultPages(ArticleResource)
    assert.equal(typeof pages.index, 'function')
    assert.equal(typeof pages.create, 'function')
    assert.equal(typeof pages.edit, 'function')
  })

  it('list page has list mode + carries slug, label, icon, getResource', () => {
    const ListArticles = defaultListPage(ArticleResource)
    assert.equal(ListArticles.getMode(), 'list')
    assert.equal(ListArticles.getResource(), ArticleResource)
    assert.equal(ListArticles.getSlug(), 'articles')
    assert.equal(ListArticles.getLabel(), 'Articles')
    // Icon falls through from the resource via toMeta() — direct static
    // `icon` is undefined on the base class until a subclass sets it.
    assert.equal(ListArticles.toMeta().icon, 'file-text')
  })

  it('list page schema returns [Heading, Table] populated by R.table()', () => {
    const ListArticles = defaultListPage(ArticleResource)
    const schema = ListArticles.schema()
    assert.ok(Array.isArray(schema))
    const elements = schema as Array<{ getType(): string }>
    assert.equal(elements.length, 2)
    assert.equal(elements[0]!.getType(), 'heading')
    assert.equal(elements[1]!.getType(), 'table')
    const table = elements[1] as Table
    assert.equal(table.getColumns().length, 1)
    assert.equal(table.getColumns()[0]!.name, 'title')
  })

  it('create page has create mode + slug suffixed with /create', () => {
    const CreateArticle = defaultCreatePage(ArticleResource)
    assert.equal(CreateArticle.getMode(), 'create')
    assert.equal(CreateArticle.getResource(), ArticleResource)
    assert.equal(CreateArticle.getSlug(), 'articles/create')
    assert.equal(CreateArticle.getLabel(), 'Create Article')
  })

  it('create page schema returns [Heading-with-submit-action, Form] with sentinel save', () => {
    const CreateArticle = defaultCreatePage(ArticleResource)
    const schema = CreateArticle.schema() as Array<{ getType(): string; getChildren(): unknown[] | undefined }>
    assert.equal(schema.length, 2)
    assert.equal(schema[0]!.getType(), 'heading')
    assert.equal(schema[1]!.getType(), 'form')
    const form = schema[1] as Form
    // Form children: just the user-configured field; submit lives in the heading.
    const formChildren = form.getChildren() ?? []
    assert.equal(formChildren.length, 1)
    assert.equal((formChildren[0] as { getType(): string }).getType(), 'field')

    // Heading carries the Save submit button as right-aligned action.
    const headingChildren = (schema[0]!.getChildren() ?? []) as Array<{ getType(): string; name?: string }>
    assert.equal(headingChildren.length, 1)
    assert.equal(headingChildren[0]!.getType(), 'action')
    assert.equal(headingChildren[0]!.name, 'submit')

    const save = form.getSave()
    assert.equal(typeof save, 'function')
    // sentinel throws — proves the user must override save
    assert.throws(() => (save as () => unknown)())
  })

  it('edit page has edit mode + sentinel save and loadRecord', () => {
    const EditArticle = defaultEditPage(ArticleResource)
    assert.equal(EditArticle.getMode(), 'edit')
    assert.equal(EditArticle.getResource(), ArticleResource)
    assert.equal(EditArticle.getSlug(), 'articles/edit')

    const schema = EditArticle.schema() as Array<{ getType(): string }>
    const form = schema[1] as Form
    assert.equal(typeof form.getSave(), 'function')
    assert.equal(typeof form.getLoadRecord(), 'function')
    assert.throws(() => (form.getSave() as () => unknown)())
    assert.throws(() => (form.getLoadRecord() as () => unknown)())
  })

  it('each schema() call produces a fresh Form instance (no shared state)', () => {
    const CreateArticle = defaultCreatePage(ArticleResource)
    const a = CreateArticle.schema() as Array<unknown>
    const b = CreateArticle.schema() as Array<unknown>
    assert.notEqual(a[1], b[1])
  })
})

describe('Resource.resolvePages()', () => {
  it('returns auto-generated defaults when pages() is not overridden', () => {
    const resolved = ArticleResource.resolvePages()
    assert.equal(typeof resolved.index, 'function')
    assert.equal(typeof resolved.create, 'function')
    assert.equal(typeof resolved.edit, 'function')
    assert.equal(typeof resolved.view, 'function')

    assert.equal(resolved.index!.getMode(), 'list')
    assert.equal(resolved.create!.getMode(), 'create')
    assert.equal(resolved.edit!.getMode(), 'edit')
    assert.equal(resolved.view!.getMode(), 'view')
    assert.equal(resolved.index!.getResource(), ArticleResource)
  })

  it('user overrides merge over defaults per-key', () => {
    class CustomCreate extends Page {
      static override slug = 'custom-create'
      static override getMode() { return 'create' as const }
    }
    class WithOverride extends ArticleResource {
      static override pages() {
        return { create: CustomCreate }
      }
    }

    const resolved = WithOverride.resolvePages()
    assert.equal(resolved.create, CustomCreate)
    // index and edit fall through to defaults
    assert.notEqual(resolved.index, undefined)
    assert.notEqual(resolved.edit, undefined)
    assert.equal(resolved.index!.getMode(), 'list')
    assert.equal(resolved.edit!.getMode(), 'edit')
  })

  it('user can replace every page', () => {
    class L extends Page { static override getMode() { return 'list' as const } }
    class C extends Page { static override getMode() { return 'create' as const } }
    class E extends Page { static override getMode() { return 'edit' as const } }
    class V extends Page { static override getMode() { return 'view' as const } }

    class FullOverride extends ArticleResource {
      static override pages() {
        return { index: L, create: C, edit: E, view: V }
      }
    }

    const resolved = FullOverride.resolvePages()
    assert.equal(resolved.index, L)
    assert.equal(resolved.create, C)
    assert.equal(resolved.edit, E)
    assert.equal(resolved.view, V)
  })

  it('default pages derive slugs from R.getSlug()', () => {
    class Posts extends Resource {
      static override label = 'Blog Posts'
      static override labelSingular = 'Blog Post'
    }
    const resolved = Posts.resolvePages()
    assert.equal(resolved.index!.getSlug(), 'blog-posts')
    assert.equal(resolved.create!.getSlug(), 'blog-posts/create')
    assert.equal(resolved.edit!.getSlug(), 'blog-posts/edit')
  })
})

describe('ListPage / CreatePage / EditPage / ViewPage base classes', () => {
  it('subclassing ListPage with getResource() override produces the same shape as the factory', () => {
    class MyList extends ListPage {
      static override getResource() { return ArticleResource }
    }
    assert.equal(MyList.getMode(), 'list')
    assert.equal(MyList.getResource(), ArticleResource)
    assert.equal(MyList.getSlug(), 'articles')
    assert.equal(MyList.getLabel(), 'Articles')
    assert.equal(MyList.toMeta().icon, 'file-text')

    const schema = MyList.schema() as Array<{ getType(): string }>
    assert.equal(schema[0]!.getType(), 'heading')
    assert.equal(schema[1]!.getType(), 'table')
  })

  it('ListPage injects default Create / Edit / Delete actions on the table', () => {
    class MyList extends ListPage {
      static override getResource() { return ArticleResource }
    }
    const schema = MyList.schema({ basePath: '/admin' }) as Array<{ getType(): string }>
    const table = schema[1] as Table
    const tableActions = (table.getChildren() ?? []).filter((c): c is Action => c instanceof Action)
    const create = tableActions.find(a => a.name === 'create')
    const edit   = tableActions.find(a => a.name === 'edit')
    const del    = tableActions.find(a => a.name === 'delete')

    assert.ok(create, 'Create action should be present')
    assert.equal(create!.getPlacement(), 'header')
    assert.equal(create!.getHref(), '/admin/articles/create')

    assert.ok(edit, 'Edit row action should be present')
    assert.equal(edit!.getPlacement(), 'row')
    assert.equal(edit!.getHref(), '/admin/articles/:id/edit')

    assert.ok(del, 'Delete row action should be present')
    assert.equal(del!.getPlacement(), 'row')
    assert.equal(del!.getMethod(), 'post')
    assert.equal(del!.getActionUrl(), '/admin/articles/:id/delete')
  })

  it('user-supplied actions in Resource.table() win over the defaults by name', () => {
    class CustomActions extends ArticleResource {
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).actions([
          Action.make('create').label('Compose').header().href('/custom/compose'),
        ])
      }
    }
    class List extends ListPage {
      static override getResource() { return CustomActions }
    }
    const table = (List.schema({ basePath: '/admin' }) as Array<unknown>)[1] as Table
    const creates = (table.getChildren() ?? [])
      .filter((c): c is Action => c instanceof Action)
      .filter(a => a.name === 'create')
    assert.equal(creates.length, 1, 'only one create action should exist')
    assert.equal(creates[0]!.getHref(), '/custom/compose', 'user href should win')
  })

  it('ListPage.getHeaderActions and getRowActions are individually overridable to []', () => {
    class NoCreate extends ListPage {
      static override getResource() { return ArticleResource }
      static override getHeaderActions() { return [] }
    }
    const table = (NoCreate.schema() as Array<unknown>)[1] as Table
    const actionNames = (table.getChildren() ?? [])
      .filter((c): c is Action => c instanceof Action)
      .map(a => a.name)
    assert.equal(actionNames.includes('create'), false)
    assert.equal(actionNames.includes('edit'),   true)
    assert.equal(actionNames.includes('delete'), true)
  })

  it('CreatePage / EditPage subclasses derive role-suffixed slugs', () => {
    class Create extends CreatePage { static override getResource() { return ArticleResource } }
    class Edit   extends EditPage   { static override getResource() { return ArticleResource } }
    assert.equal(Create.getSlug(), 'articles/create')
    assert.equal(Create.getLabel(), 'Create Article')
    assert.equal(Edit.getSlug(),   'articles/edit')
    assert.equal(Edit.getLabel(),  'Edit Article')
  })

  it('explicit static slug / label override the resource-derived defaults', () => {
    class Custom extends ListPage {
      static override getResource() { return ArticleResource }
      static override slug  = 'all-articles'
      static override label = 'All articles'
    }
    assert.equal(Custom.getSlug(), 'all-articles')
    assert.equal(Custom.getLabel(), 'All articles')
  })

  it('subclasses can override getHeader() to customize the header without re-implementing wiring', () => {
    class Verbose extends ListPage {
      static override getResource() { return ArticleResource }
      static override getHeader(R: typeof ArticleResource) {
        return [Heading.make(`${R.label} (custom)`).level(1)]
      }
    }
    const schema = Verbose.schema() as Array<{ getType(): string; toMeta(): { content?: string } }>
    assert.equal(schema[0]!.getType(), 'heading')
    assert.equal(schema[0]!.toMeta().content, 'Articles (custom)')
    // The table is still wired by the base class — override is additive.
    assert.equal(schema[1]!.getType(), 'table')
  })

  it('ViewPage.getActions() returns Edit + Delete by default and is overridable', async () => {
    class V extends ViewPage { static override getResource() { return ArticleResource } }
    const elements = await V.schema({ recordId: '7', basePath: '/admin' }) as Array<{
      getType(): string
      name?: string
    }>
    const actions = elements.filter(e => e.getType() === 'action')
    assert.equal(actions.length, 2)
    assert.equal(actions[0]!.name, 'edit')
    assert.equal(actions[1]!.name, 'delete')

    class NoActions extends ViewPage {
      static override getResource() { return ArticleResource }
      static override getActions() { return [] }
    }
    const stripped = await NoActions.schema({ recordId: '7', basePath: '/admin' }) as Array<{ getType(): string }>
    assert.equal(stripped.filter(e => e.getType() === 'action').length, 0)
  })

  it('getResource() throws a helpful error when not overridden', () => {
    class Anonymous extends ListPage {}
    assert.throws(
      () => Anonymous.getResource(),
      /must override static getResource/,
    )
  })

  it('Resource.pages() can wire custom subclasses end-to-end via resolvePages()', () => {
    class MyList   extends ListPage   { static override getResource() { return ArticleResource } }
    class MyCreate extends CreatePage { static override getResource() { return ArticleResource } }

    class WithCustom extends ArticleResource {
      static override pages() {
        return { index: MyList, create: MyCreate }
      }
    }
    const resolved = WithCustom.resolvePages()
    assert.equal(resolved.index, MyList)
    assert.equal(resolved.create, MyCreate)
    // edit + view fall through to defaults
    assert.equal(resolved.edit!.getMode(), 'edit')
    assert.equal(resolved.view!.getMode(), 'view')
  })
})
