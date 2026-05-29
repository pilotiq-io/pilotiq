import '../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta } from '../../__test__/fakes.js'
import { TextLikeInput } from './TextLikeInput.js'

// First real-component test — proves `renderWithProviders` wires a pilotiq
// component (TextLikeInput) against the live `FormStateProvider`, exercising
// the controlled value/onChange path end to end.
describe('TextLikeInput (controlled)', () => {
  const el = { type: 'field', name: 'title' }

  function renderTitle(defaultValue = '') {
    return renderWithProviders(
      <TextLikeInput
        el={el}
        name="title"
        common={{ id: 'title', 'aria-label': 'Title' }}
        type="text"
        extraProps={{}}
        multiline={false}
      />,
      { formMeta: fakeFormMeta([fakeFieldMeta('title', { defaultValue })]) },
    )
  }

  it('renders the field default from form state', () => {
    renderTitle('hello')
    const input = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement
    assert.equal(input.value, 'hello')
  })

  it('updates the controlled value as the user types', async () => {
    const user = userEvent.setup()
    renderTitle('')
    const input = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement
    await user.type(input, 'pilotiq')
    assert.equal(input.value, 'pilotiq')
  })
})
