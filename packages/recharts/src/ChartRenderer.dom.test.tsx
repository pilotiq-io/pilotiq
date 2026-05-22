import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, cleanup, screen } from '@testing-library/react'

/**
 * Phase 6e proof-of-concept — render plain Recharts primitives via
 * React Testing Library against the jsdom DOM that `src/test/setup.ts`
 * boots. We mount `LineChart` / `PieChart` directly rather than the
 * full `ChartRenderer` (the latter depends on `useWidgetData` from
 * `@pilotiq/pilotiq/react`, which expects the host's widget-data
 * context — a separate pass plumbs that through). This proves the
 * recharts dependency tree actually mounts under jsdom + RTL, so
 * future tests that need to assert chart-specific markup have a
 * foothold.
 */
// Recharts'  needs explicit width/height when there's no
// parent ResponsiveContainer (jsdom doesn't run layout, so element
// dimensions are 0 by default). Each test passes explicit
// width / height to the chart constructor.
const SAMPLE_DATA = [
  { name: 'Jan', value: 100 },
  { name: 'Feb', value: 200 },
  { name: 'Mar', value: 150 },
]

describe('Recharts primitives (DOM)', () => {
  it('renders a LineChart with svg + lines', async () => {
    const { LineChart, Line, XAxis, YAxis } = await import('recharts')
    render(
      <LineChart width={400} height={200} data={SAMPLE_DATA}>
        <XAxis dataKey="name" />
        <YAxis />
        <Line type="monotone" dataKey="value" stroke="#8884d8" />
      </LineChart>,
    )
    try {
      const svg = document.querySelector('svg.recharts-surface')
      assert.ok(svg, 'recharts-surface svg mounted')
      // Recharts paints lines via `<path class="recharts-line">`.
      const line = document.querySelector('.recharts-line')
      assert.ok(line, 'line path mounted')
    } finally {
      cleanup()
    }
  })

  it('renders a PieChart that mounts the recharts-pie group', async () => {
    const { PieChart, Pie, Cell } = await import('recharts')
    render(
      <PieChart width={300} height={300}>
        <Pie
          data={SAMPLE_DATA}
          dataKey="value"
          nameKey="name"
          outerRadius={80}
          isAnimationActive={false}
        >
          {SAMPLE_DATA.map((_, i) => <Cell key={i} fill={`#${(i + 1) * 111}`} />)}
        </Pie>
      </PieChart>,
    )
    try {
      // Recharts pie slices are computed off layout measurements jsdom
      // can't provide (the geometry pass reads `getBBox` from the SVG
      // text-anchors). The slice paths therefore don't paint reliably
      // under jsdom — but the `<g class="recharts-pie">` wrapper does
      // mount, proving the chart traversed the component tree. Tests
      // that need per-slice geometry should run in a real browser.
      const pie = document.querySelector('.recharts-pie')
      assert.ok(pie, 'recharts-pie group mounted')
      const svg = document.querySelector('svg.recharts-surface')
      assert.ok(svg, 'recharts-surface svg mounted')
    } finally {
      cleanup()
    }
  })

  it('renders empty-data charts without throwing', async () => {
    const { BarChart, Bar } = await import('recharts')
    render(
      <BarChart width={300} height={200} data={[]}>
        <Bar dataKey="value" />
      </BarChart>,
    )
    try {
      // No data points → no `.recharts-rectangle` bars, but the svg
      // chrome (axes, grid) should still mount cleanly.
      const svg = document.querySelector('svg.recharts-surface')
      assert.ok(svg, 'svg still mounted on empty data')
      const bars = document.querySelectorAll('.recharts-rectangle')
      assert.equal(bars.length, 0, 'no bars for empty data')
    } finally {
      cleanup()
    }
  })

  it('RTL `screen` queries work against jsdom-rendered charts', async () => {
    const { BarChart, Bar, XAxis } = await import('recharts')
    render(
      <BarChart width={300} height={200} data={SAMPLE_DATA}>
        <XAxis dataKey="name" />
        <Bar dataKey="value" />
      </BarChart>,
    )
    try {
      // Recharts renders axis tick labels as `<text>` inside the svg.
      // `screen.getByText` traverses the rendered tree — this assertion
      // proves RTL queries cross the svg boundary correctly under jsdom.
      assert.ok(screen.getByText('Jan'))
      assert.ok(screen.getByText('Feb'))
      assert.ok(screen.getByText('Mar'))
    } finally {
      cleanup()
    }
  })
})
