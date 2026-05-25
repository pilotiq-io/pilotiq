import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Table } from './Table.js'
import { TableGroup } from './TableGroup.js'
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
      assert.equal(meta.filteredEmptyState, undefined)
    })

    it('filteredEmptyState round-trips independently of emptyState', () => {
      const meta = Table.make()
        .emptyState({
          heading: 'No articles yet',
          description: 'Create one to get started.',
        })
        .filteredEmptyState({
          heading: 'No matching articles',
          description: 'Try a different search or clear filters.',
          icon: 'search',
        })
        .toMeta()
      assert.deepEqual(meta.emptyState, {
        heading: 'No articles yet',
        description: 'Create one to get started.',
      })
      assert.deepEqual(meta.filteredEmptyState, {
        heading: 'No matching articles',
        description: 'Try a different search or clear filters.',
        icon: 'search',
      })
    })

    it('filteredEmptyState alone does not surface emptyState', () => {
      const meta = Table.make()
        .filteredEmptyState({ heading: 'No matches' })
        .toMeta()
      assert.equal(meta.emptyState, undefined)
      assert.deepEqual(meta.filteredEmptyState, { heading: 'No matches' })
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

    it('defaultGroup(column) round-trips on the meta', () => {
      assert.equal(Table.make().defaultGroup('status').toMeta().defaultGroup, 'status')
      assert.equal(Table.make().toMeta().defaultGroup, undefined)
    })

    it('groups([...]) round-trips on the meta with serialized TableGroupMeta', () => {
      const meta = Table.make()
        .groups([
          TableGroup.make('status').label('Status').collapsible(),
          TableGroup.make('createdAt').label('Created').date(),
        ])
        .toMeta()
      assert.equal(meta.groups?.length, 2)
      assert.deepEqual(meta.groups![0], { column: 'status',    label: 'Status',  collapsible: true })
      assert.deepEqual(meta.groups![1], { column: 'createdAt', label: 'Created', date: true })
    })

    it('groups meta key is absent when no groups are registered', () => {
      assert.equal(Table.make().toMeta().groups, undefined)
    })

    it('defaultGroup(TableGroup) auto-adds the group when not already registered', () => {
      const t = Table.make().defaultGroup(TableGroup.make('status').label('Status'))
      const meta = t.toMeta()
      assert.equal(meta.defaultGroup, 'status')
      assert.equal(meta.groups?.length, 1)
      assert.equal(meta.groups![0]!.column, 'status')
      assert.equal(meta.groups![0]!.label,  'Status')
    })

    it('defaultGroup(TableGroup) does NOT duplicate when group is already registered', () => {
      const status = TableGroup.make('status').label('Status')
      const t = Table.make()
        .groups([status, TableGroup.make('author').label('Author')])
        .defaultGroup(status)
      assert.equal(t.toMeta().groups?.length, 2)
    })

    it('defaultGroup(string) does NOT auto-add to groups', () => {
      const meta = Table.make().defaultGroup('status').toMeta()
      assert.equal(meta.defaultGroup, 'status')
      assert.equal(meta.groups, undefined)
    })

    it('withActiveGroup() overrides the configured defaultGroup on the meta', () => {
      const t = Table.make().defaultGroup('status')
      assert.equal(t.toMeta().defaultGroup, 'status')
      t.withActiveGroup('author')
      assert.equal(t.toMeta().defaultGroup, 'author')
    })

    it('withActiveGroup("") (empty) clears the meta defaultGroup', () => {
      const t = Table.make().defaultGroup('status')
      t.withActiveGroup('')
      assert.equal(t.toMeta().defaultGroup, undefined)
    })

    it('summaries meta is undefined until withSummaries() is called', () => {
      const t = Table.make()
      assert.equal(t.toMeta().summaries, undefined)
      t.withSummaries({ amount: [{ kind: 'sum', value: '42' }] })
      assert.deepEqual(t.toMeta().summaries, { amount: [{ kind: 'sum', value: '42' }] })
    })

    it('reorderable() emits reorderable=true + reorderableColumn on meta', () => {
      const meta = Table.make().reorderable('position').toMeta()
      assert.equal(meta.reorderable, true)
      assert.equal(meta.reorderableColumn, 'position')
    })

    it('reorderable() defaults the column name to "sort"', () => {
      const meta = Table.make().reorderable().toMeta()
      assert.equal(meta.reorderable, true)
      assert.equal(meta.reorderableColumn, 'sort')
    })

    it('reorderable meta keys are absent until reorderable() is called', () => {
      const meta = Table.make().toMeta()
      assert.equal(meta.reorderable,        undefined)
      assert.equal(meta.reorderableColumn,  undefined)
      assert.equal(Table.make().isReorderable(), false)
    })

    it('isReorderable + getReorderableColumn round-trip', () => {
      const t = Table.make().reorderable('rank')
      assert.equal(t.isReorderable(), true)
      assert.equal(t.getReorderableColumn(), 'rank')
    })

    it('withReorderUrl stamps the meta and the getter', () => {
      const t = Table.make().reorderable('sort').withReorderUrl('/admin/posts/_reorder')
      assert.equal(t.getReorderUrl(), '/admin/posts/_reorder')
      assert.equal(t.toMeta().reorderUrl, '/admin/posts/_reorder')
    })

    it('reorderUrl meta is absent until tagged', () => {
      const meta = Table.make().reorderable('sort').toMeta()
      assert.equal(meta.reorderUrl, undefined)
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

  describe('contentLayout — cards', () => {
    it('default contentLayout is "table" — meta omits the field', () => {
      const t = Table.make()
      assert.equal(t.getContentLayout(), 'table')
      assert.equal(t.isCardsLayout(), false)
      const meta = t.toMeta()
      assert.equal(meta.contentLayout, undefined)
    })

    it('cards() sugar flips the layout and exposes it on meta', () => {
      const t = Table.make().cards().cardSchema(() => [])
      assert.equal(t.getContentLayout(), 'cards')
      assert.equal(t.isCardsLayout(), true)
      assert.equal(t.toMeta().contentLayout, 'cards')
    })

    it('toMeta() does NOT require a cardSchema — cards mode renders an auto-card', () => {
      const t = Table.make().cards()
      assert.doesNotThrow(() => t.toMeta())
      assert.equal(t.toMeta().contentLayout, 'cards')
    })

    it('cardsPerRow stamps onto meta and clamps to [1, 12]', () => {
      const t = Table.make()
        .cards()
        .cardSchema(() => [])
        .cardsPerRow({ default: 1, sm: 2, md: 3, lg: 4 })
      const meta = t.toMeta()
      assert.deepEqual(meta.cardsPerRow, { default: 1, sm: 2, md: 3, lg: 4 })

      const clampedHigh = Table.make()
        .cards()
        .cardSchema(() => [])
        .cardsPerRow({ default: 99, sm: -3 })
        .toMeta()
      assert.deepEqual(clampedHigh.cardsPerRow, { default: 12, sm: 1 })
    })

    it('contentLayout("table") stays the default and clears cardSchema requirement', () => {
      const t = Table.make().cards().contentLayout('table')
      // Even though cardSchema is unset, table mode shouldn't throw.
      assert.doesNotThrow(() => t.toMeta())
      assert.equal(t.toMeta().contentLayout, undefined)
    })

    it('cardSchema receiver gets (record, auto, ctx)', () => {
      type Row = { id: number; title: string }
      const seen: Array<{ row: Row; autoLen: number; hasCtx: boolean }> = []
      const t = Table.make<Row>()
        .cards()
        .columns([Column.make('title')])
        .records(() => [{ id: 1, title: 'A' }, { id: 2, title: 'B' }])
        .cardSchema((row, auto, ctx) => {
          seen.push({ row, autoLen: auto.length, hasCtx: typeof ctx === 'object' })
          return auto
        })
      // resolveSchema doesn't run records or per-row stamping — that's the
      // dispatcher's job. Confirm the handler is wired and receives the
      // auto-built elements as the second arg + the ctx as the third.
      const fakeAuto = [{}, {}] as never
      t.getCardSchema()?.({ id: 1, title: 'A' }, fakeAuto, {} as never)
      assert.equal(seen.length, 1)
      assert.equal(seen[0]!.row.id, 1)
      assert.equal(seen[0]!.autoLen, 2)
      assert.equal(seen[0]!.hasCtx, true)
    })

    it('survives resolveSchema as a regular Element', async () => {
      const t = Table.make()
        .cards()
        .columns([Column.make('title')])
        .cardSchema(() => [])
      const resolved = await resolveSchema([t])
      assert.equal(resolved.length, 1)
      assert.equal(resolved[0]!['type'], 'table')
      assert.equal(resolved[0]!['contentLayout'], 'cards')
    })
  })

  describe('filtersLayout', () => {
    it('default is "modal" and meta omits the field', () => {
      const t = Table.make()
      assert.equal(t.getFiltersLayout(), 'modal')
      assert.equal(t.toMeta().filtersLayout, undefined)
    })

    it('"above-content" round-trips on the meta', () => {
      const meta = Table.make().filtersLayout('above-content').toMeta()
      assert.equal(meta.filtersLayout, 'above-content')
    })

    it('"above-content-collapsible" round-trips on the meta', () => {
      const meta = Table.make().filtersLayout('above-content-collapsible').toMeta()
      assert.equal(meta.filtersLayout, 'above-content-collapsible')
    })

    it('"below-content" round-trips on the meta', () => {
      const meta = Table.make().filtersLayout('below-content').toMeta()
      assert.equal(meta.filtersLayout, 'below-content')
    })

    it('explicit "modal" still omits the field', () => {
      const t = Table.make()
        .filtersLayout('above-content')
        .filtersLayout('modal')
      assert.equal(t.getFiltersLayout(), 'modal')
      assert.equal(t.toMeta().filtersLayout, undefined)
    })
  })
})
