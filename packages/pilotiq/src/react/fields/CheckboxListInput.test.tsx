import '../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta } from '../../__test__/fakes.js'
import { CheckboxListInput } from './CheckboxListInput.js'

// Phase 1c — multi-choice. Value is string[]; each checked option emits a
// repeated hidden `name=value` input which `coerceFormValues` re-groups
// into an array server-side. Visible boxes are base-ui Checkboxes
// (role=checkbox, aria-checked).
const OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]
function hiddenValues(c: HTMLElement, name = 'tags'): string[] {
  return [...c.querySelectorAll(`input[type="hidden"][name="${name}"]`)].map(
    el => (el as HTMLInputElement).value,
  )
}

describe('CheckboxListInput', () => {
  it('adds and removes hidden inputs as options toggle (uncontrolled)', async () => {
    const { container } = renderWithProviders(
      <CheckboxListInput name="tags" defaultValue={[]} disabled={false} options={OPTIONS} columns={1} />,
      { withoutFormState: true },
    )
    const user = userEvent.setup()
    assert.deepEqual(hiddenValues(container), [])

    await user.click(screen.getByRole('checkbox', { name: 'Draft' }))
    assert.deepEqual(hiddenValues(container), ['draft'])

    await user.click(screen.getByRole('checkbox', { name: 'Published' }))
    assert.deepEqual(hiddenValues(container).sort(), ['draft', 'published'])

    await user.click(screen.getByRole('checkbox', { name: 'Draft' })) // uncheck
    assert.deepEqual(hiddenValues(container), ['published'])
  })

  it('reflects the controlled array value from form state', () => {
    const { container } = renderWithProviders(
      <CheckboxListInput name="tags" defaultValue={[]} disabled={false} options={OPTIONS} columns={1} />,
      { formMeta: fakeFormMeta([fakeFieldMeta('tags', { defaultValue: ['published'] })]) },
    )
    assert.equal(screen.getByRole('checkbox', { name: 'Published' }).getAttribute('aria-checked'), 'true')
    assert.equal(screen.getByRole('checkbox', { name: 'Draft' }).getAttribute('aria-checked'), 'false')
    assert.deepEqual(hiddenValues(container), ['published'])
  })
})
