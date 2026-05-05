import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { Table } from './Table.js'
import { TableGroup, orderByKeys } from './TableGroup.js'
import { Column } from '../Column.js'
import { Section } from '../schema/Section.js'
import { resolveSchema } from '../schema/resolveSchema.js'
import { Sum, Average, Count, Range } from '../summarizers/Summarizer.js'
import { TextInputColumn, ToggleColumn, SelectColumn } from '../columns/index.js'
import {
  registerRichTextRenderer,
  _resetRichTextRegistryForTests,
} from '../richtext/registry.js'
import {
  parseTableQuery,
  parseActiveGroup,
  findTables,
  loadTableRecords,
} from './dispatchTable.js'

describe('parseTableQuery', () => {
  it('returns all-undefined for an empty input', () => {
    assert.deepEqual(parseTableQuery({}), {
      search: undefined, sort: undefined, page: undefined, perPage: undefined,
    })
  })

  it('parses search and trims whitespace', () => {
    assert.equal(parseTableQuery({ search: '  hello  ' }).search, 'hello')
    assert.equal(parseTableQuery({ search: '   ' }).search, undefined)
  })

  it('parses sort with explicit direction', () => {
    assert.deepEqual(parseTableQuery({ sort: 'title:desc' }).sort, { column: 'title', direction: 'desc' })
  })

  it('defaults sort direction to asc', () => {
    assert.deepEqual(parseTableQuery({ sort: 'title' }).sort, { column: 'title', direction: 'asc' })
    assert.deepEqual(parseTableQuery({ sort: 'title:bogus' }).sort, { column: 'title', direction: 'asc' })
  })

  it('floors page to integer ≥ 1', () => {
    assert.equal(parseTableQuery({ page: '3' }).page, 3)
    assert.equal(parseTableQuery({ page: '-2' }).page, 1)
    assert.equal(parseTableQuery({ page: 'abc' }).page, 1)
    assert.equal(parseTableQuery({ page: '0' }).page, 1)
  })

  it('skips non-positive perPage', () => {
    assert.equal(parseTableQuery({ perPage: '25' }).perPage, 25)
    assert.equal(parseTableQuery({ perPage: '0' }).perPage, undefined)
    assert.equal(parseTableQuery({ perPage: '-5' }).perPage, undefined)
  })
})

describe('findTables', () => {
  it('returns every Table in document order, including nested', () => {
    const inner = Table.make().columns([Column.make('a')])
    const outer = Table.make().schema([
      Column.make('x'),
      Section.make('s').schema([inner]),
    ])
    const top = Table.make()
    const found = findTables([top, outer])
    assert.equal(found.length, 3)
    assert.equal(found[0], top)
    assert.equal(found[1], outer)
    assert.equal(found[2], inner)
  })
})

