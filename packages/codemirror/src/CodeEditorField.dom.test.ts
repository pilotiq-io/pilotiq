import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'

/**
 * Phase 6e proof-of-concept — mount a real CodeMirror 6 `EditorView`
 * against the jsdom DOM that `src/test/setup.ts` boots, exercise
 * dispatch + readback through the public state API, and inspect the
 * rendered DOM.
 *
 * Pure-data tests already cover `CodeEditorField.toMeta()` shape;
 * this file proves the lower-level `@codemirror/{state,view}` modules
 * the field renderer depends on actually mount + dispatch in our test
 * environment. Component-level coverage that previously lived only in
 * the playground now has a fast in-process test.
 */
describe('CodeMirror EditorView (DOM)', () => {
  it('mounts EditorView into a parent element and renders content', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state:  EditorState.create({ doc: 'const x = 42' }),
      parent,
    })
    try {
      assert.equal(view.state.doc.toString(), 'const x = 42')
      assert.ok(parent.querySelector('.cm-editor'), '.cm-editor mounted')
      assert.ok(parent.querySelector('.cm-content'), '.cm-content mounted')
      assert.ok(parent.textContent?.includes('const x = 42'), 'doc text visible')
    } finally {
      view.destroy()
    }
  })

  it('dispatch updates the doc + the visible DOM', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state:  EditorState.create({ doc: 'initial' }),
      parent,
    })
    try {
      view.dispatch({ changes: { from: 0, to: 7, insert: 'replaced' } })
      assert.equal(view.state.doc.toString(), 'replaced')
      assert.ok(parent.textContent?.includes('replaced'), 'updated text visible')
    } finally {
      view.destroy()
    }
  })

  it('lineNumbers extension mounts its gutter', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state:  EditorState.create({ doc: 'a\nb\nc', extensions: [lineNumbers()] }),
      parent,
    })
    try {
      // The `lineNumbers()` extension adds a `.cm-lineNumbers` gutter
      // element. Verifying it's in the DOM proves the extension's
      // ViewPlugin actually mounted (smoke-tests our jsdom layout
      // shim doesn't break codemirror's plugin lifecycle).
      assert.ok(parent.querySelector('.cm-lineNumbers'), '.cm-lineNumbers gutter mounted')
    } finally {
      view.destroy()
    }
  })

  it('readOnly facet blocks user-level edits', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state: EditorState.create({
        doc:        'frozen',
        extensions: [EditorState.readOnly.of(true)],
      }),
      parent,
    })
    try {
      // `readOnly: true` blocks user-typed input but NOT explicit
      // `dispatch` calls — that's by design (programmatic API stays
      // open for setValue + collab). Verify the facet reads back.
      assert.equal(view.state.readOnly, true)
    } finally {
      view.destroy()
    }
  })
})
