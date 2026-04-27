import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Resource } from './Resource.js'
import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'
import {
  defaultPages,
  defaultListPage,
  defaultCreatePage,
  defaultEditPage,
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
    assert.equal(ListArticles.icon, 'file-text')
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

  it('create page schema returns [Heading, Form] populated by R.form() with sentinel save', () => {
    const CreateArticle = defaultCreatePage(ArticleResource)
    const schema = CreateArticle.schema() as Array<{ getType(): string }>
    assert.equal(schema.length, 2)
    assert.equal(schema[0]!.getType(), 'heading')
    assert.equal(schema[1]!.getType(), 'form')
    const form = schema[1] as Form
    assert.equal((form.getChildren() ?? []).length, 1)
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