describe('loadTableRecords', () => {
  it('passes parsed sort/search/page into the records handler', async () => {
    let seen: Record<string, unknown> | null = null
    const t = Table.make<{ id: string }>()
      .columns([Column.make('id')])
      .records(async (ctx) => { seen = { ...ctx }; return { rows: [{ id: '1' }], total: 1 } })

    await loadTableRecords([t], { sort: 'name:desc', search: '  q  ', page: '2' })

    assert.deepEqual(seen, {
      sort:   { column: 'name', direction: 'desc' },
      search: 'q',
      page:   2,
    } satisfies Record<string, unknown>)
  })

  it('falls back to Table.defaultSort when URL sort is absent', async () => {
    let seenSort: unknown = null
    const t = Table.make()
      .columns([Column.make('createdAt')])
      .defaultSort('createdAt', 'desc')
      .records(async (ctx) => { seenSort = ctx.sort; return [] })

    await loadTableRecords([t], {})
    assert.deepEqual(seenSort, { column: 'createdAt', direction: 'desc' })
  })

  it('falls back to (reorderableColumn, asc) when reorderable is set and no defaultSort', async () => {
    let seenSort: unknown = null
    const t = Table.make()
      .columns([Column.make('sort')])
      .reorderable('sort')
      .records(async (ctx) => { seenSort = ctx.sort; return [] })

    await loadTableRecords([t], {})
    assert.deepEqual(seenSort, { column: 'sort', direction: 'asc' })
  })

  it('explicit defaultSort wins over reorderable fallback', async () => {
    let seenSort: unknown = null
    const t = Table.make()
      .columns([Column.make('createdAt')])
      .reorderable('rank')
      .defaultSort('createdAt', 'desc')
      .records(async (ctx) => { seenSort = ctx.sort; return [] })

    await loadTableRecords([t], {})
    assert.deepEqual(seenSort, { column: 'createdAt', direction: 'desc' })
  })

  it('URL ?sort= still wins over the reorderable fallback', async () => {
    let seenSort: unknown = null
    const t = Table.make()
      .columns([Column.make('title').sortable()])
      .reorderable('sort')
      .records(async (ctx) => { seenSort = ctx.sort; return [] })

    await loadTableRecords([t], { sort: 'title:desc' })
    assert.deepEqual(seenSort, { column: 'title', direction: 'desc' })
  })

  it('attaches rows + total to the table for serialization', async () => {
    const t = Table.make().columns([Column.make('id')])
      .records(async () => ({ rows: [{ id: 'a' }, { id: 'b' }], total: 42 }))

    await loadTableRecords([t], {})
    const meta = (await resolveSchema([t]))[0]!
    assert.deepEqual(meta['rows'], [{ id: 'a' }, { id: 'b' }])
    assert.equal(meta['total'], 42)
  })

  it('treats a bare row array as { rows, total: rows.length }', async () => {
    const t = Table.make().columns([Column.make('id')])
      .records(async () => [{ id: 'x' }, { id: 'y' }, { id: 'z' }])

    await loadTableRecords([t], {})
    const meta = (await resolveSchema([t]))[0]!
    assert.equal((meta['rows'] as unknown[]).length, 3)
    assert.equal(meta['total'], 3)
  })

  it('mirrors search/sort/page state back onto toMeta even with no records handler', async () => {
    const t = Table.make().columns([Column.make('title').sortable()])
    await loadTableRecords([t], { search: 'hi', sort: 'title:asc', page: '3' })
    const meta = (await resolveSchema([t]))[0]!
    assert.equal(meta['search'], 'hi')
    assert.deepEqual(meta['currentSort'], { column: 'title', direction: 'asc' })
    assert.equal(meta['currentPage'], 3)
    assert.equal(meta['rows'], undefined) // never ran a handler
  })

  it('runs every table on the page in parallel', async () => {
    const calls: string[] = []
    const a = Table.make().records(async () => { calls.push('a'); return [] })
    const b = Table.make().records(async () => { calls.push('b'); return [] })
    await loadTableRecords([a, b], {})
    assert.equal(calls.length, 2)
    assert.ok(calls.includes('a') && calls.includes('b'))
  })

  it('is a no-op when there are no Tables', async () => {
    await loadTableRecords([Column.make('x')], {})  // no throw
  })

  describe('per-row action visibility', () => {
    it('stamps _visibleActions / _disabledActions when row actions have rules', async () => {
      const { Action } = await import('../actions/Action.js')
      const t = Table.make()
        .columns([Column.make('id')])
        .recordActions([
          Action.make('archive').visible(({ record }) => (record as { archived?: boolean }).archived === false),
          Action.make('lock').disabled(({ record }) => (record as { locked?: boolean }).locked === true),
        ])
        .records(async () => [
          { id: '1', archived: false, locked: false },
          { id: '2', archived: true,  locked: true },
        ])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      // Row 0: archive visible (not archived), lock visible (default — no
      // visibility rule, only a disabled rule), lock not disabled.
      assert.deepEqual(rows[0]!['_visibleActions'], ['archive', 'lock'])
      assert.deepEqual(rows[0]!['_disabledActions'], [])
      // Row 1: archive hidden (already archived), lock still visible but
      // disabled.
      assert.deepEqual(rows[1]!['_visibleActions'], ['lock'])
      assert.deepEqual(rows[1]!['_disabledActions'], ['lock'])
    })

    it('runs formatStateUsing per row and stamps _formatted on each row', async () => {
      const t = Table.make()
        .columns([
          Column.make('title'),
          Column.make('priority').formatStateUsing(
            (v) => `★ ${(v as number ?? 0)}`,
          ),
        ])
        .records(async () => [
          { id: '1', title: 'one', priority: 5 },
          { id: '2', title: 'two', priority: 9 },
        ])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.deepEqual(rows[0]!['_formatted'], { priority: '★ 5' })
      assert.deepEqual(rows[1]!['_formatted'], { priority: '★ 9' })
    })

    it('swallows errors thrown by a formatStateUsing handler', async () => {
      const t = Table.make()
        .columns([
          Column.make('priority').formatStateUsing(() => { throw new Error('oops') }),
        ])
        .records(async () => [{ id: '1', priority: 0 }])

      await loadTableRecords([t], {})  // no throw
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      // _formatted is present but the broken column's key is absent.
      const formatted = rows[0]!['_formatted'] as Record<string, string>
      assert.equal(formatted['priority'], undefined)
    })

    describe('richtext columns', () => {
      beforeEach(() => _resetRichTextRegistryForTests())
      afterEach(() => _resetRichTextRegistryForTests())

      it('skips per-row work when no renderer is registered', async () => {
        const t = Table.make()
          .columns([Column.make('body')])
          .records(async () => [
            { id: '1', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] } },
          ])

        await loadTableRecords([t], {})
        const meta = (await resolveSchema([t]))[0]!
        const rows = meta['rows'] as Array<Record<string, unknown>>
        assert.equal(rows[0]!['_formatted'], undefined)
        assert.equal(rows[0]!['_richtextCells'], undefined)
      })

      it('stamps _formatted + _richtextCells when registered renderer matches', async () => {
        registerRichTextRenderer(
          () => '<p>auto</p>',
          (v) => typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'doc',
        )
        const t = Table.make()
          .columns([Column.make('body'), Column.make('title')])
          .records(async () => [
            { id: '1', title: 'untouched', body: { type: 'doc', content: [] } },
            { id: '2', title: 'plain',     body: 'plain text' },
          ])

        await loadTableRecords([t], {})
        const meta = (await resolveSchema([t]))[0]!
        const rows = meta['rows'] as Array<Record<string, unknown>>
        const r0 = rows[0] as Record<string, unknown>
        assert.deepEqual(r0['_formatted'],     { body: '<p>auto</p>' })
        assert.deepEqual(r0['_richtextCells'], { body: true })
        // Plain text rows skip the stamp entirely.
        const r1 = rows[1] as Record<string, unknown>
        assert.equal(r1['_formatted'],     undefined)
        assert.equal(r1['_richtextCells'], undefined)
      })

      it('skips columns with formatStateUsing (user formatter wins)', async () => {
        registerRichTextRenderer(() => '<p>auto</p>', () => true)
        const t = Table.make()
          .columns([Column.make('body').formatStateUsing(() => 'manual')])
          .records(async () => [{ id: '1', body: { type: 'doc', content: [] } }])

        await loadTableRecords([t], {})
        const meta = (await resolveSchema([t]))[0]!
        const rows = meta['rows'] as Array<Record<string, unknown>>
        assert.deepEqual(rows[0]!['_formatted'], { body: 'manual' })
        assert.equal(rows[0]!['_richtextCells'], undefined)
      })

      it('skips columns with built-in format', async () => {
        registerRichTextRenderer(() => '<p>auto</p>', () => true)
        const t = Table.make()
          .columns([Column.make('publishedAt').dateTime()])
          .records(async () => [{ id: '1', publishedAt: '2026-01-01T00:00:00Z' }])

        await loadTableRecords([t], {})
        const meta = (await resolveSchema([t]))[0]!
        const rows = meta['rows'] as Array<Record<string, unknown>>
        assert.equal(rows[0]!['_richtextCells'], undefined)
      })
    })

    it('does not stamp _visibleActions when no row actions have rules', async () => {
      const { Action } = await import('../actions/Action.js')
      const t = Table.make()
        .columns([Column.make('id')])
        .recordActions([Action.make('edit')])  // no rules
        .records(async () => [{ id: '1' }])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_visibleActions'],  undefined)
      assert.equal(rows[0]!['_disabledActions'], undefined)
    })
  })

  describe('Table.recordUrl', () => {
    it('stamps _recordUrl on each row when a recordUrl handler is set', async () => {
      const t = Table.make<{ id: string }>()
        .columns([Column.make('id')])
        .records(async () => [{ id: 'a' }, { id: 'b' }])
        .recordUrl((r) => `/admin/posts/${r.id}/edit`)

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['recordUrl'], true, 'meta.recordUrl flag set')
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_recordUrl'], '/admin/posts/a/edit')
      assert.equal(rows[1]!['_recordUrl'], '/admin/posts/b/edit')
    })

    it('skips _recordUrl when handler returns undefined for that row', async () => {
      const t = Table.make<{ id: string; status?: string }>()
        .columns([Column.make('id')])
        .records(async () => [{ id: 'a', status: 'archived' }, { id: 'b' }])
        .recordUrl((r) => r.status === 'archived' ? undefined : `/admin/posts/${r.id}`)

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_recordUrl'], undefined)
      assert.equal(rows[1]!['_recordUrl'], '/admin/posts/b')
    })

    it('does not stamp recordUrl flag or _recordUrl when handler is unset', async () => {
      const t = Table.make()
        .columns([Column.make('id')])
        .records(async () => [{ id: 'a' }])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['recordUrl'], undefined)
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_recordUrl'], undefined)
    })
  })

  describe('Table.defaultGroup + summaries', () => {
    it('stamps _groupValue on each row when defaultGroup(col) is set', async () => {
      const t = Table.make<{ id: string; status: string }>()
        .columns([Column.make('status'), Column.make('id')])
        .records(async () => [
          { id: '1', status: 'draft' },
          { id: '2', status: 'published' },
          { id: '3', status: 'draft' },
        ])
        .defaultGroup('status')

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['defaultGroup'], 'status')
      const rows = meta['rows'] as Array<Record<string, unknown>>
      // Stable sort clusters drafts together.
      assert.deepEqual(rows.map(r => r['id']), ['1', '3', '2'])
      assert.equal(rows[0]!['_groupValue'], 'draft')
      assert.equal(rows[1]!['_groupValue'], 'draft')
      assert.equal(rows[2]!['_groupValue'], 'published')
    })

    it('preserves original sub-order within each group (stable sort)', async () => {
      const t = Table.make<{ id: string; team: string }>()
        .columns([Column.make('team'), Column.make('id')])
        .records(async () => [
          { id: 'a', team: 'red' },
          { id: 'b', team: 'blue' },
          { id: 'c', team: 'red' },
          { id: 'd', team: 'blue' },
        ])
        .defaultGroup('team')

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.deepEqual(rows.map(r => r['id']), ['b', 'd', 'a', 'c'])
    })

    it('moves rows with empty/null group values to the end', async () => {
      const t = Table.make<{ id: string; status: string | null }>()
        .columns([Column.make('status')])
        .records(async () => [
          { id: '1', status: null },
          { id: '2', status: 'active' },
          { id: '3', status: '' },
        ])
        .defaultGroup('status')

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.deepEqual(rows.map(r => r['id']), ['2', '1', '3'])
      assert.equal(rows[1]!['_groupValue'], '')
      assert.equal(rows[2]!['_groupValue'], '')
    })

    it('TableGroup.orderUsing() pins group order', async () => {
      // Without orderUsing, alphabetic order would put 'archived' first.
      // With orderByKeys(['draft', 'published', 'archived']), drafts come
      // first regardless. Empty bucket still sinks to the bottom.
      const status = TableGroup.make('status').orderUsing(
        orderByKeys(['draft', 'published', 'archived']),
      )
      const t = Table.make<{ id: string; status: string | null }>()
        .columns([Column.make('status')])
        .records(async () => [
          { id: 'a', status: 'archived'  },
          { id: 'd', status: 'draft'     },
          { id: 'p', status: 'published' },
          { id: 'n', status: null        },
          { id: 'd2', status: 'draft'    },
        ])
        .defaultGroup(status)

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.deepEqual(
        rows.map(r => r['id']),
        ['d', 'd2', 'p', 'a', 'n'],
      )
    })

    it('orderUsing() composes with the empty-bucket-last rule', async () => {
      // Comparator that would put '' at the top alphabetically — the
      // structural empty-last rule still wins.
      const status = TableGroup.make('status').orderUsing(
        (a, b) => a.localeCompare(b),
      )
      const t = Table.make<{ id: string; status: string | null }>()
        .columns([Column.make('status')])
        .records(async () => [
          { id: 'n', status: null   },
          { id: 'b', status: 'beta' },
          { id: 'a', status: 'alpha'},
        ])
        .defaultGroup(status)

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.deepEqual(rows.map(r => r['id']), ['a', 'b', 'n'])
    })

    it('computes per-column summaries over the rendered rows', async () => {
      const t = Table.make<{ amount: number; tax: number }>()
        .columns([
          Column.make('amount').summarize([
            Sum.make().label('Total'),
            Average.make().label('Avg'),
          ]),
          Column.make('tax').summarize([
            Range.make(),
            Count.make().label('Rows'),
          ]),
        ])
        .records(async () => [
          { amount: 100, tax: 10 },
          { amount: 200, tax: 25 },
          { amount: 300, tax: 5  },
        ])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const summaries = meta['summaries'] as Record<string, Array<{ kind: string; value: string; label?: string }>>
      assert.deepEqual(summaries['amount'], [
        { kind: 'sum',     label: 'Total', value: '600' },
        { kind: 'average', label: 'Avg',   value: '200' },
      ])
      assert.deepEqual(summaries['tax'], [
        { kind: 'range',                  value: '5..25' },
        { kind: 'count', label: 'Rows',   value: '3' },
      ])
    })

    it('skips summaries when no column has summarizers', async () => {
      const t = Table.make()
        .columns([Column.make('id')])
        .records(async () => [{ id: '1' }])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['summaries'], undefined)
    })

    it('summaries respect the grouped row order (compute over final rendered rows)', async () => {
      const t = Table.make<{ amount: number; status: string }>()
        .columns([
          Column.make('status'),
          Column.make('amount').summarize([Sum.make()]),
        ])
        .records(async () => [
          { amount: 50,  status: 'draft' },
          { amount: 100, status: 'published' },
        ])
        .defaultGroup('status')

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const summaries = meta['summaries'] as Record<string, Array<{ kind: string; value: string }>>
      // Sum is order-independent; this also confirms grouping doesn't
      // accidentally drop rows from the summary input.
      assert.equal(summaries['amount']![0]!.value, '150')
    })
  })

  describe('Table.groups + parseActiveGroup', () => {
    it('parseActiveGroup: ?group=col picks a registered group', () => {
      const t = Table.make()
        .groups([TableGroup.make('status'), TableGroup.make('author')])
      assert.equal(parseActiveGroup({ group: 'status' }, t), 'status')
      assert.equal(parseActiveGroup({ group: 'author' }, t), 'author')
    })

    it('parseActiveGroup: ?group= (empty) explicitly clears', () => {
      const t = Table.make().defaultGroup('status')
      assert.equal(parseActiveGroup({ group: '' }, t), undefined)
    })

    it('parseActiveGroup: absent ?group falls back to defaultGroup', () => {
      const t = Table.make().defaultGroup('status')
      assert.equal(parseActiveGroup({}, t), 'status')
    })

    it('parseActiveGroup: unknown column falls back to no grouping', () => {
      const t = Table.make()
        .groups([TableGroup.make('status')])
        .defaultGroup('status')
      assert.equal(parseActiveGroup({ group: 'wat' }, t), undefined)
    })

    it('parseActiveGroup: bare-column form works (no groups([…]) registered)', () => {
      const t = Table.make().defaultGroup('status')
      assert.equal(parseActiveGroup({ group: 'status' }, t), 'status')
    })

    it('?group=col switches the active group at load time', async () => {
      const t = Table.make<{ id: string; status: string; author: string }>()
        .columns([Column.make('status'), Column.make('author')])
        .groups([TableGroup.make('status'), TableGroup.make('author')])
        .defaultGroup('status')
        .records(async () => [
          { id: '1', status: 'draft',     author: 'a' },
          { id: '2', status: 'published', author: 'b' },
          { id: '3', status: 'draft',     author: 'a' },
        ])

      await loadTableRecords([t], { group: 'author' })
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['defaultGroup'], 'author')
      const rows = meta['rows'] as Array<Record<string, unknown>>
      // Stable-sort clusters by author now.
      assert.deepEqual(rows.map(r => r['_groupValue']), ['a', 'a', 'b'])
    })

    it('?group= explicitly disables grouping (overrides defaultGroup)', async () => {
      const t = Table.make<{ id: string; status: string }>()
        .columns([Column.make('status')])
        .defaultGroup('status')
        .records(async () => [
          { id: '1', status: 'draft' },
          { id: '2', status: 'published' },
        ])

      await loadTableRecords([t], { group: '' })
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['defaultGroup'], undefined)
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_groupValue'], undefined)
    })

    it('getTitleFromRecordUsing stamps _groupTitle per row', async () => {
      const t = Table.make<{ id: string; status: string }>()
        .columns([Column.make('status')])
        .groups([
          TableGroup.make<{ id: string; status: string }>('status').getTitleFromRecordUsing(
            (r) => r.status === 'draft' ? 'Drafts' : 'Live',
          ),
        ])
        .defaultGroup('status')
        .records(async () => [
          { id: '1', status: 'draft' },
          { id: '2', status: 'published' },
        ])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_groupTitle'], 'Drafts')
      assert.equal(rows[1]!['_groupTitle'], 'Live')
    })

    it('getDescriptionFromRecordUsing stamps _groupDescription per row', async () => {
      const t = Table.make<{ id: string; status: string }>()
        .columns([Column.make('status')])
        .groups([
          TableGroup.make<{ id: string; status: string }>('status').getDescriptionFromRecordUsing(
            (r) => `${r.status} band`,
          ),
        ])
        .defaultGroup('status')
        .records(async () => [{ id: '1', status: 'draft' }])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_groupDescription'], 'draft band')
    })

    it('throwing title handler stays silent (falls back to bare _groupValue)', async () => {
      const t = Table.make<{ id: string; status: string }>()
        .columns([Column.make('status')])
        .groups([
          TableGroup.make('status').getTitleFromRecordUsing(() => {
            throw new Error('boom')
          }),
        ])
        .defaultGroup('status')
        .records(async () => [{ id: '1', status: 'draft' }])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_groupTitle'],       undefined)
      assert.equal(rows[0]!['_groupValue'],       'draft')
    })

    it('date() bucketing stamps _groupValue as YYYY-MM-DD + a default _groupTitle', async () => {
      const t = Table.make<{ id: string; createdAt: string }>()
        .columns([Column.make('createdAt')])
        .groups([TableGroup.make('createdAt').date()])
        .defaultGroup('createdAt')
        .records(async () => [
          { id: '1', createdAt: '2026-05-04T10:00:00.000Z' },
          { id: '2', createdAt: '2026-05-04T22:30:00.000Z' },
          { id: '3', createdAt: '2026-04-15T08:00:00.000Z' },
        ])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      // Two rows on 2026-05-04 cluster, then 2026-04-15 — but stable-sort
      // is alphabetical on the bucket string, so 04-15 sorts before 05-04.
      assert.deepEqual(rows.map(r => r['_groupValue']), ['2026-04-15', '2026-05-04', '2026-05-04'])
      // Default title formatter kicks in (locale text containing the year).
      assert.match(String(rows[0]!['_groupTitle']), /2026/)
    })

    it('date() with a user title handler — the user handler wins over the default', async () => {
      const t = Table.make<{ id: string; createdAt: string }>()
        .columns([Column.make('createdAt')])
        .groups([
          TableGroup.make('createdAt').date()
            .getTitleFromRecordUsing(() => 'CUSTOM'),
        ])
        .defaultGroup('createdAt')
        .records(async () => [{ id: '1', createdAt: '2026-05-04T00:00:00.000Z' }])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_groupTitle'], 'CUSTOM')
    })

    it('per-group summaries: stamps groupSummaries[value][col] when grouping is active', async () => {
      const t = Table.make<{ amount: number; status: string }>()
        .columns([
          Column.make('status'),
          Column.make('amount').summarize([
            Sum.make().label('Total'),
            Count.make().label('Rows'),
          ]),
        ])
        .defaultGroup('status')
        .records(async () => [
          { amount: 50,  status: 'draft' },
          { amount: 75,  status: 'draft' },
          { amount: 200, status: 'published' },
        ])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const groupSummaries = meta['groupSummaries'] as
        Record<string, Record<string, Array<{ kind: string; value: string; label?: string }>>>
      assert.equal(groupSummaries['draft']!['amount']![0]!.value,     '125')
      assert.equal(groupSummaries['draft']!['amount']![0]!.label,     'Total')
      assert.equal(groupSummaries['draft']!['amount']![1]!.value,     '2')
      assert.equal(groupSummaries['published']!['amount']![0]!.value, '200')
      assert.equal(groupSummaries['published']!['amount']![1]!.value, '1')
    })

    it('per-group summaries: omits the meta key entirely when grouping is OFF', async () => {
      const t = Table.make<{ amount: number }>()
        .columns([Column.make('amount').summarize([Sum.make()])])
        .records(async () => [{ amount: 50 }, { amount: 75 }])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      // Global summary still computes; per-group is absent.
      assert.equal((meta['summaries'] as Record<string, unknown>)['amount'] !== undefined, true)
      assert.equal(meta['groupSummaries'], undefined)
    })

    it('per-group summaries: omits when no column has summarizers', async () => {
      const t = Table.make<{ status: string }>()
        .columns([Column.make('status')])
        .defaultGroup('status')
        .records(async () => [{ status: 'draft' }])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['groupSummaries'], undefined)
    })

    it('per-group summaries: ?group= override (clears grouping) → no group summaries', async () => {
      const t = Table.make<{ amount: number; status: string }>()
        .columns([Column.make('amount').summarize([Sum.make()])])
        .defaultGroup('status')
        .records(async () => [
          { amount: 50,  status: 'draft' },
          { amount: 75,  status: 'published' },
        ])

      await loadTableRecords([t], { group: '' })
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['groupSummaries'], undefined)
      // Global summary still computes.
      assert.equal((meta['summaries'] as Record<string, Array<{ value: string }>>)['amount']![0]!.value, '125')
    })

    it('per-group summaries: empty-group bucket gets its own row when present', async () => {
      const t = Table.make<{ amount: number; status: string | null }>()
        .columns([Column.make('amount').summarize([Sum.make()])])
        .defaultGroup('status')
        .records(async () => [
          { amount: 50,  status: 'draft' },
          { amount: 25,  status: null   },
        ])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const groupSummaries = meta['groupSummaries'] as
        Record<string, Record<string, Array<{ value: string }>>>
      assert.equal(groupSummaries['draft']!['amount']![0]!.value, '50')
      assert.equal(groupSummaries['']!     ['amount']![0]!.value, '25')
    })

    it('toMeta emits groups[] for the renderer dropdown', async () => {
      const t = Table.make()
        .columns([Column.make('status'), Column.make('author')])
        .groups([
          TableGroup.make('status').label('Status').collapsible(),
          TableGroup.make('author').label('Author'),
        ])
        .defaultGroup('status')
        .records(async () => [])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const groups = meta['groups'] as Array<Record<string, unknown>>
      assert.equal(groups.length, 2)
      assert.equal(groups[0]!['column'], 'status')
      assert.equal(groups[0]!['label'],  'Status')
      assert.equal(groups[0]!['collapsible'], true)
    })
  })

  describe('Table.recordClasses', () => {
    it('stamps _recordClasses on each row when a handler is set', async () => {
      const t = Table.make<{ id: string; status: string }>()
        .columns([Column.make('id')])
        .records(async () => [
          { id: 'a', status: 'active' },
          { id: 'b', status: 'archived' },
        ])
        .recordClasses((r) => r.status === 'archived' ? 'opacity-50' : 'bg-success/5')

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['recordClasses'], true)
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_recordClasses'], 'bg-success/5')
      assert.equal(rows[1]!['_recordClasses'], 'opacity-50')
    })

    it('skips _recordClasses when handler returns undefined or empty', async () => {
      const t = Table.make<{ id: string }>()
        .columns([Column.make('id')])
        .records(async () => [{ id: 'a' }, { id: 'b' }])
        .recordClasses((r) => r.id === 'a' ? '' : undefined)

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_recordClasses'], undefined)
      assert.equal(rows[1]!['_recordClasses'], undefined)
    })

    it('swallows errors thrown by the recordClasses handler', async () => {
      const t = Table.make<{ id: string }>()
        .columns([Column.make('id')])
        .records(async () => [{ id: 'a' }])
        .recordClasses(() => { throw new Error('boom') })

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_recordClasses'], undefined)
    })

    it('does not stamp recordClasses flag when handler is unset', async () => {
      const t = Table.make()
        .columns([Column.make('id')])
        .records(async () => [{ id: 'a' }])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      assert.equal(meta['recordClasses'], undefined)
    })
  })

  describe('Column.recordUrl per-column override', () => {
    it('stamps _columnRecordUrls[name] when a column has its own recordUrl handler', async () => {
      const t = Table.make<{ id: string; slug: string }>()
        .columns([
          Column.make('title').recordUrl((r) => `/posts/${(r as { id?: string }).id}/edit`),
          Column.make('slug').recordUrl((r) => `/posts/${(r as { slug?: string }).slug}`),
        ])
        .records(async () => [
          { id: '1', slug: 'one' },
          { id: '2', slug: 'two' },
        ])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.deepEqual(rows[0]!['_columnRecordUrls'], {
        title: '/posts/1/edit',
        slug:  '/posts/one',
      })
      assert.deepEqual(rows[1]!['_columnRecordUrls'], {
        title: '/posts/2/edit',
        slug:  '/posts/two',
      })
    })

    it('skips a column-specific URL when its handler returns undefined for that row', async () => {
      const t = Table.make<{ id: string; status?: string }>()
        .columns([
          Column.make('title').recordUrl((r) =>
            (r as { status?: string }).status === 'archived'
              ? undefined
              : `/posts/${(r as { id?: string }).id}/edit`),
        ])
        .records(async () => [
          { id: '1', status: 'archived' },
          { id: '2' },
        ])

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.deepEqual(rows[0]!['_columnRecordUrls'], {})
      assert.deepEqual(rows[1]!['_columnRecordUrls'], { title: '/posts/2/edit' })
    })

    it('swallows errors thrown by a column recordUrl handler', async () => {
      const t = Table.make<{ id: string }>()
        .columns([
          Column.make('title').recordUrl(() => { throw new Error('oops') }),
        ])
        .records(async () => [{ id: '1' }])

      await loadTableRecords([t], {})  // no throw
      const meta = (await resolveSchema([t]))[0]!
      const rows = meta['rows'] as Array<Record<string, unknown>>
      // Bucket exists but the broken column's key is absent.
      assert.deepEqual(rows[0]!['_columnRecordUrls'], {})
    })

    it('Column.recordUrl(false) leaves the column meta marked as opted-out (no per-row stamp needed)', async () => {
      const t = Table.make<{ id: string }>()
        .columns([
          Column.make('id'),
          Column.make('actions').recordUrl(false),
        ])
        .records(async () => [{ id: 'a' }])
        .recordUrl((r) => `/posts/${(r as { id?: string }).id}`)

      await loadTableRecords([t], {})
      const meta = (await resolveSchema([t]))[0]!
      const cols = (meta['children'] as ElementMetaLike[] | undefined) ?? []
      const actions = cols.find(c => c['name'] === 'actions')
      assert.equal(actions?.['recordUrl'], false)
      const rows = meta['rows'] as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_recordUrl'], '/posts/a')
    })
  })

  describe('list-page tabs (active tab → TableContext)', () => {
    it('passes ctx.tab + ctx.tabQuery through when the active tab has modifyQuery', async () => {
      const { ListTab }  = await import('../Tab.js')
      const { ListTabs } = await import('./ListTabs.js')

      const queryFn = (q: { _filters: string[] }) => ({ ...q, _filters: [...q._filters, 'status=draft'] })

      const drafts = ListTab.make('drafts').modifyQuery(queryFn as never)
      drafts.withActive()

      let seenTab:      string | undefined
      let seenTabQuery: unknown
      const t = Table.make()
        .columns([Column.make('id')])
        .records(async (ctx) => {
          seenTab      = ctx.tab
          seenTabQuery = ctx.tabQuery
          return []
        })

      await loadTableRecords([t, ListTabs.make().tabs([drafts])], {})
      assert.equal(seenTab,      'drafts')
      assert.equal(seenTabQuery, queryFn)
    })

    it('runs the active tab modifyContext as a final transform on the TableContext', async () => {
      const { ListTab }  = await import('../Tab.js')
      const { ListTabs } = await import('./ListTabs.js')

      const drafts = ListTab.make('drafts').modifyContext((ctx) => ({ ...ctx, customFlag: 42 }))
      drafts.withActive()

      let seen: Record<string, unknown> | null = null
      const t = Table.make()
        .columns([Column.make('id')])
        .records(async (ctx) => { seen = { ...ctx }; return [] })

      await loadTableRecords([t, ListTabs.make().tabs([drafts])], {})
      assert.equal(seen!['customFlag'], 42)
      assert.equal(seen!['tab'],        'drafts')
    })

    it('does not set ctx.tab / tabQuery when no tab is active', async () => {
      let seen: Record<string, unknown> | null = null
      const t = Table.make()
        .columns([Column.make('id')])
        .records(async (ctx) => { seen = { ...ctx }; return [] })

      await loadTableRecords([t], {})
      assert.equal(seen!['tab'],      undefined)
      assert.equal(seen!['tabQuery'], undefined)
    })
  })

  describe('editable cell columns', () => {
    it('stamps _cellEditable on every row when canEdit hook is supplied + returns true', async () => {
      const t = Table.make<{ id: string; status: string }>()
        .columns([
          Column.make('id'),
          SelectColumn.make('status').options({ a: 'A', b: 'B' }),
        ])
        .records(async () => ({ rows: [{ id: '1', status: 'a' }, { id: '2', status: 'b' }], total: 2 }))

      await loadTableRecords([t], {}, undefined, undefined, {
        canEdit: () => true,
      })
      const rows = t.getRows() as Array<Record<string, unknown>>
      assert.deepEqual(rows[0]!['_cellEditable'], { status: true })
      assert.deepEqual(rows[1]!['_cellEditable'], { status: true })
      assert.equal(rows[0]!['_cellDisabled'], undefined)
    })

    it('skips _cellEditable on rows where canEdit returns false', async () => {
      const t = Table.make<{ id: string; archived: boolean }>()
        .columns([
          Column.make('id'),
          ToggleColumn.make('featured'),
        ])
        .records(async () => ({ rows: [
          { id: '1', archived: false },
          { id: '2', archived: true  },
        ], total: 2 }))

      await loadTableRecords([t], {}, undefined, undefined, {
        canEdit: (_user, record) => record['archived'] !== true,
      })
      const rows = t.getRows() as Array<Record<string, unknown>>
      assert.deepEqual(rows[0]!['_cellEditable'], { featured: true })
      assert.equal(rows[1]!['_cellEditable'], undefined)
    })

    it('stamps _cellDisabled when the column predicate flags the row', async () => {
      const t = Table.make<{ id: string; archived: boolean }>()
        .columns([
          Column.make('id'),
          SelectColumn.make('status')
            .options({ a: 'A', b: 'B' })
            .disabled(record => record['archived'] === true),
        ])
        .records(async () => ({ rows: [
          { id: '1', archived: false },
          { id: '2', archived: true  },
        ], total: 2 }))

      await loadTableRecords([t], {}, undefined, undefined, {
        canEdit: () => true,
      })
      const rows = t.getRows() as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_cellDisabled'], undefined)
      assert.deepEqual(rows[1]!['_cellDisabled'], { status: true })
      // The flag is independent — disabled rows are still stamped editable.
      assert.deepEqual(rows[1]!['_cellEditable'], { status: true })
    })

    it('skips per-row mutation entirely when no canEdit hook is supplied', async () => {
      const t = Table.make<{ id: string }>()
        .columns([
          Column.make('id'),
          TextInputColumn.make('title'),
        ])
        .records(async () => ({ rows: [{ id: '1' }], total: 1 }))

      await loadTableRecords([t], {})
      const rows = t.getRows() as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_cellEditable'], undefined)
      assert.equal(rows[0]!['_cellDisabled'], undefined)
    })

    it('treats canEdit throwing as denial (closed posture)', async () => {
      const t = Table.make<{ id: string }>()
        .columns([Column.make('id'), ToggleColumn.make('on')])
        .records(async () => ({ rows: [{ id: '1' }], total: 1 }))

      await loadTableRecords([t], {}, undefined, undefined, {
        canEdit: () => { throw new Error('boom') },
      })
      const rows = t.getRows() as Array<Record<string, unknown>>
      assert.equal(rows[0]!['_cellEditable'], undefined)
    })
  })
})

