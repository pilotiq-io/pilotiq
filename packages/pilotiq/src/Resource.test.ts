import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Resource } from './Resource.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'

describe('Resource (static API)', () => {
  it('default form/table/detail are no-ops', () => {
    class EmptyResource extends Resource {}
    const f = EmptyResource.form(Form.make())
    const t = EmptyResource.table(Table.make())
    assert.equal(f.getChildren(), undefined)
    assert.equal(t.getChildren(), undefined)
    assert.deepEqual(EmptyResource.detail({}), [])
    assert.deepEqual(EmptyResource.pages(), {})
    assert.deepEqual(EmptyResource.relations(), [])
  })

  it('subclass overrides receive the builder and configure it', () => {
    class ArticleResource extends Resource {
      static override label = 'Articles'

      static override form(form: Form): Form {
        return form.schema([TextField.make('title').required()])
      }
      static override table(table: Table): Table {
        return table.columns([Column.make('title').sortable()])
      }
    }

    const form = ArticleResource.form(Form.make())
    assert.equal((form.getChildren() ?? []).length, 1)

    const table = ArticleResource.table(Table.make())
    assert.equal(table.getColumns().length, 1)
    assert.equal(table.getColumns()[0]!.name, 'title')
  })

  it('getSlug derives from label when slug is unset', () => {
    class ArticleResource extends Resource {
      static override label = 'Article Drafts'
    }
    assert.equal(ArticleResource.getSlug(), 'article-drafts')
  })

  it('getSlug honors explicit slug', () => {
    class ArticleResource extends Resource {
      static override slug = 'articles'
      static override label = 'Articles'
    }
    assert.equal(ArticleResource.getSlug(), 'articles')
  })
})
