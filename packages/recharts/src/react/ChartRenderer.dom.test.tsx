import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { WidgetDataProvider } from '@pilotiq/pilotiq/react'

import { ChartRenderer } from './ChartRenderer.js'
import type { ChartMeta } from '../types.js'

/**
 * Behavioral coverage for the full `ChartRenderer` mounted by
 * `registerChartRenderer()`. The neighbour `ChartRenderer.dom.test.tsx`
 * at `src/ChartRenderer.dom.test.tsx` exercises plain Recharts primitives
 * (LineChart / PieChart / BarChart) in isolation; this file proves the
 * pilotiq-side widget surface — `WidgetDataProvider` lookup, chart-type
 * dispatch, empty-state, error-sentinel — mounts cleanly under jsdom.
 *
 * Charts inside `<WidgetDataProvider>` skip the lazy mount-fetch (the
 * server-stamped initial payload is non-`null`), so no `fetch` shim is
 * needed for these tests.
 */
function chartMeta(opts: Partial<ChartMeta> & { id: string; chartType: ChartMeta['chartType'] }): ChartMeta {
  return {
    type: 'chart',
    ...opts,
  } as ChartMeta
}

describe('ChartRenderer (DOM)', () => {
  it('dispatches to the line-chart body when chartType is "line"', () => {
    // ResponsiveContainer under jsdom measures 0×0 (no layout pass +
    // our noop ResizeObserver), so the inner Recharts `svg` doesn't
    // paint. What we CAN assert is that the pilotiq-side chrome (card
    // wrapper, header label) mounts AND the `ChartUnsupported` branch
    // doesn't fire — i.e. the chartType dispatch arm reached the
    // LineChart view. Cheapest probe: the label appears AND the
    // unsupported-message string doesn't.
    const meta = chartMeta({ id: 'sales', chartType: 'line', label: 'Sales' })
    const { getByText } = render(
      <WidgetDataProvider data={{
        sales: {
          labels:   ['Jan', 'Feb', 'Mar'],
          datasets: [{ label: 'Revenue', data: [100, 200, 150] }],
        },
      }}>
        <ChartRenderer meta={meta} />
      </WidgetDataProvider>,
    )
    try {
      assert.ok(getByText('Sales'), 'card label visible')
      assert.equal(
        document.body.textContent?.includes('is not yet supported'),
        false,
        'chartType dispatched to a supported branch, not ChartUnsupported',
      )
    } finally {
      cleanup()
    }
  })

  it('paints the empty state when no datasets land', () => {
    // Server stamped `_widgetData[id] = { labels: [], datasets: [] }`
    // (or an upstream resolver returned a sparse payload). Renderer
    // short-circuits before mounting Recharts and shows the "No data"
    // string instead of an empty chart surface — saves a layout pass
    // and reads correctly to the user.
    const meta = chartMeta({ id: 'empty', chartType: 'bar' })
    const { getByText } = render(
      <WidgetDataProvider data={{ empty: { labels: [], datasets: [] } }}>
        <ChartRenderer meta={meta} />
      </WidgetDataProvider>,
    )
    try {
      assert.ok(getByText('No data'), 'empty state visible')
      assert.equal(
        document.querySelector('svg.recharts-surface'),
        null,
        'no recharts svg mounted on empty data',
      )
    } finally {
      cleanup()
    }
  })

  it('renders the error banner on the `{ error: "…" }` initial sentinel', () => {
    // When the server-side `getData` hook throws, the page-data builder
    // stamps `_widgetData[id] = { error: '<message>' }` instead of the
    // payload. The renderer treats this as a *recoverable* error: it
    // mounts the error banner but the refetch hook is still wired so
    // the user can re-trigger via the filter dropdown. The test only
    // asserts the banner — the refetch path is covered by the unit
    // tests on `useWidgetData`.
    const meta = chartMeta({ id: 'broken', chartType: 'line', label: 'Broken chart' })
    const { getByText } = render(
      <WidgetDataProvider data={{ broken: { error: 'boom' } }}>
        <ChartRenderer meta={meta} />
      </WidgetDataProvider>,
    )
    try {
      assert.ok(getByText(/Failed to load chart: boom/), 'error banner visible')
    } finally {
      cleanup()
    }
  })

  it('reports the chartType from `ChartUnsupported` when the dispatch falls through', () => {
    // Casting through `unknown` so TypeScript doesn't reject the
    // intentionally-invalid chartType at the call site — at runtime
    // the dispatch falls through every case and hits the unsupported
    // default. Catches a regression where a future `chartType` added
    // to the type union (but not the renderer's switch) would silently
    // render nothing instead of surfacing the missing branch.
    const meta = chartMeta({
      id:        'oops',
      chartType: 'radar' as unknown as ChartMeta['chartType'],
    })
    const { getByText } = render(
      <WidgetDataProvider data={{
        oops: {
          labels:   ['A'],
          datasets: [{ label: 'X', data: [1] }],
        },
      }}>
        <ChartRenderer meta={meta} />
      </WidgetDataProvider>,
    )
    try {
      assert.ok(
        getByText('radar'),
        'unsupported chartType is reported back to the user',
      )
    } finally {
      cleanup()
    }
  })
})
