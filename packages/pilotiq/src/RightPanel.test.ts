import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Pilotiq } from './Pilotiq.js'
import { panelInfo } from './pageData.js'
import {
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  type RightPanelContribution,
} from './RightPanel.js'

// Renderer references aren't shipped over the wire — so any callable
// stand-in works for tests that only inspect meta.
const noopBody = (() => null) as unknown as RightPanelContribution['render']

describe('Pilotiq.rightPanel — registration + validation', () => {
  it('registers a single contribution and exposes it via getRightPanels', () => {
    const panel = Pilotiq.make('T').rightPanel({ id: 'a', render: noopBody })
    assert.equal(panel.getRightPanels().length, 1)
    assert.equal(panel.getRightPanels()[0]?.id, 'a')
  })

  it('rightPanels([…]) registers each in array order', () => {
    const panel = Pilotiq.make('T').rightPanels([
      { id: 'one', render: noopBody },
      { id: 'two', render: noopBody },
      { id: 'three', render: noopBody },
    ])
    assert.deepEqual(panel.getRightPanels().map((c) => c.id), ['one', 'two', 'three'])
  })

  it('rejects duplicate ids at boot', () => {
    const panel = Pilotiq.make('T').rightPanel({ id: 'dup', render: noopBody })
    assert.throws(
      () => panel.rightPanel({ id: 'dup', render: noopBody }),
      /already registered/,
    )
  })

  it('rejects empty / non-string / pattern-violating ids', () => {
    assert.throws(
      () => Pilotiq.make('T').rightPanel({ id: '', render: noopBody }),
      /missing an id/,
    )
    assert.throws(
      () => Pilotiq.make('T').rightPanel({ id: 'has spaces', render: noopBody }),
      /contains characters outside/,
    )
    assert.throws(
      () => Pilotiq.make('T').rightPanel({ id: 'tab/strip', render: noopBody }),
      /contains characters outside/,
    )
  })

  it('rejects defaultWidth outside the [min, max] range', () => {
    assert.throws(
      () => Pilotiq.make('T').rightPanel({ id: 'a', render: noopBody, defaultWidth: 100 }),
      /defaultWidth=100 outside/,
    )
    assert.throws(
      () => Pilotiq.make('T').rightPanel({ id: 'a', render: noopBody, defaultWidth: 1200 }),
      /defaultWidth=1200 outside/,
    )
  })

  it('accepts the boundary widths', () => {
    assert.doesNotThrow(() => Pilotiq.make('T').rightPanel({
      id: 'min', render: noopBody, defaultWidth: RIGHT_PANEL_MIN_WIDTH,
    }))
    assert.doesNotThrow(() => Pilotiq.make('T').rightPanel({
      id: 'max', render: noopBody, defaultWidth: RIGHT_PANEL_MAX_WIDTH,
    }))
  })

  it('rejects a missing render component', () => {
    assert.throws(
      () => Pilotiq.make('T').rightPanel({ id: 'a' } as unknown as RightPanelContribution),
      /missing a `render`/,
    )
  })
})

