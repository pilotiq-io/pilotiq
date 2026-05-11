import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Chart } from './Chart.js'
import { CHART_TYPES } from './types.js'

describe('Chart fluent surface', () => {
  it('emits type=chart with sensible defaults', () => {
    const chart = Chart.make('basic')
    const meta = chart.toMeta()
    assert.equal(meta['type'], 'chart')
    assert.equal(meta['chartType'], 'line')
    assert.equal(meta['label'], undefined)
    assert.equal(meta['color'], undefined)
    assert.equal(meta['maxHeight'], undefined)
    assert.equal(meta['options'], undefined)
    assert.equal(meta['filters'], undefined)
    assert.equal(meta['defaultFilter'], undefined)
  })

  it('default id is "Chart" when no id passed', () => {
    const chart = Chart.make()
    assert.equal(chart.getId(), 'Chart')
  })

  it('explicit id wins', () => {
    const chart = Chart.make('orders-per-day')
    assert.equal(chart.getId(), 'orders-per-day')
  })

  it('persists fluent surface onto meta', () => {
    const meta = Chart.make('posts')
      .label('Posts per day')
      .type('bar')
      .color('primary')
      .maxHeight(420)
      .options({ strokeWidth: 3 })
      .filters({ today: 'Today', week: 'Last 7 days' })
      .defaultFilter('week')
      .toMeta()
    assert.equal(meta['chartType'], 'bar')
    assert.equal(meta['label'], 'Posts per day')
    assert.equal(meta['color'], 'primary')
    assert.equal(meta['maxHeight'], 420)
    assert.deepEqual(meta['options'], { strokeWidth: 3 })
    assert.deepEqual(meta['filters'], { today: 'Today', week: 'Last 7 days' })
    assert.equal(meta['defaultFilter'], 'week')
  })

  it('rejects unknown chart types at .type() call', () => {
    assert.throws(
      () => Chart.make('x').type('treemap' as never),
      /unknown chart type "treemap"/,
    )
  })

  it('accepts every type in the whitelist', () => {
    for (const t of CHART_TYPES) {
      const meta = Chart.make('x').type(t).toMeta()
      assert.equal(meta['chartType'], t)
    }
  })

  it('ignores non-finite + non-positive maxHeight values', () => {
    const a = Chart.make('a').maxHeight(0).toMeta()
    const b = Chart.make('b').maxHeight(-5).toMeta()
    const c = Chart.make('c').maxHeight(Number.NaN).toMeta()
    assert.equal(a['maxHeight'], undefined)
    assert.equal(b['maxHeight'], undefined)
    assert.equal(c['maxHeight'], undefined)
  })

  it('lazy default is true (inherited from ServerDataElement)', () => {
    const chart = Chart.make('q')
    assert.equal(chart.isLazy(), true)
  })

  it('lazy(false) opts out', () => {
    const chart = Chart.make('q').lazy(false)
    assert.equal(chart.isLazy(), false)
  })

  it('poll(seconds) is set when finite + positive', () => {
    const chart = Chart.make('q').poll(30)
    assert.equal(chart.getPoll(), 30)
  })

  it('poll(0) and poll(-1) are ignored', () => {
    const chart = Chart.make('q').poll(0).poll(-1)
    assert.equal(chart.getPoll(), undefined)
  })
})

describe('Chart.resolveServerData', () => {
  it('returns empty data when no hook configured', async () => {
    const ctx = { mode: 'view' as const }
    const data = await Chart.make('q').resolveServerData(ctx)
    assert.deepEqual(data, { labels: [], datasets: [] })
  })

  it('runs the fluent getData hook', async () => {
    const data = await Chart.make('q')
      .getData(async () => ({
        labels:   ['Jan', 'Feb'],
        datasets: [{ label: 'Posts', data: [1, 2] }],
      }))
      .resolveServerData({ mode: 'view' as const })
    assert.deepEqual(data.labels, ['Jan', 'Feb'])
    assert.equal(data.datasets[0]?.label, 'Posts')
  })

  it('threads ctx.filter to the hook', async () => {
    const seen: string[] = []
    await Chart.make('q')
      .getData((ctx) => {
        seen.push(ctx.filter ?? '<unset>')
        return { labels: [], datasets: [] }
      })
      .resolveServerData({ mode: 'view' as const, filter: 'today' })
    assert.deepEqual(seen, ['today'])
  })

  it('falls back to defaultFilter when ctx.filter is unset', async () => {
    const seen: string[] = []
    await Chart.make('q')
      .defaultFilter('week')
      .getData((ctx) => {
        seen.push(ctx.filter ?? '<unset>')
        return { labels: [], datasets: [] }
      })
      .resolveServerData({ mode: 'view' as const })
    assert.deepEqual(seen, ['week'])
  })

  it('subclass-form static getData runs when no instance hook', async () => {
    class Posts extends Chart {
      static override label = 'Posts'
      static override type = 'line' as const
      static override async getData() {
        return { labels: ['M'], datasets: [{ label: 'Posts', data: [1] }] }
      }
    }
    const data = await Posts.make().resolveServerData({ mode: 'view' as const })
    assert.deepEqual(data.labels, ['M'])
  })

  it('instance hook overrides subclass-form static', async () => {
    class Posts extends Chart {
      static override async getData() {
        return { labels: ['static'], datasets: [{ label: 'a', data: [1] }] }
      }
    }
    const data = await Posts.make()
      .getData(async () => ({ labels: ['instance'], datasets: [{ label: 'b', data: [2] }] }))
      .resolveServerData({ mode: 'view' as const })
    assert.deepEqual(data.labels, ['instance'])
  })
})

describe('Chart subclass-form statics', () => {
  it('reads chartType / label / color / maxHeight from statics', () => {
    class Posts extends Chart {
      static override type = 'doughnut' as const
      static override label    = 'Posts by category'
      static override color    = 'success' as const
      static override maxHeight = 280
    }
    const meta = Posts.make().toMeta()
    assert.equal(meta['chartType'], 'doughnut')
    assert.equal(meta['label'], 'Posts by category')
    assert.equal(meta['color'], 'success')
    assert.equal(meta['maxHeight'], 280)
  })

  it('falls back to class name as id when no explicit id', () => {
    class TopAuthors extends Chart {}
    assert.equal(TopAuthors.make().getId(), 'TopAuthors')
  })

  it('instance setter overrides static', () => {
    class Posts extends Chart {
      static override label = 'static label'
    }
    const meta = Posts.make().label('instance label').toMeta()
    assert.equal(meta['label'], 'instance label')
  })
})
