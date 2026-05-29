import '../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { renderWithProviders } from '../__test__/renderWithProviders.js'
import { fakeFormMeta, fakeFieldMeta, jsonFetch } from '../__test__/fakes.js'
import { TextLikeInput } from './fields/TextLikeInput.js'
import type { ElementMeta } from '../schema/Element.js'

// Phase 1 — the reactive form-state core. A `live()` field change POSTs to the
// form's `stateUrl` and the server's returned `form.values` overlay onto
// sibling fields. This is the riskiest form behavior; drive it through real
// TextLikeInput components inside the live FormStateProvider.

const STATE_URL = '/admin/articles/_form/x/state'

function textInput(name: string) {
  return (
    <TextLikeInput
      el={{ type: 'field', name }}
      name={name}
      common={{ id: name, 'aria-label': name }}
      type="text"
      extraProps={{}}
      multiline={false}
    />
  )
}

describe('FormStateContext (reactive)', () => {
  it('POSTs { changed, values } to stateUrl when a live field changes', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const fetchImpl = jsonFetch((body, url) => { calls.push({ url, body }); return { ok: true } })
    const formMeta = fakeFormMeta(
      [fakeFieldMeta('title', { live: true })],
      { stateUrl: STATE_URL },
    )
    const user = userEvent.setup()
    renderWithProviders(textInput('title'), { formMeta, fetchImpl })

    await user.type(screen.getByRole('textbox', { name: 'title' }), 'x')
    await waitFor(() => assert.equal(calls.length >= 1, true))
    assert.equal(calls[0]!.url, STATE_URL)
    assert.equal((calls[0]!.body as { changed: string }).changed, 'title')
  })

  it('overlays the server-returned form.values onto a sibling field', async () => {
    // Typing in `title` resolves a derived `slug` server-side.
    const nextMeta: ElementMeta = fakeFormMeta(
      [fakeFieldMeta('title', { live: true }), fakeFieldMeta('slug')],
      { stateUrl: STATE_URL, values: { slug: 'derived-slug' } },
    )
    const fetchImpl = jsonFetch(() => ({ ok: true, form: nextMeta }))
    const formMeta = fakeFormMeta(
      [fakeFieldMeta('title', { live: true }), fakeFieldMeta('slug')],
      { stateUrl: STATE_URL },
    )
    const user = userEvent.setup()
    renderWithProviders(
      <>{textInput('title')}{textInput('slug')}</>,
      { formMeta, fetchImpl },
    )

    const slug = screen.getByRole('textbox', { name: 'slug' }) as HTMLInputElement
    assert.equal(slug.value, '')
    await user.type(screen.getByRole('textbox', { name: 'title' }), 'h')
    await waitFor(() => assert.equal(slug.value, 'derived-slug'))
  })

  it('does not POST for a non-live field change', async () => {
    const calls: unknown[] = []
    const fetchImpl = jsonFetch((body, url) => { calls.push({ url, body }); return { ok: true } })
    // `title` has no `live` flag in the meta → triggerLive is a no-op.
    const formMeta = fakeFormMeta([fakeFieldMeta('title')], { stateUrl: STATE_URL })
    const user = userEvent.setup()
    renderWithProviders(textInput('title'), { formMeta, fetchImpl })

    await user.type(screen.getByRole('textbox', { name: 'title' }), 'abc')
    // Give any (unexpected) async POST a chance to land before asserting none did.
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(calls.length, 0)
  })
})
