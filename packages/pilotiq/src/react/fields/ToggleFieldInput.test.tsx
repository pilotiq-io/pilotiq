import '../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta } from '../../__test__/fakes.js'
import { ToggleFieldInput } from './ToggleFieldInput.js'

// Phase 1b — boolean switch. Like CheckboxInput: a hidden mirror input plus a
// base-ui Switch, controlled by form state or local state.
function hidden(c: HTMLElement, name = 'active') {
  return c.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement
}

describe('ToggleFieldInput', () => {
  it('toggles the switch and the hidden mirror (uncontrolled)', async () => {
    const { container } = renderWithProviders(
      <ToggleFieldInput name="active" defaultChecked={false} disabled={false} />,
      { withoutFormState: true },
    )
    const sw = screen.getByRole('switch')
    assert.equal(sw.getAttribute('aria-checked'), 'false')
    assert.equal(hidden(container).value, 'false')

    await userEvent.setup().click(sw)
    assert.equal(sw.getAttribute('aria-checked'), 'true')
    assert.equal(hidden(container).value, 'true')
  })

  it('reflects the controlled value from form state', () => {
    renderWithProviders(
      <ToggleFieldInput name="active" defaultChecked={false} disabled={false} />,
      { formMeta: fakeFormMeta([fakeFieldMeta('active', { defaultValue: true })]) },
    )
    assert.equal(screen.getByRole('switch').getAttribute('aria-checked'), 'true')
  })
})
