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