describe('panelInfo() — RightSidebar meta (sparse + sorted + gated)', () => {
  it('omits rightSidebar when no contributions are registered', async () => {
    const info = await panelInfo(Pilotiq.make('T'))
    assert.equal((info as { rightSidebar?: unknown }).rightSidebar, undefined)
  })

  it('ships sparse panel-level baseline width when contributions are present', async () => {
    const panel = Pilotiq.make('T').rightPanel({ id: 'a', label: 'Pane A', render: noopBody })
    const info = await panelInfo(panel)
    const rs = (info as { rightSidebar?: { panels: unknown[]; defaultWidth: number; minWidth: number; maxWidth: number } }).rightSidebar
    assert.ok(rs)
    assert.equal(rs.panels.length, 1)
    assert.equal(rs.minWidth, RIGHT_PANEL_MIN_WIDTH)
    assert.equal(rs.maxWidth, RIGHT_PANEL_MAX_WIDTH)
    assert.equal(rs.defaultWidth, RIGHT_PANEL_DEFAULT_WIDTH)
  })

  it('per-contribution defaultWidth rolls into RightPanelMeta.defaultWidth', async () => {
    const panel = Pilotiq.make('T').rightPanel({
      id: 'narrow', render: noopBody, defaultWidth: 280,
    })
    const info = await panelInfo(panel)
    const rs = (info as { rightSidebar?: { panels: { defaultWidth: number }[]; defaultWidth: number } }).rightSidebar!
    assert.equal(rs.panels[0]?.defaultWidth, 280)
    // sidebar-level default rolls up from the first contribution's value
    assert.equal(rs.defaultWidth, 280)
  })

  it('label defaults to id when absent', async () => {
    const panel = Pilotiq.make('T').rightPanel({ id: 'unnamed', render: noopBody })
    const info = await panelInfo(panel)
    const rs = (info as { rightSidebar?: { panels: { id: string; label: string }[] } }).rightSidebar!
    assert.equal(rs.panels[0]?.label, 'unnamed')
  })

  it('sorts contributions by `sort` ascending; registration order ties', async () => {
    const panel = Pilotiq.make('T').rightPanels([
      { id: 'd', render: noopBody, sort: 50 },   // earliest sort → first
      { id: 'a', render: noopBody },              // default 100, registered 2nd
      { id: 'b', render: noopBody },              // default 100, registered 3rd
      { id: 'c', render: noopBody, sort: 25 },   // earliest sort → first overall
    ])
    const info = await panelInfo(panel)
    const ids = (info as { rightSidebar: { panels: { id: string }[] } }).rightSidebar.panels.map((p) => p.id)
    assert.deepEqual(ids, ['c', 'd', 'a', 'b'])
  })

  it('canAccess gate drops contributions when the predicate returns false', async () => {
    const panel = Pilotiq.make('T').rightPanels([
      { id: 'public',   render: noopBody },
      { id: 'admin',    render: noopBody, canAccess: () => false },
    ])
    const info = await panelInfo(panel)
    const rs = (info as { rightSidebar: { panels: { id: string }[] } }).rightSidebar
    assert.deepEqual(rs.panels.map((p) => p.id), ['public'])
  })

  it('canAccess can be async and is awaited', async () => {
    const panel = Pilotiq.make('T').rightPanels([
      { id: 'maybe', render: noopBody, canAccess: async () => true },
      { id: 'no',    render: noopBody, canAccess: async () => false },
    ])
    const info = await panelInfo(panel)
    const ids = (info as { rightSidebar: { panels: { id: string }[] } }).rightSidebar.panels.map((p) => p.id)
    assert.deepEqual(ids, ['maybe'])
  })

  it('throwing canAccess fails closed without taking down siblings', async () => {
    const orig = console.warn
    const swallowed: unknown[] = []
    console.warn = (...args: unknown[]) => { swallowed.push(args) }
    try {
      const panel = Pilotiq.make('T').rightPanels([
        { id: 'flaky',  render: noopBody, canAccess: () => { throw new Error('boom') } },
        { id: 'survivor', render: noopBody },
      ])
      const info = await panelInfo(panel)
      const ids = (info as { rightSidebar: { panels: { id: string }[] } }).rightSidebar.panels.map((p) => p.id)
      assert.deepEqual(ids, ['survivor'])
      assert.ok(swallowed.length === 1, 'one warn emitted')
    } finally {
      console.warn = orig
    }
  })

  it('returns null rightSidebar when every contribution is gated out', async () => {
    const panel = Pilotiq.make('T').rightPanels([
      { id: 'a', render: noopBody, canAccess: () => false },
      { id: 'b', render: noopBody, canAccess: () => false },
    ])
    const info = await panelInfo(panel)
    assert.equal((info as { rightSidebar?: unknown }).rightSidebar, undefined)
  })

  it('returns null rightSidebar when every contribution is hidden', async () => {
    const panel = Pilotiq.make('T').rightPanels([
      { id: 'a', render: noopBody, hidden: true },
      { id: 'b', render: noopBody, hidden: true },
    ])
    const info = await panelInfo(panel)
    assert.equal((info as { rightSidebar?: unknown }).rightSidebar, undefined)
  })

  it('hidden contributions are dropped from the tab strip but visible neighbours stay', async () => {
    const panel = Pilotiq.make('T').rightPanels([
      { id: 'visible', render: noopBody },
      { id: 'silent',  render: noopBody, hidden: true },
    ])
    const info = await panelInfo(panel)
    const ids = (info as { rightSidebar: { panels: { id: string }[] } }).rightSidebar.panels.map((p) => p.id)
    assert.deepEqual(ids, ['visible'])
  })

  it('serializes a string-typed icon verbatim onto RightPanelMeta', async () => {
    const panel = Pilotiq.make('T').rightPanel({ id: 'a', icon: 'sparkles', render: noopBody })
    const info = await panelInfo(panel)
    const meta = (info as { rightSidebar: { panels: { icon?: unknown }[] } }).rightSidebar.panels[0]!
    assert.equal(meta.icon, 'sparkles')
  })
})