type ElementMetaLike = Record<string, unknown>

// ─── queryStringIdentifier (Tier-3) ────────────────────────────

import { SelectFilter } from '../filters/SelectFilter.js'
import { parseFilterValues } from './dispatchTable.js'

describe('Table.queryStringIdentifier', () => {
  it('round-trips into the resolved meta', async () => {
    const t = Table.make().columns([Column.make('id')]).queryStringIdentifier('orders')
    const meta = (await resolveSchema([t]))[0]!
    assert.equal(meta['queryStringIdentifier'], 'orders')
  })

  it('rejects empty / invalid identifiers at config time', () => {
    assert.throws(() => Table.make().queryStringIdentifier(''),  /invalid id/)
    assert.throws(() => Table.make().queryStringIdentifier('a b'), /invalid id/)
    assert.throws(() => Table.make().queryStringIdentifier('a/b'), /invalid id/)
  })

  it('parseTableQuery reads namespaced keys when prefix is set', () => {
    assert.deepEqual(parseTableQuery({
      orders_search:  '  hi  ',
      orders_sort:    'date:desc',
      orders_page:    '3',
      orders_perPage: '25',
      // Bare keys belong to some other table on the page — must not leak.
      search:         'noise',
      sort:           'noise:asc',
    }, 'orders'), {
      search:  'hi',
      sort:    { column: 'date', direction: 'desc' },
      page:    3,
      perPage: 25,
    })
  })

  it('parseFilterValues respects prefix + filter-name match', () => {
    const filters = [SelectFilter.make('status').options([
      { value: 'draft',     label: 'Draft' },
      { value: 'published', label: 'Published' },
    ])]
    const out = parseFilterValues({
      orders_status: 'draft',
      orders_other:  'ignored',  // not a registered filter
      status:        'noise',    // bare keys belong to another table
    }, filters, 'orders')
    assert.deepEqual(out, { status: 'draft' })
  })

  it('parseActiveGroup reads the prefixed ?<id>_group key', () => {
    const t = Table.make().columns([Column.make('status')]).defaultGroup('status')
    assert.equal(parseActiveGroup({ orders_group: 'status' }, t, 'orders'), 'status')
    // Bare ?group= no longer applies when prefix is set.
    assert.equal(parseActiveGroup({ group: 'status' }, t, 'orders'), 'status' /* falls through to defaultGroup */)
    assert.equal(parseActiveGroup({ orders_group: '' },    t, 'orders'), undefined)
  })

  it('two tables on one page parse independent prefixed slices', async () => {
    let ordersCtx:   Record<string, unknown> | null = null
    let invoicesCtx: Record<string, unknown> | null = null
    const orders = Table.make<{ id: string }>()
      .queryStringIdentifier('orders')
      .columns([Column.make('id')])
      .records(async (ctx) => { ordersCtx = { ...ctx }; return [] })
    const invoices = Table.make<{ id: string }>()
      .queryStringIdentifier('invoices')
      .columns([Column.make('id')])
      .records(async (ctx) => { invoicesCtx = { ...ctx }; return [] })

    await loadTableRecords([orders, invoices], {
      orders_search:    'pizza',
      orders_sort:      'date:desc',
      invoices_page:    '4',
      invoices_sort:    'amount:asc',
    })

    assert.equal((ordersCtx   as ElementMetaLike | null)?.['search'],  'pizza')
    assert.deepEqual((ordersCtx   as ElementMetaLike | null)?.['sort'],   { column: 'date',   direction: 'desc' })
    assert.equal((invoicesCtx as ElementMetaLike | null)?.['search'],  undefined)
    assert.deepEqual((invoicesCtx as ElementMetaLike | null)?.['sort'],   { column: 'amount', direction: 'asc' })
    assert.equal((invoicesCtx as ElementMetaLike | null)?.['page'],    4)
  })

  it('without prefix, bare keys still apply (back-compat)', async () => {
    let seen: Record<string, unknown> | null = null
    const t = Table.make<{ id: string }>()
      .columns([Column.make('id')])
      .records(async (ctx) => { seen = { ...ctx }; return [] })

    await loadTableRecords([t], { search: 'q', sort: 'name:asc', page: '2' })
    assert.equal((seen as ElementMetaLike | null)?.['search'], 'q')
    assert.deepEqual((seen as ElementMetaLike | null)?.['sort'], { column: 'name', direction: 'asc' })
    assert.equal((seen as ElementMetaLike | null)?.['page'], 2)
  })
})
