import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'

import { contentBlockNodes, shouldShowFloatingToolbar } from './index.js'

/**
 * #156 — the inline mark toolbar must also appear on a bare caret sitting
 * inside a formatting mark (link / bold / …), so the mark can be edited
 * without selecting text first. Pins `shouldShowFloatingToolbar` (the engine
 * behind `FloatingToolbar`'s shouldShow) against the REAL schema, and keeps
 * the #155 callout-suppression guarantee.
 */
function mount(content: string): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions: [StarterKit, ...contentBlockNodes], content })
}

/** Put a collapsed caret at the first text position carrying `markName`. */
function caretInMark(editor: Editor, markName: string): boolean {
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (pos === -1 && node.isText && node.marks.some((m) => m.type.name === markName)) {
      pos = p + 1 // one char into the marked text node
      return false
    }
    return true
  })
  if (pos === -1) return false
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)))
  return true
}

describe('#156 shouldShowFloatingToolbar (real @pilotiq/tiptap schema)', () => {
  it('shows on a caret inside a bold span (no selection)', () => {
    const editor = mount('<p>plain <strong>bold text</strong> tail</p>')
    assert.ok(caretInMark(editor, 'bold'), 'placed caret in bold')
    assert.ok(editor.state.selection.empty, 'selection is a bare caret')
    assert.equal(shouldShowFloatingToolbar(editor.state), true)
    editor.destroy()
  })

  it('shows on a caret inside a link span (no selection)', () => {
    const editor = mount('<p>see <a href="https://example.com">the link</a> here</p>')
    assert.ok(caretInMark(editor, 'link'), 'placed caret in link')
    assert.equal(shouldShowFloatingToolbar(editor.state), true)
    editor.destroy()
  })

  it('does NOT show on a caret in plain (unformatted) text', () => {
    const editor = mount('<p>just plain text here</p>')
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)))
    assert.ok(editor.state.selection.empty)
    assert.equal(shouldShowFloatingToolbar(editor.state), false)
    editor.destroy()
  })

  it('still shows on a non-empty text selection (existing behaviour)', () => {
    const editor = mount('<p>select me</p>')
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 7)))
    assert.ok(!editor.state.selection.empty)
    assert.equal(shouldShowFloatingToolbar(editor.state), true)
    editor.destroy()
  })

  it('does NOT show on a whole-node selection of a non-text block (#155 custom block / hr / image)', () => {
    // A NodeSelection on a block leaf — what clicking a schema-form custom
    // block card (`pilotiqBlock`) or an hr/image produces — has no inline
    // text to format, so the mark toolbar must stay hidden. Exercised here
    // via `horizontalRule` (same code path; no React NodeView needed).
    const editor = mount('<p>before</p><hr><p>after</p>')
    let hrPos = -1
    editor.state.doc.descendants((node, p) => {
      if (hrPos === -1 && node.type.name === 'horizontalRule') hrPos = p
      return hrPos === -1
    })
    assert.ok(hrPos >= 0, 'found the horizontal rule')
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, hrPos)))
    assert.ok(editor.state.selection instanceof NodeSelection, 'selection is a NodeSelection')
    assert.equal(shouldShowFloatingToolbar(editor.state), false)
    editor.destroy()
  })

  it('DOES show inside the Alert block editable body — its title/body are real text', () => {
    // The Alert block has an editable title + body; the mark toolbar should
    // work there like anywhere else. (An earlier fix over-suppressed the whole
    // Alert, including its editable text — reversed here.)
    const editor = mount(
      '<div data-type="alert" data-alert-type="info">' +
        '<div data-type="alertTitle">Heads up</div>' +
        '<div data-type="alertBody"><p>read <strong>this bold</strong> note</p></div>' +
        '</div>',
    )
    assert.ok(caretInMark(editor, 'bold'), 'placed caret in bold inside the alert body')
    assert.equal(shouldShowFloatingToolbar(editor.state), true)
    editor.destroy()
  })

  it('does NOT show when the WHOLE Alert block is node-selected (drag-handle pick)', () => {
    const editor = mount(
      '<div data-type="alert" data-alert-type="info">' +
        '<div data-type="alertTitle">Heads up</div>' +
        '<div data-type="alertBody"><p>some note</p></div>' +
        '</div>',
    )
    let alertPos = -1
    editor.state.doc.descendants((node, p) => {
      if (alertPos === -1 && node.type.name === 'alert') alertPos = p
      return alertPos === -1
    })
    assert.ok(alertPos >= 0, 'found the alert node')
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, alertPos)))
    assert.ok(editor.state.selection instanceof NodeSelection, 'selection is a NodeSelection')
    assert.equal(shouldShowFloatingToolbar(editor.state), false)
    editor.destroy()
  })
})
