import '../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta } from '../../__test__/fakes.js'
import { MarkdownInput } from './MarkdownInput.js'

// Phase 1c — the native (no-collab, no-WYSIWYG-adapter) markdown path.
// With nothing registered, MarkdownInput falls through to the textarea +
// Write/Preview tabs + toolbar. We exercise: tab switching, the Preview
// pane rendering `marked` output, and a toolbar transform splicing the
// textarea value.

function md(props: Partial<React.ComponentProps<typeof MarkdownInput>> = {}) {
  return (
    <MarkdownInput
      name="body"
      defaultValue=""
      disabled={false}
      placeholder={undefined}
      toolbarButtons={[]}
      minHeight={undefined}
      maxHeight={undefined}
      fileAttachmentsDirectory={undefined}
      fileAttachmentsVisibility={undefined}
      uploadUrl={undefined}
      {...props}
    />
  )
}

describe('MarkdownInput (native path)', () => {
  it('renders typed markdown as HTML in the Preview tab', async () => {
    renderWithProviders(md(), { withoutFormState: true })
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox'), '# Title')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    // marked turns `# Title` into an <h1>; the textarea is gone in preview.
    assert.ok(screen.getByRole('heading', { name: 'Title' }))
    assert.equal(screen.queryByRole('textbox'), null)
  })

  it('switches back to the textarea on the Write tab', async () => {
    renderWithProviders(md(), { withoutFormState: true })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    assert.equal(screen.queryByRole('textbox'), null)
    await user.click(screen.getByRole('button', { name: 'Write' }))
    assert.ok(screen.getByRole('textbox'))
  })

  it('wraps the selection when a toolbar button is clicked (controlled)', async () => {
    renderWithProviders(
      md({ toolbarButtons: ['bold'] }),
      { formMeta: fakeFormMeta([fakeFieldMeta('body', { fieldType: 'markdown', defaultValue: '' })]) },
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.setup().click(screen.getByRole('button', { name: 'Bold (⌘B)' }))
    // No selection → bold wraps the placeholder text.
    assert.equal(textarea.value, '**bold text**')
  })
})
