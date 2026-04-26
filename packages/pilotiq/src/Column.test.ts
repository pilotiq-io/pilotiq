import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Column } from './Column.js'
import { resolveSchema } from './schema/resolveSchema.js'

describe('Column', () => {
  it('toMeta emits type=column with name + label + flags', () => {
    const meta = Column.make('title').label('Title').sortable().searchable().toMeta()
    assert.deepEqual(meta, {
      type:       'column',
      name:       'title',
      label:      'Title',
      sortable:   true,
      searchable: true,
    })
  })

  it('label defaults to capitalized name when not set', () => {
    const meta = Column.make('createdAt').toMeta()
    assert.equal(meta.label, 'CreatedAt')
  })

  it('sortable / searchable default to false', () => {
    const meta = Column.make('x').toMeta()
    assert.equal(meta.sortable, false)
    assert.equal(meta.searchable, false)
  })

  it('joins the resolver tree as a leaf Element', async () => {
    const result = await resolveSchema([Column.make('title')])
    assert.equal(result.length, 1)
    assert.equal(result[0]!.type, 'column')
    assert.equal('children' in result[0]!, false)
  })
})
