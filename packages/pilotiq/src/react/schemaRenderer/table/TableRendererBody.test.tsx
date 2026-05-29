import '../../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../../../__test__/renderWithProviders.js'
import { fakeTableMeta, fakeColumnMeta, fakeRecord, noopTableDeps } from '../../../__test__/fakes.js'
import { TableRendererBody } from './TableRendererBody.js'
import type { ElementMeta } from '../../../schema/Element.js'

// Phase 2 — the most complex renderer. This file held 4 of the 14 rules-of-hooks
// bugs fixed earlier, so it earns priority. Render the body directly with a fake
// table meta + no-op deps; no FormStateProvider needed.

function render(el: ElementMeta) {
  return renderWithProviders(
    <TableRendererBody el={el} deps={noopTableDeps()} />,
    { withoutFormState: true },
  )
}

const COLS = [fakeColumnMeta('title', { sortable: true }), fakeColumnMeta('author')]

describe('TableRendererBody', () => {
  it('shows a guard message when no columns are configured', () => {
    render(fakeTableMeta([], []))
    assert.ok(screen.getByText('No columns configured for this table.'))
  })

  it('renders column headers and row cells', () => {
    render(fakeTableMeta(COLS, [
      fakeRecord({ title: 'Hello world', author: 'Sam' }),
      fakeRecord({ id: 2, title: 'Second post', author: 'Lee' }),
    ]))
    assert.ok(screen.getByText('Title'))
    assert.ok(screen.getByText('Author'))
    assert.ok(screen.getByText('Hello world'))
    assert.ok(screen.getByText('Sam'))
    assert.ok(screen.getByText('Second post'))
  })

  it('shows the empty state when there are no rows', () => {
    render(fakeTableMeta(COLS, []))
    assert.ok(screen.getByText('No records yet'))
  })

  it('shows the filtered empty state when a search is active', () => {
    render(fakeTableMeta(COLS, [], { search: 'zzz' }))
    assert.ok(screen.getByText('No matching records'))
  })

  it('renders a sortable header as a link carrying the sort query', () => {
    render(fakeTableMeta(COLS, [fakeRecord({ title: 'A', author: 'B' })]))
    // The sortable "Title" header is an <a href> with a sort param; the plain
    // "Author" header is not a link.
    const titleLink = screen.getByRole('link', { name: /Title/ })
    assert.match(titleLink.getAttribute('href') ?? '', /sort=/)
    assert.equal(screen.queryByRole('link', { name: /Author/ }), null)
  })

  it('selects all rows from the header checkbox when bulk actions exist', async () => {
    const bulkAction = { type: 'action', name: 'delete', placement: 'bulk', label: 'Delete' }
    render(fakeTableMeta([...COLS, bulkAction], [
      fakeRecord({ title: 'A', author: 'X' }),
      fakeRecord({ id: 2, title: 'B', author: 'Y' }),
    ]))
    const user = userEvent.setup()

    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' })
    const row1 = screen.getByRole('checkbox', { name: 'Select row 1' })
    assert.equal(row1.getAttribute('aria-checked'), 'false')

    await user.click(selectAll)
    await waitFor(() => assert.equal(row1.getAttribute('aria-checked'), 'true'))
    assert.equal(screen.getByRole('checkbox', { name: 'Select row 2' }).getAttribute('aria-checked'), 'true')
  })

  it('toggles a single row without affecting select-all', async () => {
    const bulkAction = { type: 'action', name: 'delete', placement: 'bulk', label: 'Delete' }
    render(fakeTableMeta([...COLS, bulkAction], [
      fakeRecord({ title: 'A', author: 'X' }),
      fakeRecord({ id: 2, title: 'B', author: 'Y' }),
    ]))
    const user = userEvent.setup()
    const row1 = screen.getByRole('checkbox', { name: 'Select row 1' })

    await user.click(row1)
    await waitFor(() => assert.equal(row1.getAttribute('aria-checked'), 'true'))
    assert.equal(screen.getByRole('checkbox', { name: 'Select all rows' }).getAttribute('aria-checked'), 'false')
  })
})

// Phase 2b — group banding + collapse + pagination chrome. Rows arrive
// pre-grouped and pre-paginated from the server (`loadTableRecords`
// stamps `_groupValue`/`_groupTitle` and ships only the current page),
// so the renderer's job is to band, fold, and paint the page nav.

// Two Sam rows then one Lee row, each tagged with its resolved group
// title so the heading reads distinctly from the cell values.
const GROUPED_ROWS = [
  fakeRecord({ id: 1, title: 'A', author: 'Sam', _groupValue: 'sam', _groupTitle: 'Group Sam' }),
  fakeRecord({ id: 2, title: 'B', author: 'Sam', _groupValue: 'sam', _groupTitle: 'Group Sam' }),
  fakeRecord({ id: 3, title: 'C', author: 'Lee', _groupValue: 'lee', _groupTitle: 'Group Lee' }),
]

describe('TableRendererBody — grouping', () => {
  it('emits one heading row per contiguous group', () => {
    render(fakeTableMeta(COLS, GROUPED_ROWS, { defaultGroup: 'author' }))
    assert.ok(screen.getByText('Group Sam'))
    assert.ok(screen.getByText('Group Lee'))
  })

  it('collapses a group from its chevron, hiding only that group’s rows', async () => {
    render(fakeTableMeta(COLS, GROUPED_ROWS, {
      defaultGroup: 'author',
      groups: [{ column: 'author', label: 'Author', collapsible: true }],
    }))
    assert.ok(screen.getByText('A')) // Sam group row visible initially
    // Two groups → two "Collapse group" chevrons; fold the first (Sam).
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Collapse group' })[0]!)
    assert.equal(screen.queryByText('A'), null)       // Sam rows hidden
    assert.ok(screen.getByText('C'))                  // Lee group still expanded
    assert.ok(screen.getByRole('button', { name: 'Expand group' })) // folded chevron flipped
  })
})

describe('TableRendererBody — pagination', () => {
  it('shows the page indicator and only a Next link on the first page', () => {
    render(fakeTableMeta(COLS, [fakeRecord({ title: 'A', author: 'X' })], {
      perPage: 2, total: 5, currentPage: 1,
    }))
    assert.ok(screen.getByText(/Page 1 of 3 · 5 records/))
    assert.ok(screen.getByRole('link', { name: /Next/ }))
    assert.equal(screen.queryByRole('link', { name: /Previous/ }), null)
  })

  it('shows both Previous and Next links on a middle page', () => {
    render(fakeTableMeta(COLS, [fakeRecord({ title: 'A', author: 'X' })], {
      perPage: 2, total: 5, currentPage: 2,
    }))
    assert.ok(screen.getByRole('link', { name: /Previous/ }))
    assert.ok(screen.getByRole('link', { name: /Next/ }))
  })

  it('shows no pagination when everything fits on one page', () => {
    render(fakeTableMeta(COLS, [fakeRecord({ title: 'A', author: 'X' })], {
      perPage: 10, total: 1, currentPage: 1,
    }))
    assert.equal(screen.queryByText(/Page 1 of/), null)
  })
})
