import '../../../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { ActionModalDialog } from './ActionModalDialog.js'
import { renderWithProviders } from '../../../__test__/renderWithProviders.js'
import { installFetch } from '../../../__test__/fakes.js'
import type { ElementMeta } from '../../../schema/Element.js'

// Phase 3c — modal-form / confirm-modal action dialog. Submits the form
// to `dispatchUrl` via the global `fetch` and branches on the response:
// 200 → close + navigate(redirect); 422 → inline field errors; 5xx →
// server-error banner. Drives the controlled-open path so the dialog is
// mounted without clicking a trigger. `renderFormChild`/`renderElement`
// are injected — we stub a minimal field-with-errors renderer. (The
// import/export modal is a modal-form action, so it rides this same
// submit pipeline.)

// Minimal field renderer: a labelled input + any inline errors.
const renderFormChild = (
  child: ElementMeta,
  i: number,
  values: Record<string, unknown>,
  errors: Record<string, string[]>,
): React.ReactNode => {
  const fieldName = String(child['name'])
  return (
    <div key={i}>
      <input aria-label={fieldName} name={fieldName} defaultValue={String(values[fieldName] ?? '')} />
      {(errors[fieldName] ?? []).map((e, j) => <span key={j}>{e}</span>)}
    </div>
  )
}
const renderElement = () => null

const CONFIRM_META: ElementMeta = {
  type: 'action',
  name: 'archive',
  label: 'Archive',
  confirm: { title: 'Archive item?', message: 'It moves to the archive.' },
  dispatchUrl: '/admin/_action/archive',
}

const FORM_META: ElementMeta = {
  type: 'action',
  name: 'reject',
  label: 'Reject',
  dispatchUrl: '/admin/_action/reject',
  children: [{ type: 'field', name: 'reason', fieldType: 'text' }],
}

describe('ActionModalDialog', () => {
  it('renders confirm chrome and navigates on a 200 response', async () => {
    const fetchStub = installFetch(() => ({ status: 200, json: { ok: true, redirect: '/admin/done' } }))
    const navigated: string[] = []
    const opens: boolean[] = []
    try {
      renderWithProviders(
        <ActionModalDialog
          meta={CONFIRM_META}
          ids={[]}
          open
          onOpenChange={(o) => opens.push(o)}
          renderFormChild={renderFormChild}
          renderElement={renderElement}
        />,
        { navigate: (url) => { navigated.push(url) } },
      )
      assert.ok(screen.getByText('Archive item?'))
      assert.ok(screen.getByText('It moves to the archive.'))
      await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm' }))
      assert.deepEqual(navigated, ['/admin/done'])
      assert.ok(opens.includes(false)) // dialog asked to close on success
      assert.ok(fetchStub.calls.some(c => c.url === '/admin/_action/archive' && c.init?.method === 'POST'))
    } finally {
      fetchStub.restore()
    }
  })

  it('shows inline field errors on a 422 response and stays open', async () => {
    const fetchStub = installFetch(() => ({ status: 422, json: { ok: false, errors: { reason: ['Reason is required'] } } }))
    const navigated: string[] = []
    try {
      renderWithProviders(
        <ActionModalDialog
          meta={FORM_META}
          ids={[]}
          open
          onOpenChange={() => {}}
          renderFormChild={renderFormChild}
          renderElement={renderElement}
        />,
        { navigate: (url) => { navigated.push(url) } },
      )
      await userEvent.setup().click(screen.getByRole('button', { name: 'Submit' }))
      assert.ok(await screen.findByText('Reason is required'))
      assert.deepEqual(navigated, []) // no navigation on validation failure
    } finally {
      fetchStub.restore()
    }
  })

  it('shows a server-error banner on a 5xx response', async () => {
    const fetchStub = installFetch(() => ({ status: 500, json: { ok: false, error: 'Something broke' } }))
    try {
      renderWithProviders(
        <ActionModalDialog
          meta={FORM_META}
          ids={[]}
          open
          onOpenChange={() => {}}
          renderFormChild={renderFormChild}
          renderElement={renderElement}
        />,
        { navigate: () => {} },
      )
      await userEvent.setup().click(screen.getByRole('button', { name: 'Submit' }))
      assert.ok(await screen.findByText('Something broke'))
    } finally {
      fetchStub.restore()
    }
  })

  it('closes via the Cancel button', async () => {
    const opens: boolean[] = []
    renderWithProviders(
      <ActionModalDialog
        meta={CONFIRM_META}
        ids={[]}
        open
        onOpenChange={(o) => opens.push(o)}
        renderFormChild={renderFormChild}
        renderElement={renderElement}
      />,
      { navigate: () => {} },
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }))
    assert.ok(opens.includes(false))
  })
})
