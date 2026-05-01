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

  describe('action slots (recordActions / headerActions / bulkActions)', () => {
    it('recordActions stamps placement="row" on each action', () => {
      const t = Table.make().recordActions([
        Action.make('edit'),
        Action.make('delete').destructive(),
      ])
      const actions = (t.getChildren() ?? []).filter((c): c is Action => c instanceof Action)
      assert.equal(actions.length, 2)
      assert.equal(actions[0]!.getPlacement(), 'row')
      assert.equal(actions[1]!.getPlacement(), 'row')
    })

    it('headerActions stamps placement="header"', () => {
      const t = Table.make().headerActions([Action.make('create')])
      const a = (t.getChildren() ?? []).find((c): c is Action => c instanceof Action)!
      assert.equal(a.getPlacement(), 'header')
    })

    it('bulkActions stamps placement="bulk"', () => {
      const t = Table.make().bulkActions([Action.make('archive')])
      const a = (t.getChildren() ?? []).find((c): c is Action => c instanceof Action)!
      assert.equal(a.getPlacement(), 'bulk')
    })

    it('top-bar chrome — heading / description / striped / emptyState round-trip', () => {
      const meta = Table.make()
        .heading('Articles')
        .description('Manage published content.')
        .striped()
        .emptyState({ heading: 'No articles', description: 'Create one to get started.', icon: 'inbox' })
        .toMeta()
      assert.equal(meta.heading,     'Articles')
      assert.equal(meta.description, 'Manage published content.')
      assert.equal(meta.striped,     true)
      assert.deepEqual(meta.emptyState, {
        heading: 'No articles',
        description: 'Create one to get started.',
        icon: 'inbox',
      })
    })

    it('chrome fields are absent from meta when not set', () => {
      const meta = Table.make().toMeta()
      assert.equal(meta.heading,     undefined)
      assert.equal(meta.description, undefined)
      assert.equal(meta.striped,     undefined)
      assert.equal(meta.emptyState,  undefined)
    })

    it('recordClasses sets the meta flag and stores the handler', () => {
      const fn = (r: { id: string }) => r.id === 'a' ? 'bg-warning/10' : undefined
      const t  = Table.make<{ id: string }>().recordClasses(fn)
      assert.equal(t.getRecordClasses(), fn)
      assert.equal(t.toMeta().recordClasses, true)
    })

    it('recordClasses meta flag is absent when handler is unset', () => {
      assert.equal(Table.make().toMeta().recordClasses, undefined)
    })

    it('poll(seconds) round-trips on the meta', () => {
      assert.equal(Table.make().poll(15).toMeta().pollInterval, 15)
    })

    it('poll() ignores zero and negative intervals (no-op)', () => {
      assert.equal(Table.make().poll(0).toMeta().pollInterval,  undefined)
      assert.equal(Table.make().poll(-5).toMeta().pollInterval, undefined)
    })

    it('poll meta key is absent by default', () => {
      assert.equal(Table.make().toMeta().pollInterval, undefined)
    })

    it('slots compose with .columns() and .filters() without clobbering', () => {
      const t = Table.make()
        .columns([Column.make('a')])
        .recordActions([Action.make('edit')])
        .headerActions([Action.make('create')])
        .bulkActions([Action.make('archive')])
      const actions = (t.getChildren() ?? []).filter((c): c is Action => c instanceof Action)
      assert.equal(actions.length, 3)
      assert.deepEqual(
        actions.map(a => [a.name, a.getPlacement()]),
        [['edit', 'row'], ['create', 'header'], ['archive', 'bulk']],
      )
    })
  })
})
