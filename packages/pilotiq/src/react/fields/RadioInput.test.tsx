import '../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta } from '../../__test__/fakes.js'
import { RadioInput } from './RadioInput.js'

// Phase 1b — single-choice field rendered as native radios + a hidden mirror
// carrying the selected value.
const OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
]
function hidden(c: HTMLElement, name = 'status') {
  return c.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement
}

describe('RadioInput', () => {
  it('selects an option on click and mirrors it to the hidden input (uncontrolled)', async () => {
    const { container } = renderWithProviders(
      <RadioInput name="status" defaultValue="draft" disabled={false} options={OPTIONS} inline={false} />,
      { withoutFormState: true },
    )
    const draft = screen.getByRole('radio', { name: 'Draft' }) as HTMLInputElement
    const published = screen.getByRole('radio', { name: 'Published' }) as HTMLInputElement
    assert.equal(draft.checked, true)
    assert.equal(hidden(container).value, 'draft')

    await userEvent.setup().click(published)
    assert.equal(published.checked, true)
    assert.equal(hidden(container).value, 'published')
  })

  it('reflects the controlled value from form state', () => {
    renderWithProviders(
      <RadioInput name="status" defaultValue="draft" disabled={false} options={OPTIONS} inline={false} />,
      { formMeta: fakeFormMeta([fakeFieldMeta('status', { defaultValue: 'published' })]) },
    )
    assert.equal((screen.getByRole('radio', { name: 'Published' }) as HTMLInputElement).checked, true)
  })
})
