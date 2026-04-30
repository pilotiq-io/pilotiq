import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Table } from './Table.js'
import { Column } from '../Column.js'
import { Section } from '../schema/Section.js'
import { resolveSchema } from '../schema/resolveSchema.js'
import {
  parseTableQuery,
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
})
