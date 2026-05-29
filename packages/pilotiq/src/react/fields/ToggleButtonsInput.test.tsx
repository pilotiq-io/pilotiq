import '../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta } from '../../__test__/fakes.js'
import { ToggleButtonsInput } from './ToggleButtonsInput.js'

// Phase 1c — single-choice segmented control. Same submission contract as
// RadioInput: a hidden input carries the active value; the pills are
// role=radio with aria-checked. Controlled inside a FormStateProvider,
// local state otherwise.
const OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
]
function hidden(c: HTMLElement, name = 'status') {
  return c.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement
}

describe('ToggleButtonsInput', () => {
  it('picks an option on click and mirrors it to the hidden input (uncontrolled)', async () => {
    const { container } = renderWithProviders(
      <ToggleButtonsInput name="status" defaultValue="draft" disabled={false} options={OPTIONS} />,
      { withoutFormState: true },
    )
    const published = screen.getByRole('radio', { name: 'Published' })
    assert.equal(screen.getByRole('radio', { name: 'Draft' }).getAttribute('aria-checked'), 'true')
    assert.equal(hidden(container).value, 'draft')

    await userEvent.setup().click(published)
    assert.equal(published.getAttribute('aria-checked'), 'true')
    assert.equal(hidden(container).value, 'published')
  })

  it('reflects the controlled value from form state', () => {
    renderWithProviders(
      <ToggleButtonsInput name="status" defaultValue="draft" disabled={false} options={OPTIONS} />,
      { formMeta: fakeFormMeta([fakeFieldMeta('status', { defaultValue: 'published' })]) },
    )
    assert.equal(screen.getByRole('radio', { name: 'Published' }).getAttribute('aria-checked'), 'true')
  })

  it('does not change selection when an option is disabled', async () => {
    const { container } = renderWithProviders(
      <ToggleButtonsInput
        name="status"
        defaultValue="draft"
        disabled={false}
        options={[{ value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived', disabled: true }]}
      />,
      { withoutFormState: true },
    )
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Archived' }))
    assert.equal(hidden(container).value, 'draft') // unchanged
  })
})
