import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'

import { contentBlockNodes, isSelectionInAlert } from './index.js'

/**
 * #155 — the inline mark toolbar must stay hidden in callouts. `FloatingToolbar`
 * keys its visibility off `isSelectionInAlert`; this pins that predicate against
 * the REAL `@pilotiq/tiptap` schema for the two ways a callout gets selected —
 * the second of which (a whole-block NodeSelection via the drag handle) was the
 * regression: walking ancestors from `$from` alone misses it because `$from`
 * resolves to *before* the node.
 */
const ALERT_HTML =
  '<div data-type="alert" data-alert-type="info">' +
  '<div data-type="alertTitle">Heads up</div>' +
  '<div data-type="alertBody"><p>Body text here.</p></div>' +
  '</div><p>After the callout.</p>'

function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes], content })
}

/** Absolute position of the first node of the given type. */
function posOf(editor: Editor, typeName: string): number {
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (pos === -1 && node.type.name === typeName) { pos = p; return false }
    return true
  })
  return pos
}

describe('#155 isSelectionInAlert (real @pilotiq/tiptap schema)', () => {
  it('true for a NodeSelection on the whole alert (the drag-handle "pick" case)', () => {
    const editor = mount(ALERT_HTML)
    const alertPos = posOf(editor, 'alert')
    assert.notEqual(alertPos, -1, 'found the alert node')
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, alertPos)))
    assert.ok(editor.state.selection instanceof NodeSelection, 'selection is a NodeSelection')
    assert.equal(isSelectionInAlert(editor.state.selection), true)
    editor.destroy()
  })

  it('true for a text selection inside the callout body', () => {
    const editor = mount(ALERT_HTML)
    const bodyPos = posOf(editor, 'alertBody')
    const $inside = editor.state.doc.resolve(bodyPos + 2) // inside the body's paragraph text
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, $inside.pos, $inside.pos + 3)),
    )
    assert.equal(isSelectionInAlert(editor.state.selection), true)
    editor.destroy()
  })

  it('false for a text selection in the top-level paragraph after the callout', () => {
    const editor = mount(ALERT_HTML)
    // The top-level paragraph ("After the callout.") sits directly under the doc.
    let paraPos = -1
    editor.state.doc.descendants((node, p, parent) => {
      if (node.type.name === 'paragraph' && parent?.type.name === 'doc') paraPos = p
      return true
    })
    assert.notEqual(paraPos, -1, 'found the top-level paragraph')
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, paraPos + 1, paraPos + 4)),
    )
    assert.equal(isSelectionInAlert(editor.state.selection), false)
    editor.destroy()
  })
})
