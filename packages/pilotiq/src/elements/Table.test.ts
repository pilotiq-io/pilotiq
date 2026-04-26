import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Table } from './Table.js'
import { Column } from '../Column.js'
import { Action } from '../actions/Action.js'
import { resolveSchema } from '../schema/resolveSchema.js'

describe('Table Element', () => {
  describe('shape and toMeta', () => {
    it('emits type=table and searchable=false by default', () => {
      const meta = Table.make().toMeta()
      assert.equal(meta.type, 'table')
      assert.equal(meta.searchable, false)
    })

    it('searchable becomes true when any column is searchable', () => {
      const t = Table.make().columns([
        Column.make('a'),
        Column.make('b').searchable(),
      ])
      assert.equal(t.toMeta().searchable, true)
    })

    it('round-trips defaultSort + perPage', () => {
      const meta = Table.make()
        .defaultSort('createdAt', 'desc')
        .paginate(25)
        .toMeta()
      assert.deepEqual(meta.defaultSort, { column: 'createdAt', direction: 'desc' })
      assert.equal(meta.perPage, 25)
    })
  })

  describe('children + resolver', () => {
    it('Columns resolve as children in the schema tree', async () => {
      const table = Table.make().columns([
        Column.make('title').sortable(),
        Column.make('status'),
      ])
      const [meta] = await resolveSchema([table])
      const kids = meta!.children as any[]
      assert.equal(kids.length, 2)
      assert.equal(kids[0].type, 'column')
      assert.equal(kids[0].name, 'title')
      assert.equal(kids[0].sortable, true)
    })

    it('actions append after columns and resolve too', async () => {
      const table = Table.make()
        .columns([Column.make('title')])
        .actions([Action.make('export').label('Export')])
      const [meta] = await resolveSchema([table])
      const kids = meta!.children as any[]
      assert.equal(kids.length, 2)
      assert.equal(kids[0].type, 'column')
      assert.equal(kids[1].type, 'action')
    })

    it('columns() preserves existing actions', () => {
      const t = Table.make()
        .actions([Action.make('a').label('A')])
        .columns([Column.make('x')])
      const kids = t.getChildren()!
      assert.equal(kids.length, 2)
      assert.ok(kids[0] instanceof Column)
      assert.ok(kids[1] instanceof Action)
    })
  })

  describe('getColumns helper', () => {
    it('returns only column children', () => {
      const t = Table.make()
        .columns([Column.make('a'), Column.make('b')])
        .actions([Action.make('x').label('X')])
      const cols = t.getColumns()
      assert.equal(cols.length, 2)
      assert.deepEqual(cols.map(c => c.name), ['a', 'b'])
    })
  })

  describe('lifecycle setters store handlers (no dispatch yet)', () => {
    it('query / defaultSort / paginate round-trip via getters', () => {
      const q = (x: unknown) => x
      const t = Table.make().query(q).defaultSort('id').paginate(50)
      assert.equal(t.getQuery(), q)
      assert.deepEqual(t.getDefaultSort(), { column: 'id', direction: 'asc' })
      assert.equal(t.getPerPage(), 50)
    })

    it('handlers are not serialized in toMeta', () => {
      const meta = Table.make().query(x => x).toMeta()
      assert.equal('query' in meta, false)
    })
  })
})
