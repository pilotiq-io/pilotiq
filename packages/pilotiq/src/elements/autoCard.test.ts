import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildAutoCard } from './autoCard.js'
import { Column } from '../Column.js'
import { resolveSchema } from '../schema/resolveSchema.js'

const texts = (meta: Array<Record<string, unknown>>): unknown[] =>
  meta.filter(m => m['type'] === 'text').map(m => m['content'])

describe('buildAutoCard', () => {
  const cols = [
    Column.make('title'),
    Column.make('status').label('Status'),
    Column.make('createdAt').label('Created'),
  ]

  it('builds a title heading + `Label · value` lines for the other columns', async () => {
    const record = { id: 7, title: 'Hello', status: 'Published', createdAt: '2026-05-01' }
    const meta = await resolveSchema(buildAutoCard(record, cols, undefined, { recordTitleAttribute: 'title' }))
    assert.equal(meta[0]!['type'], 'heading')
    assert.equal(meta[0]!['content'], 'Hello')
    // the title column is not repeated as a line
    assert.deepEqual(texts(meta), ['Status · Published', 'Created · 2026-05-01'])
  })

  it('falls back name → title → id for the title when no attribute is set', async () => {
    const byName = await resolveSchema(buildAutoCard({ id: 3, name: 'Bob' }, [], undefined, {}))
    assert.equal(byName[0]!['content'], 'Bob')
    const byId = await resolveSchema(buildAutoCard({ id: 42 }, [], undefined, {}))
    assert.equal(byId[0]!['content'], '42')
  })

  it('prepends an image from recordImageAttribute and excludes that column from the lines', async () => {
    const record = { id: 1, title: 'T', avatar: 'http://x/a.png', status: 'Live' }
    const meta = await resolveSchema(buildAutoCard(
      record,
      [Column.make('title'), Column.make('avatar'), Column.make('status')],
      undefined,
      { recordTitleAttribute: 'title', recordImageAttribute: 'avatar' },
    ))
    assert.equal(meta[0]!['type'], 'image')
    assert.equal(meta[0]!['url'], 'http://x/a.png')
    assert.deepEqual(texts(meta), ['Status · Live'])  // avatar not a line
  })

  it('falls back to the first ImageColumn name for the image when no attribute', async () => {
    const record = { id: 1, title: 'T', thumb: 'http://x/t.png' }
    const meta = await resolveSchema(buildAutoCard(
      record, [Column.make('title'), Column.make('thumb')], undefined,
      { recordTitleAttribute: 'title' },
      'thumb',
    ))
    assert.equal(meta[0]!['type'], 'image')
    assert.equal(meta[0]!['url'], 'http://x/t.png')
  })

  it('renders a description line from recordDescriptionAttribute', async () => {
    const record = { id: 1, title: 'T', excerpt: 'short blurb' }
    const meta = await resolveSchema(buildAutoCard(record, [], undefined,
      { recordTitleAttribute: 'title', recordDescriptionAttribute: 'excerpt' }))
    assert.equal(meta[1]!['type'], 'text')
    assert.equal(meta[1]!['content'], 'short blurb')
  })

  it('prefers `_formatted` values over raw record values for column lines', async () => {
    const record = { id: 1, title: 'T', createdAt: '2026-05-01T00:00:00Z' }
    const meta = await resolveSchema(buildAutoCard(
      record, [Column.make('createdAt').label('Created')],
      { createdAt: 'May 1, 2026' },
      { recordTitleAttribute: 'title' },
    ))
    assert.deepEqual(texts(meta), ['Created · May 1, 2026'])
  })

  it('skips empty / null column values', async () => {
    const record = { id: 1, title: 'T', status: '', notes: null }
    const meta = await resolveSchema(buildAutoCard(
      record, [Column.make('status'), Column.make('notes')], undefined,
      { recordTitleAttribute: 'title' },
    ))
    assert.deepEqual(texts(meta), [])
  })
})
