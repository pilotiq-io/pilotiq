import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, cleanup, waitFor } from '@testing-library/react'

import { CodeMirrorEditor } from './CodeMirrorEditor.js'

/**
 * Behavioral coverage for the React renderer mounted by `CodeEditorField`.
 * Pure-data tests under `CodeEditorField.test.ts` cover the field's
 * `toMeta()` shape; this file proves the React + `@uiw/react-codemirror`
 * surface (mount, hidden FormData input, language extension wiring) does
 * what we claim against jsdom.
 *
 * Collab branch is exercised indirectly by the `pilotiq-pro/e2e/collab`
 * suite — mounting `<CollabCodeMirrorEditor>` in isolation needs a real
 * Y.Doc + provider + WebSocket, which is heavier than this file's scope.
 */
describe('CodeMirrorEditor (DOM, local branch)', () => {
  function renderEditor(opts: {
    name:          string
    defaultValue?: string
    language?:     string
  }) {
    const { name, defaultValue = '', language } = opts
    return render(
      <CodeMirrorEditor
        el={{
          type:      'field',
          fieldType: 'code',
          name,
          ...(language ? { language } : {}),
        }}
        name={name}
        defaultValue={defaultValue}
        required={false}
        disabled={false}
        placeholder={undefined}
      />,
    )
  }

  it('mounts CodeMirror and exposes the hidden FormData input', async () => {
    const { container } = renderEditor({
      name:         'snippet',
      defaultValue: 'const x = 42',
    })
    try {
      // First render is the SSR placeholder ("Loading editor…"); the
      // mount effect flips to `ClientEditor` → `<CodeMirror>` →
      // `.cm-editor` lands in the DOM.
      await waitFor(() => {
        assert.ok(container.querySelector('.cm-editor'), '.cm-editor mounted')
        assert.ok(container.querySelector('.cm-content'), '.cm-content mounted')
      })
      const hidden = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="snippet"]',
      )
      assert.ok(hidden, 'hidden input wired to the field name')
      assert.equal(hidden.value, 'const x = 42', 'hidden input mirrors defaultValue')
    } finally {
      cleanup()
    }
  })

  it('renders the defaultValue text inside the editor body', async () => {
    const { container } = renderEditor({
      name:         'snippet',
      defaultValue: 'function greet() { return "hi" }',
    })
    try {
      await waitFor(() => {
        const content = container.querySelector('.cm-content')
        assert.ok(content, 'cm-content present')
        // CodeMirror splits the text across syntax-aware spans, so
        // `textContent` reads the joined visible text.
        assert.ok(
          content!.textContent?.includes('function greet()'),
          'defaultValue visible in editor body',
        )
      })
    } finally {
      cleanup()
    }
  })

  it('passes the language id through to the editor extensions', async () => {
    // `readString(el['language'])` flows through to the CodeMirror
    // language extension via the registry. We can't probe the extension
    // ref directly, but we can assert the editor mounts cleanly with
    // a registered language — a regression in the registry lookup
    // would surface as a thrown extension load (jsdom would log it).
    const { container } = renderEditor({
      name:         'snippet',
      defaultValue: '{"answer": 42}',
      language:     'json',
    })
    try {
      await waitFor(() => {
        assert.ok(container.querySelector('.cm-editor'), 'editor mounts with json language')
      })
    } finally {
      cleanup()
    }
  })

  it('uses the field `name` for the hidden input wire-name', async () => {
    // Regression guard for any future serializer that tries to clean
    // or normalize names — the value the host passes in is the value
    // posted back. Mirrors the parallel test in @pilotiq/tiptap.
    const { container } = renderEditor({ name: 'editor_body' })
    try {
      await waitFor(() => {
        assert.ok(container.querySelector('.cm-editor'), 'editor mounted')
      })
      assert.ok(
        container.querySelector('input[type="hidden"][name="editor_body"]'),
        'wire-name matches `name` prop verbatim',
      )
    } finally {
      cleanup()
    }
  })
})
