import '../../../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta, installFetch } from '../../../__test__/fakes.js'
import { FormRenderer } from './FormRenderer.js'

// Phase 1 — the submit path users hit most. FormRenderer owns the fetch-mode
// submission: 422 → inline errors, success → SPA navigate, the double-submit
// guard, and the `force` redirect. It uses the global `fetch`, so we stub it.

// Non-field children fall through to renderElement; field-only forms never
// call it, so a null stub is enough here.
const renderElement = () => null

function makeForm(overrides: Record<string, unknown> = {}) {
  return fakeFormMeta([fakeFieldMeta('title', { label: 'Title' })], {
    formId: 'articles-create',
    action: '/admin/articles/create',
    method: 'post',
    ...overrides,
  })
}

let fetchStub: { calls: { url: string }[]; restore: () => void } | undefined
afterEach(() => { fetchStub?.restore(); fetchStub = undefined })

describe('FormRenderer', () => {
  it('renders form chrome (hidden _formId + action)', () => {
    const { container } = renderWithProviders(
      <FormRenderer el={makeForm()} renderElement={renderElement} />,
      { withoutFormState: true },
    )
    const form = container.querySelector('form')!
    assert.equal(form.getAttribute('action'), '/admin/articles/create')
    const hidden = container.querySelector('input[name="_formId"]') as HTMLInputElement
    assert.equal(hidden.value, 'articles-create')
  })

  it('shows server-rendered field errors inline + the banner', () => {
    renderWithProviders(
      <FormRenderer el={{ ...makeForm(), errors: { title: ['Title is required'] } }} renderElement={renderElement} />,
      { withoutFormState: true },
    )
    assert.ok(screen.getByText('Title is required'))
    assert.ok(screen.getByText('Please correct the errors below.'))
  })

  it('navigates to the redirect on a successful submit', async () => {
    const navigated: string[] = []
    fetchStub = installFetch(() => ({ status: 200, json: { redirect: '/admin/articles' } }))
    const { container } = renderWithProviders(
      <FormRenderer el={makeForm()} renderElement={renderElement} />,
      { withoutFormState: true, navigate: (url) => { navigated.push(url) } },
    )
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => assert.equal(navigated[0], '/admin/articles'))
    assert.equal(fetchStub.calls.length, 1)
    assert.equal(fetchStub.calls[0]!.url, '/admin/articles/create')
  })

  it('stamps inline errors from a 422 response', async () => {
    fetchStub = installFetch(() => ({ status: 422, json: { errors: { title: ['Already taken'] } } }))
    const { container } = renderWithProviders(
      <FormRenderer el={makeForm()} renderElement={renderElement} />,
      { withoutFormState: true, navigate: () => {} },
    )
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => assert.ok(screen.getByText('Already taken')))
  })

  it('does not double-submit while a request is in flight', async () => {
    let resolve!: () => void
    const gate = new Promise<void>((r) => { resolve = r })
    fetchStub = installFetch(() => ({ status: 200, json: { redirect: '/x' } }))
    // Wrap the stub so the first call hangs until we release it.
    const realFetch = globalThis.fetch
    let first = true
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      if (first) { first = false; await gate }
      return realFetch(...args)
    }) as typeof fetch
    const { container } = renderWithProviders(
      <FormRenderer el={makeForm()} renderElement={renderElement} />,
      { withoutFormState: true, navigate: () => {} },
    )
    const form = container.querySelector('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)   // second submit while first is in flight → ignored
    resolve()
    await waitFor(() => assert.equal(fetchStub!.calls.length, 1))
  })

  it('forces navigation even when the redirect equals the current URL', async () => {
    const navigated: string[] = []
    const here = window.location.pathname + window.location.search
    fetchStub = installFetch(() => ({ status: 200, json: { redirect: here, force: true } }))
    const { container } = renderWithProviders(
      <FormRenderer el={makeForm()} renderElement={renderElement} />,
      { withoutFormState: true, navigate: (url) => { navigated.push(url) } },
    )
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => assert.equal(navigated[0], here))
  })
})
