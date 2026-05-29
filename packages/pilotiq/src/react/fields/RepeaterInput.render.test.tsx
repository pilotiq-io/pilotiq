import '../../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { RepeaterInput } from './RepeaterInput.js'
import type { ElementMeta } from '../../schema/Element.js'

// Phase 3 — array-row field. The most complex form input: add / remove rows,
// min/max gating, empty state. Rows are local React state (inner leaves are
// dotted-path, always uncontrolled), so no FormStateProvider is needed. Each
// row carries a `data-pilotiq-repeater-row` attribute — count those for rows.

// Named `.render.test.tsx` so it doesn't collide with the pure-logic
// `RepeaterInput.test.ts` (same basename would clobber in dist-test/).

afterEach(cleanup)

const TEXT_CHILD: ElementMeta = { type: 'field', name: 'label', fieldType: 'text' }

function repeaterMeta(rowCount: number, over: Record<string, unknown> = {}): ElementMeta {
  return {
    type: 'field',
    fieldType: 'repeater',
    name: 'items',
    template: [TEXT_CHILD],
    rows: Array.from({ length: rowCount }, (_, i) => ({
      id: `r${i + 1}`,
      children: [TEXT_CHILD],
    })),
    ...over,
  }
}

function rowCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-pilotiq-repeater-row]').length
}

// Each row stamps a hidden `<name>.<i>.__id` input whose value is the
// stable row id. Reading them in DOM order is the robust way to assert
// reorder + clone outcomes — the visible "Item N" header is positional
// and so unchanged by a move.
function idOrder(container: HTMLElement): string[] {
  return [...container.querySelectorAll('input[name$=".__id"]')].map(
    el => (el as HTMLInputElement).value,
  )
}

describe('RepeaterInput', () => {
  it('renders one node per initial row', () => {
    const { container } = render(<RepeaterInput el={repeaterMeta(2)} name="items" disabled={false} />)
    assert.equal(rowCount(container), 2)
  })

  it('shows the empty state with no rows', () => {
    render(<RepeaterInput el={repeaterMeta(0)} name="items" disabled={false} />)
    assert.ok(screen.getByText(/No items yet/))
  })

  it('adds a row when the Add button is clicked', async () => {
    const { container } = render(<RepeaterInput el={repeaterMeta(1)} name="items" disabled={false} />)
    assert.equal(rowCount(container), 1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }))
    assert.equal(rowCount(container), 2)
  })

  it('removes a row when its Remove button is clicked', async () => {
    const { container } = render(<RepeaterInput el={repeaterMeta(2)} name="items" disabled={false} />)
    assert.equal(rowCount(container), 2)
    const removeButtons = screen.getAllByRole('button', { name: 'Remove row' })
    await userEvent.setup().click(removeButtons[0]!)
    assert.equal(rowCount(container), 1)
  })

  it('disables the Add button at maxItems', () => {
    render(<RepeaterInput el={repeaterMeta(2, { maxItems: 2 })} name="items" disabled={false} />)
    assert.equal((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled, true)
  })

  it('disables the Remove button at minItems', () => {
    render(<RepeaterInput el={repeaterMeta(1, { minItems: 1 })} name="items" disabled={false} />)
    assert.equal((screen.getByRole('button', { name: 'Remove row' }) as HTMLButtonElement).disabled, true)
  })
})

// Phase 3b — the rest of the row chrome: clone, collapse/accordion,
// item-label resolution, and the Up/Down reorder fallback. (The grip
// drag itself is @dnd-kit pointer-driven; the pure `reorderRows` helper
// is unit-tested in RepeaterInput.test.ts, so here we exercise the
// keyboard-accessible Move buttons that share it.)
describe('RepeaterInput — row chrome', () => {
  it('clones a row directly below it when cloneable', async () => {
    const { container } = render(
      <RepeaterInput el={repeaterMeta(1, { cloneable: true })} name="items" disabled={false} />,
    )
    assert.equal(rowCount(container), 1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Duplicate row' }))
    assert.equal(rowCount(container), 2)
  })

  it('does not clone past maxItems', () => {
    render(<RepeaterInput el={repeaterMeta(2, { cloneable: true, maxItems: 2 })} name="items" disabled={false} />)
    const cloneButtons = screen.getAllByRole('button', { name: 'Duplicate row' }) as HTMLButtonElement[]
    assert.ok(cloneButtons.every(b => b.disabled))
  })

  it('toggles a row open/collapsed via the chevron', async () => {
    render(<RepeaterInput el={repeaterMeta(1, { collapsible: true })} name="items" disabled={false} />)
    // Open initially → chevron offers "Collapse" with aria-expanded=true.
    const collapse = screen.getByRole('button', { name: 'Collapse' })
    assert.equal(collapse.getAttribute('aria-expanded'), 'true')
    await userEvent.setup().click(collapse)
    // Now collapsed → chevron offers "Expand", aria-expanded=false.
    const expand = screen.getByRole('button', { name: 'Expand' })
    assert.equal(expand.getAttribute('aria-expanded'), 'false')
  })

  it('keeps only one row open at a time in accordion mode', async () => {
    render(
      <RepeaterInput el={repeaterMeta(2, { collapsible: true, accordion: true })} name="items" disabled={false} />,
    )
    // Default opens the first visible row: one "Collapse", one "Expand".
    assert.equal(screen.getAllByRole('button', { name: 'Collapse' }).length, 1)
    assert.equal(screen.getAllByRole('button', { name: 'Expand' }).length, 1)
    // Open the second row → the first collapses (still exactly one open).
    await userEvent.setup().click(screen.getByRole('button', { name: 'Expand' }))
    assert.equal(screen.getAllByRole('button', { name: 'Collapse' }).length, 1)
    assert.equal(screen.getAllByRole('button', { name: 'Expand' }).length, 1)
  })

  it('uses the resolved itemLabel for the row header, falling back to "Item N"', () => {
    const meta: ElementMeta = {
      type: 'field',
      fieldType: 'repeater',
      name: 'items',
      template: [TEXT_CHILD],
      rows: [
        { id: 'r1', children: [TEXT_CHILD], itemLabel: 'First item' },
        { id: 'r2', children: [TEXT_CHILD] },
      ],
    }
    render(<RepeaterInput el={meta} name="items" disabled={false} />)
    assert.ok(screen.getByText('First item'))
    assert.ok(screen.getByText('Item 2')) // no itemLabel → positional default
  })

  it('moves a row down via the Move down button', async () => {
    const { container } = render(
      <RepeaterInput el={repeaterMeta(2, { reorderable: true })} name="items" disabled={false} />,
    )
    assert.deepEqual(idOrder(container), ['r1', 'r2'])
    // First row's Move down is enabled (it isn't the last visible row).
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Move down' })[0]!)
    assert.deepEqual(idOrder(container), ['r2', 'r1'])
  })
})
