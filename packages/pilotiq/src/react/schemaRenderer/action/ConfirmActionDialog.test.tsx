import '../../../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { ConfirmActionDialog } from './ConfirmActionDialog.js'

// Phase 3c — the confirm-gate wrapping submit-style + form-method
// actions. Self-contained (Dialog + Button, no providers). The trigger
// is a render prop; the dialog is internal state. We assert the gate:
// open → confirm runs `onConfirm` + closes; cancel closes without
// running it; destructive flips the CTA label.

afterEach(cleanup)

function open() {
  return userEvent.setup().click(screen.getByRole('button', { name: 'Open' }))
}

describe('ConfirmActionDialog', () => {
  it('opens on the trigger, then runs onConfirm and closes on confirm', async () => {
    let confirmed = 0
    render(
      <ConfirmActionDialog
        trigger={(o) => <button type="button" onClick={o}>Open</button>}
        title="Delete article?"
        message="This cannot be undone."
        destructive
        onConfirm={() => { confirmed++ }}
      />,
    )
    await open()
    assert.ok(screen.getByText('This cannot be undone.'))
    // Destructive → solid "Delete" CTA, not "Confirm".
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete' }))
    assert.equal(confirmed, 1)
    assert.equal(screen.queryByText('This cannot be undone.'), null) // dialog closed
  })

  it('uses the "Confirm" label and default title for non-destructive actions', async () => {
    render(
      <ConfirmActionDialog
        trigger={(o) => <button type="button" onClick={o}>Open</button>}
        title={undefined}
        message="Proceed?"
        destructive={false}
        onConfirm={() => {}}
      />,
    )
    await open()
    assert.ok(screen.getByText('Are you sure?')) // default title
    assert.ok(screen.getByRole('button', { name: 'Confirm' }))
  })

  it('closes without confirming on Cancel', async () => {
    let confirmed = 0
    render(
      <ConfirmActionDialog
        trigger={(o) => <button type="button" onClick={o}>Open</button>}
        title="Delete?"
        message="Bye?"
        destructive
        onConfirm={() => { confirmed++ }}
      />,
    )
    await open()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }))
    assert.equal(confirmed, 0)
    assert.equal(screen.queryByText('Bye?'), null)
  })
})
