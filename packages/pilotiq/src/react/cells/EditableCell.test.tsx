import '../../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { installFetch, type FetchCall } from '../../__test__/fakes.js'
import { CellTextInput, CellToggle } from './EditableCell.js'

// Phase 2b — editable table cells. Security-adjacent (per-row gating happens
// server-side) and high-traffic. All three cells PATCH via the global `fetch`
// and roll the optimistic local value back when the server rejects. The
// rollback's observable is the DOM value reverting — assert that, no toast
// capture needed. These render standalone (no FormStateProvider).

const URL = '/admin/articles/1/_cell/title'

function bodyValue(call: FetchCall): unknown {
  return JSON.parse(String(call.init?.body ?? '{}')).value
}

let stub: { calls: FetchCall[]; restore: () => void } | undefined
// These cells need no providers, so they use RTL's raw `render` — which means
// we register `cleanup` ourselves (renderWithProviders does it for its callers).
afterEach(() => { cleanup(); stub?.restore(); stub = undefined })

describe('CellTextInput', () => {
  it('debounces a PATCH carrying the typed value', async () => {
    stub = installFetch(() => ({ status: 200, json: { ok: true, value: 'x' } }))
    render(<CellTextInput url={URL} col={{ debounceMs: 0 }} value="" disabled={false} />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox'), 'x')
    await waitFor(() => assert.equal(stub!.calls.length, 1))
    assert.equal(stub!.calls[0]!.url, URL)
    assert.equal(bodyValue(stub!.calls[0]!), 'x')
  })

  it('rolls the value back when the server rejects', async () => {
    stub = installFetch(() => ({ status: 422, json: { errors: { value: ['Too long'] } } }))
    render(<CellTextInput url={URL} col={{ debounceMs: 0 }} value="orig" disabled={false} />)
    const user = userEvent.setup()
    const input = screen.getByRole('textbox') as HTMLInputElement
    await user.clear(input)
    await user.type(input, 'new')
    await waitFor(() => assert.equal(stub!.calls.length >= 1, true))
    await waitFor(() => assert.equal(input.value, 'orig'))   // optimistic value reverted
  })

  it('does not PATCH until a confirm dialog is accepted', async () => {
    stub = installFetch(() => ({ status: 200, json: { ok: true, value: 'y' } }))
    render(<CellTextInput url={URL} col={{ confirm: 'Save this change?' }} value="" disabled={false} />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox'), 'y')
    // Nothing sent yet — the confirm dialog is gating the commit.
    assert.equal(stub.calls.length, 0)
    assert.ok(screen.getByText('Save this change?'))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => assert.equal(stub!.calls.length, 1))
    assert.equal(bodyValue(stub!.calls[0]!), 'y')
  })

  it('cancelling the confirm dialog reverts and sends nothing', async () => {
    stub = installFetch(() => ({ status: 200, json: { ok: true } }))
    render(<CellTextInput url={URL} col={{ confirm: 'Sure?' }} value="orig" disabled={false} />)
    const user = userEvent.setup()
    const input = screen.getByRole('textbox') as HTMLInputElement
    await user.type(input, 'z')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => assert.equal(input.value, 'orig'))
    assert.equal(stub.calls.length, 0)
  })

  it('does not render an editable input when disabled', () => {
    stub = installFetch()
    render(<CellTextInput url={URL} col={{}} value="hi" disabled={true} />)
    assert.equal((screen.getByRole('textbox') as HTMLInputElement).disabled, true)
  })
})

describe('CellToggle', () => {
  it('PATCHes immediately on toggle', async () => {
    stub = installFetch(() => ({ status: 200, json: { ok: true, value: true } }))
    render(<CellToggle url={URL} col={{}} value={false} disabled={false} />)
    const user = userEvent.setup()
    const sw = screen.getByRole('switch')
    assert.equal(sw.getAttribute('aria-checked'), 'false')
    await user.click(sw)
    await waitFor(() => assert.equal(stub!.calls.length, 1))
    assert.equal(bodyValue(stub!.calls[0]!), true)
  })

  it('flips back when the server rejects', async () => {
    stub = installFetch(() => ({ status: 500, json: { error: 'boom' } }))
    render(<CellToggle url={URL} col={{}} value={false} disabled={false} />)
    const user = userEvent.setup()
    const sw = screen.getByRole('switch')
    await user.click(sw)
    await waitFor(() => assert.equal(stub!.calls.length, 1))
    await waitFor(() => assert.equal(sw.getAttribute('aria-checked'), 'false'))  // rolled back
  })
})
