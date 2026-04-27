import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Resource } from './Resource.js'
import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { Action } from './actions/Action.js'
import { Section } from './schema/Section.js'
import { Text } from './schema/Text.js'
import { TextField } from './fields/TextField.js'
import type { Element } from './schema/Element.js'
import { defaultViewPage, defaultPages } from './defaultPages.js'

describe('defaultViewPage', () => {
  class ArticleResource extends Resource {
    static override label         = 'Articles'
    static override labelSingular = 'Article'
    static override slug          = 'articles'
    static override icon          = 'file-text'

    static override form(form: Form): Form {
      return form
        .schema([TextField.make('title')])
        .loadRecord(async (id) => ({ id, title: `Loaded ${id}` }))
    }

    static override detail(record: unknown): Element[] {
      const r = record as { title?: string } | null
      return [
        Section.make('Body').schema([Text.make(r?.title ?? '(no record)')]),
      ]
    }
  }

  it('produces a view-mode Page with a `${slug}/view` slug', () => {
    const ViewArticle = defaultViewPage(ArticleResource)
    assert.equal(ViewArticle.getMode(), 'view')
    assert.equal(ViewArticle.getResource(), ArticleResource)
    assert.equal(ViewArticle.getSlug(), 'articles/view')
  })

  it('schema(ctx) loads the record via the form loader and renders detail()', async () => {
    const ViewArticle = defaultViewPage(ArticleResource)
    const elements = await Promise.resolve(ViewArticle.schema({ recordId: '42', basePath: '/admin' }))
    // [Heading, EditAction, DeleteAction, Section]
    assert.equal(elements.length, 4)
    const [heading, editAction, delAction, body] = elements
    assert.equal(heading!.getType(), 'heading')
    assert.equal(editAction!.getType(), 'action')
    assert.equal((editAction as Action).name, 'edit')
    assert.equal(delAction!.getType(), 'action')
    assert.equal((delAction as Action).name, 'delete')
    assert.equal(body!.getType(), 'section')

    const sectionMeta = body!.toMeta() as { title?: string }
    assert.equal(sectionMeta.title, 'Body')

    const editMeta = editAction!.toMeta() as { href?: string; method?: string }
    assert.equal(editMeta.href, '/admin/articles/42/edit')
    assert.equal(editMeta.method, undefined)

    const delMeta = delAction!.toMeta() as { method?: string; action?: string; destructive?: boolean; confirm?: unknown }
    assert.equal(delMeta.method, 'post')
    assert.equal(delMeta.action, '/admin/articles/42/delete')
    assert.equal(delMeta.destructive, true)
    assert.ok(delMeta.confirm)
  })

  it('handles missing record gracefully (loader returns null/throws)', async () => {
    class NoLoad extends Resource {
      static override label = 'X'
      static override labelSingular = 'X'
      static override slug = 'x'
      static override detail(record: unknown): Element[] {
        return [Text.make(record === null ? 'EMPTY' : 'HAS')]
      }
    }
    const View = defaultViewPage(NoLoad)
    const elements = await Promise.resolve(View.schema({ recordId: '1', basePath: '' }))
    // Heading + Edit + Delete + detail Text
    const detailMeta = elements[3]!.toMeta() as { content?: string }
    assert.equal(detailMeta.content, 'EMPTY')
  })

  it('omits Edit/Delete actions when no recordId is in context', async () => {
    const ViewArticle = defaultViewPage(ArticleResource)
    const elements = await Promise.resolve(ViewArticle.schema({}))
    const types = elements.map(e => e.getType())
    assert.deepEqual(types, ['heading', 'section'])
  })
})

describe('Resource.resolvePages — view key', () => {
  class ResX extends Resource {
    static override label = 'X'
    static override labelSingular = 'X'
    static override slug = 'x'
  }

  it('includes view by default', () => {
    const pages = defaultPages(ResX)
    assert.equal(typeof pages.view, 'function')
    assert.equal(pages.view!.getMode(), 'view')
  })

  it('user-supplied view in pages() wins', () => {
    class Custom extends Page {
      static override getMode() { return 'view' as const }
    }
    class WithCustom extends ResX {
      static override pages() { return { view: Custom } }
    }
    const resolved = WithCustom.resolvePages()
    assert.equal(resolved.view, Custom)
    // others fall through to defaults
    assert.notEqual(resolved.index, undefined)
  })
})
