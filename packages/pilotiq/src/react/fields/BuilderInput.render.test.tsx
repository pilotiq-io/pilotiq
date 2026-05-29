import '../../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { BuilderInput } from './BuilderInput.js'
import type { ElementMeta } from '../../schema/Element.js'

// Phase 3 — heterogeneous block field. Like Repeater but rows are typed by a
// "block" chosen from a picker. A single registered block adds directly; multiple
// blocks open a menu. Rows carry `data-pilotiq-builder-row`. No provider needed.
//
// `.render.test.tsx` so it doesn't collide with any future pure-logic test.

afterEach(cleanup)

const TEXT_CHILD: ElementMeta = { type: 'field', name: 'body', fieldType: 'text' }

function block(name: string, label: string) {
  return { name, label, template: [TEXT_CHILD] }
}

function builderMeta(
  blocks: Array<{ name: string; label: string; template: ElementMeta[] }>,
  rowTypes: string[],
  over: Record<string, unknown> = {},
): ElementMeta {
  return {
    type: 'field',
    fieldType: 'builder',
    name: 'content',
    blocks,
    rows: rowTypes.map((t, i) => ({ id: `b${i + 1}`, type: t, children: [TEXT_CHILD] })),
    ...over,
  }
}

function rowCount(c: HTMLElement): number {
  return c.querySelectorAll('[data-pilotiq-builder-row]').length
}

describe('BuilderInput', () => {
  it('renders one node per initial row', () => {
    const { container } = render(
      <BuilderInput el={builderMeta([block('text', 'Text')], ['text', 'text'])} name="content" disabled={false} />,
    )
    assert.equal(rowCount(container), 2)
  })

  it('shows the empty state with no rows', () => {
    render(<BuilderInput el={builderMeta([block('text', 'Text')], [])} name="content" disabled={false} />)
    assert.ok(screen.getByText(/No items yet/))
  })

  it('adds a row directly when only one block is registered', async () => {
    const { container } = render(
      <BuilderInput el={builderMeta([block('text', 'Text')], ['text'])} name="content" disabled={false} />,
    )
    assert.equal(rowCount(container), 1)
    await userEvent.setup().click(screen.getByRole('button', { name: /Add/ }))
    assert.equal(rowCount(container), 2)
  })

  it('adds a chosen block via the picker menu when multiple blocks exist', async () => {
    const { container } = render(
      <BuilderInput
        el={builderMeta([block('text', 'Text'), block('image', 'Image')], ['text'])}
        name="content"
        disabled={false}
      />,
    )
    const user = userEvent.setup()
    assert.equal(rowCount(container), 1)
    await user.click(screen.getByRole('button', { name: /Add/ }))            // open the picker menu
    await user.click(await screen.findByRole('menuitem', { name: 'Image' })) // choose a block
    assert.equal(rowCount(container), 2)
  })

  it('removes a row when its Remove button is clicked', async () => {
    const { container } = render(
      <BuilderInput el={builderMeta([block('text', 'Text')], ['text', 'text'])} name="content" disabled={false} />,
    )
    assert.equal(rowCount(container), 2)
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Remove row' })[0]!)
    assert.equal(rowCount(container), 1)
  })
})

// Phase 3b — Builder shares the Repeater row-chrome surface: clone,
// collapse, and item-label resolution. The header default differs —
// Builder labels a row by its block (e.g. "Text"), not "Item N".
describe('BuilderInput — row chrome', () => {
  it('clones a row when cloneable', async () => {
    const { container } = render(
      <BuilderInput
        el={builderMeta([block('text', 'Text')], ['text'], { cloneable: true })}
        name="content"
        disabled={false}
      />,
    )
    assert.equal(rowCount(container), 1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Duplicate row' }))
    assert.equal(rowCount(container), 2)
  })

  it('toggles a row open/collapsed via the chevron', async () => {
    render(
      <BuilderInput
        el={builderMeta([block('text', 'Text')], ['text'], { collapsible: true })}
        name="content"
        disabled={false}
      />,
    )
    const collapse = screen.getByRole('button', { name: 'Collapse' })
    assert.equal(collapse.getAttribute('aria-expanded'), 'true')
    await userEvent.setup().click(collapse)
    assert.equal(screen.getByRole('button', { name: 'Expand' }).getAttribute('aria-expanded'), 'false')
  })

  it('uses the resolved itemLabel, falling back to the block label', () => {
    const meta: ElementMeta = {
      type: 'field',
      fieldType: 'builder',
      name: 'content',
      blocks: [block('text', 'Text')],
      rows: [
        { id: 'b1', type: 'text', children: [TEXT_CHILD], itemLabel: 'Intro paragraph' },
        { id: 'b2', type: 'text', children: [TEXT_CHILD] },
      ],
    }
    render(<BuilderInput el={meta} name="content" disabled={false} />)
    assert.ok(screen.getByText('Intro paragraph'))
    assert.ok(screen.getByText('Text')) // no itemLabel → block label
  })
})
