import '../../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../__test__/renderWithProviders.js'
import { renderField } from './renderField.js'
import type { ElementMeta } from '../../../schema/Element.js'

// Phase 1c — the field-type dispatch switch. `renderField(el, i, renderElement)`
// maps `el.fieldType` to the matching input component (wrapped in FieldShell,
// except `hidden` which renders bare). We assert each branch mounts the
// right control rather than re-testing each input's behavior (covered in
// the per-input files).

function render(el: ElementMeta) {
  return renderWithProviders(<>{renderField(el, 0, () => null)}</>, { withoutFormState: true })
}

describe('renderField dispatch', () => {
  it('renders a text field as a labelled textbox', () => {
    render({ type: 'field', fieldType: 'text', name: 'title', label: 'Title' })
    assert.ok(screen.getByRole('textbox'))
    assert.ok(screen.getByText('Title'))
  })

  it('renders toggleButtons as a radiogroup of pills', () => {
    render({
      type: 'field', fieldType: 'toggleButtons', name: 'status', label: 'Status',
      options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }],
    })
    assert.ok(screen.getByRole('radiogroup'))
    assert.ok(screen.getByRole('radio', { name: 'Draft' }))
  })

  it('renders checkboxList as checkbox options', () => {
    render({
      type: 'field', fieldType: 'checkboxList', name: 'tags', label: 'Tags',
      options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }],
    })
    assert.ok(screen.getByRole('checkbox', { name: 'Alpha' }))
    assert.ok(screen.getByRole('checkbox', { name: 'Beta' }))
  })

  it('renders markdown as a Write/Preview editor', () => {
    render({ type: 'field', fieldType: 'markdown', name: 'body', label: 'Body' })
    assert.ok(screen.getByRole('button', { name: 'Write' }))
    assert.ok(screen.getByRole('button', { name: 'Preview' }))
  })

  it('renders a hidden field bare — no shell label', () => {
    const { container } = render({ type: 'field', fieldType: 'hidden', name: 'secret', defaultValue: 'x' })
    const input = container.querySelector('input[type="hidden"][name="secret"]') as HTMLInputElement
    assert.ok(input)
    assert.equal(input.value, 'x')
    assert.equal(screen.queryByText('secret'), null) // no label chrome
  })
})
