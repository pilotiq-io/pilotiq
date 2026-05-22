import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, cleanup, waitFor } from '@testing-library/react'

import { TiptapEditor } from './TiptapEditor.js'

/**
 * Behavioral coverage for the rich-text field renderer. The matching
 * pure-data tests under `RichTextField.test.ts` cover `toMeta()` / option
 * resolution; this file proves the React renderer actually mounts in our
 * jsdom + RTL environment and produces the FormData wiring downstream
 * consumers depend on.
 *
 * Scope is deliberately narrow — slash menu, floating toolbar, mention
 * popover, side panel, and AI suggestion bridge all need additional
 * fixtures (focus traps, document-level key handlers, context providers)
 * and are covered by the playground + Playwright e2e suite. The asserts
 * here are the ones that would catch a "renderer crashes at mount" or
 * "hidden input wire-name drift" regression cheaply.
 */
describe('TiptapEditor (DOM)', () => {
  function renderEditor(opts: {
    name:          string
    defaultValue?: unknown
    placeholder?:  string
  }) {
    const { name, defaultValue = '', placeholder = 'Write…' } = opts
    return render(
      <TiptapEditor
        el={{ type: 'field', fieldType: 'richtext', name }}
        name={name}
        defaultValue={defaultValue}
        required={false}
        disabled={false}
        placeholder={placeholder}
      />,
    )
  }

  it('mounts the editor on hydration and exposes the hidden FormData input', async () => {
    const { container } = renderEditor({ name: 'bio' })
    try {
      // Initial render is the SSR placeholder gated on `mounted`. After
      // the mount-effect flips, `ClientEditor` mounts → Tiptap defers
      // editor construction to its own effect under `immediatelyRender:
      // false` → the `.ProseMirror` contenteditable lands in the DOM.
      await waitFor(() => {
        assert.ok(
          container.querySelector('.ProseMirror'),
          'ProseMirror contenteditable mounts after hydration',
        )
      })
      const hidden = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="bio"]',
      )
      assert.ok(hidden, 'hidden FormData input present alongside the editor')
    } finally {
      cleanup()
    }
  })

  it('serializes a JSON `defaultValue` into the hidden input on first paint', async () => {
    // Tiptap doc shape: paragraph with one text node. The renderer's
    // `serializeForHidden` round-trips this verbatim under the default
    // `storage: 'json'` setting, so the hidden input should hold the
    // JSON string at the very first render (before the editor itself
    // has even mounted — the SSR placeholder ships the same serialized
    // value so submit-on-mount works).
    const defaultValue = {
      type:    'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      ],
    }
    const { container } = renderEditor({ name: 'body', defaultValue })
    try {
      const hidden = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="body"]',
      )
      assert.ok(hidden, 'hidden input present')
      const parsed = JSON.parse(hidden.value)
      assert.equal(parsed.type, 'doc', 'value parses to a doc')
      assert.equal(parsed.content[0].content[0].text, 'hello')
    } finally {
      cleanup()
    }
  })

  it('uses the field `name` for the hidden input wire-name', async () => {
    // Pilotiq forms post FormData keyed by field name; renaming the wire
    // input here would silently drop the field on submit. The non-default
    // `name` ("article_body" with an underscore) doubles as a regression
    // guard for any future serializer that tries to clean / normalize
    // names — the value the host passes in is the value posted back.
    const { container } = renderEditor({ name: 'article_body' })
    try {
      await waitFor(() => {
        assert.ok(
          container.querySelector('.ProseMirror'),
          'editor mounted (post-hydration probe so the test isn\'t racing the SSR branch)',
        )
      })
      const hidden = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="article_body"]',
      )
      assert.ok(hidden, 'wire-name matches `name` prop verbatim')
    } finally {
      cleanup()
    }
  })
})
