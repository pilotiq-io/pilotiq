import '../../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../__test__/renderWithProviders.js'
import { fakeTableMeta, fakeColumnMeta, fakeRecord, noopTableDeps, installFetch } from '../../../__test__/fakes.js'
import { TableRenderer } from './TableRenderer.js'
import type { ElementMeta } from '../../../schema/Element.js'

// Phase 2b — the deferred-load shell (`Resource.deferLoading = true`).
// On mount it paints a skeleton, fetches the real rows from `tableUrl`,
// then swaps in `TableRendererBody`. We stub the global `fetch` and
// assert the skeleton-first → body / error transitions.

const COLS = [fakeColumnMeta('title'), fakeColumnMeta('author')]

function render(el: ElementMeta) {
  return renderWithProviders(
    <TableRenderer el={el} deps={noopTableDeps()} />,
    { withoutFormState: true },
  )
}

const DEFERRED: ElementMeta = {
  type: 'table',
  deferred: true,
  tableUrl: '/admin/articles/_table',
  heading: 'Articles',
  children: COLS,
}

describe('TableRenderer (deferred)', () => {
  it('paints a skeleton first, then renders the fetched rows', async () => {
    const loaded = fakeTableMeta(COLS, [fakeRecord({ title: 'Hello world', author: 'Sam' })])
    const fetchStub = installFetch(() => ({ status: 200, json: { ok: true, tables: [loaded] } }))
    try {
      render(DEFERRED)
      // Skeleton-first: the row content isn't present synchronously.
      assert.equal(screen.queryByText('Hello world'), null)
      // After the fetch resolves, the body renders the real rows.
      assert.ok(await screen.findByText('Hello world'))
      assert.ok(fetchStub.calls.some(c => c.url.startsWith('/admin/articles/_table')))
    } finally {
      fetchStub.restore()
    }
  })

  it('shows an error banner when the deferred fetch fails', async () => {
    const fetchStub = installFetch(() => ({ status: 200, json: { ok: false, error: 'boom' } }))
    try {
      render(DEFERRED)
      assert.ok(await screen.findByText(/Failed to load table: boom/))
    } finally {
      fetchStub.restore()
    }
  })

  it('renders the body directly when not deferred', () => {
    const fetchStub = installFetch(() => ({ status: 200, json: { ok: true, tables: [] } }))
    try {
      render(fakeTableMeta(COLS, [fakeRecord({ title: 'Direct row', author: 'Sam' })]))
      assert.ok(screen.getByText('Direct row'))
      assert.equal(fetchStub.calls.length, 0) // no deferred fetch fired
    } finally {
      fetchStub.restore()
    }
  })
})
