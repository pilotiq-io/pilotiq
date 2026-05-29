import '../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta } from '../../__test__/fakes.js'
import { CheckboxInput } from './CheckboxInput.js'

// Phase 1b — boolean field input. Hidden `<input>` mirror carries 'true'/'false'
// for form submission; the visible Checkbox is controlled by form state when
// inside a provider, local state otherwise.
function hidden(c: HTMLElement, name = 'agree') {
  return c.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement
}

describe('CheckboxInput', () => {
  it('starts unchecked and toggles on click (uncontrolled)', async () => {
    const { container } = renderWithProviders(
      <CheckboxInput name="agree" defaultChecked={false} disabled={false} label="I agree" />,
      { withoutFormState: true },
    )
    const box = screen.getByRole('checkbox', { name: 'I agree' })
    assert.equal(box.getAttribute('aria-checked'), 'false')
    assert.equal(hidden(container).value, 'false')

    await userEvent.setup().click(box)
    assert.equal(box.getAttribute('aria-checked'), 'true')
    assert.equal(hidden(container).value, 'true')
  })

  it('reads its checked state from form state when controlled', () => {
    renderWithProviders(
      <CheckboxInput name="agree" defaultChecked={false} disabled={false} />,
      { formMeta: fakeFormMeta([fakeFieldMeta('agree', { defaultValue: true })]) },
    )
    // Controlled value (true) wins over the defaultChecked prop (false).
    assert.equal(screen.getByRole('checkbox').getAttribute('aria-checked'), 'true')
  })
})
