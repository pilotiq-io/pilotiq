import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Table } from '../elements/Table.js'
import { Column } from '../Column.js'
import { Sum, Average, Count, Range } from '../summarizers/Summarizer.js'
import { computeCrossPageSummaries } from './tableSummaries.js'
import type { ModelQuery } from './modelDefaults.js'

/** A stub query builder exposing only the scalar aggregate terminals the
 *  helper probes for. Records which (fn, column) pairs were asked for so we
 *  can assert dedup + that `count` never hits the builder. */
function fakeQuery(values: Partial<Record<'sum' | 'avg' | 'min' | 'max', number | null>>, calls: string[]) {
  const mk = (fn: 'sum' | 'avg' | 'min' | 'max') =>
    async (column: string): Promise<number | null> => {
      calls.push(`${fn}:${column}`)
      return values[fn] ?? null
    }
  return { sum: mk('sum'), avg: mk('avg'), min: mk('min'), max: mk('max') } as unknown as ModelQuery
}

describe('computeCrossPageSummaries', () => {
  it('returns undefined when no column has summarizers', async () => {
    const t = Table.make().columns([Column.make('id')])
    const out = await computeCrossPageSummaries(t, 10, () => fakeQuery({}, []))
    assert.equal(out, undefined)
  })

  it('returns undefined when the builder lacks scalar aggregates', async () => {
    const t = Table.make().columns([Column.make('amount').summarize([Sum.make()])])
    const bare = { where() { return bare } } as unknown as ModelQuery
    const out = await computeCrossPageSummaries(t, 10, () => bare)
    assert.equal(out, undefined)
  })

  it('runs the right aggregate per summarizer and renders the scalars', async () => {
    const calls: string[] = []
    const t = Table.make().columns([
      Column.make('amount').summarize([Sum.make().label('Total'), Average.make().label('Avg')]),
      Column.make('tax').summarize([Range.make()]),
    ])
    const out = await computeCrossPageSummaries(t, 50, () =>
      fakeQuery({ sum: 600, avg: 200, min: 5, max: 25 }, calls))

    assert.deepEqual(out!['amount'], [
      { kind: 'sum',     label: 'Total', value: '600' },
      { kind: 'average', label: 'Avg',   value: '200' },
    ])
    assert.deepEqual(out!['tax'], [{ kind: 'range', value: '5..25' }])
    assert.ok(calls.includes('sum:amount'))
    assert.ok(calls.includes('avg:amount'))
    assert.ok(calls.includes('min:tax'))
    assert.ok(calls.includes('max:tax'))
  })

  it('reuses the paginator total for Count without a builder query', async () => {
    const calls: string[] = []
    const t = Table.make().columns([Column.make('id').summarize([Count.make().label('Rows')])])
    const out = await computeCrossPageSummaries(t, 4000, () => fakeQuery({}, calls))
    assert.deepEqual(out!['id'], [{ kind: 'count', label: 'Rows', value: '4000' }])
    assert.equal(calls.length, 0)  // count never touches the builder
  })

  it('dedups the same aggregate fn across a column\'s summarizers', async () => {
    const calls: string[] = []
    const t = Table.make().columns([
      Column.make('amount').summarize([Sum.make().label('A'), Sum.make().label('B')]),
    ])
    await computeCrossPageSummaries(t, 1, () => fakeQuery({ sum: 10 }, calls))
    assert.deepEqual(calls.filter(c => c === 'sum:amount'), ['sum:amount'])  // one query, not two
  })

  it('omits a column whose aggregate throws (per-column fallback)', async () => {
    const t = Table.make().columns([
      Column.make('amount').summarize([Sum.make()]),
      Column.make('virtual').summarize([Sum.make()]),
    ])
    const makeScoped = () => {
      const q = {
        sum: async (col: string): Promise<number> => {
          if (col === 'virtual') throw new Error('no such column')
          return 600
        },
        avg: async () => null, min: async () => null, max: async () => null,
      } as unknown as ModelQuery
      return q
    }
    const out = await computeCrossPageSummaries(t, 5, makeScoped)
    assert.deepEqual(out!['amount'], [{ kind: 'sum', value: '600' }])
    assert.equal(out!['virtual'], undefined)  // dropped → dispatcher fills per-page
  })
})
