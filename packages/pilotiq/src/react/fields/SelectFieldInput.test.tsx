import '../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta } from '../../__test__/fakes.js'
import { SelectFieldInput } from './SelectFieldInput.js'

// Phase 1b — single-select field. A hidden `<input>` mirror carries the chosen
// value for form submission; the visible trigger shows the selected label.
const OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
]
function hidden(c: HTMLElement, name = 'status') {
  return c.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement
}

function props(over: Partial<React.ComponentProps<typeof SelectFieldInput>> = {}) {
  return {
    name: 'status', defaultValue: undefined, disabled: false, required: false,
    placeholder: 'Select…', options: OPTIONS, fieldLabel: 'Status',
    createOption: undefined, ...over,
  } as React.ComponentProps<typeof SelectFieldInput>
}

describe('SelectFieldInput', () => {
  // Note: base-ui's SelectValue renders its label lazily (with the popup), so
  // it's not in the static DOM. The hidden input is the submission contract —
  // assert on that.
  it('mirrors the default value to the hidden input', () => {
    const { container } = renderWithProviders(
      <SelectFieldInput {...props({ defaultValue: 'draft' })} />,
      { withoutFormState: true },
    )
    assert.equal(hidden(container).value, 'draft')
    assert.ok(screen.getByRole('combobox'))
  })

  it('reflects the controlled value from form state', () => {
    const { container } = renderWithProviders(
      <SelectFieldInput {...props()} />,
      { formMeta: fakeFormMeta([fakeFieldMeta('status', { defaultValue: 'published' })]) },
    )
    assert.equal(hidden(container).value, 'published')
  })

  it('updates the value when an option is picked', async () => {
    const { container } = renderWithProviders(
      <SelectFieldInput {...props({ defaultValue: 'draft' })} />,
      { withoutFormState: true },
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox'))                  // open the dropdown
    await user.click(await screen.findByRole('option', { name: 'Published' }))
    await waitFor(() => assert.equal(hidden(container).value, 'published'))
  })
})
