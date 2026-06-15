import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { BlockNodeExtension } from './extensions/BlockNodeExtension.js'
import { parseBlockData } from './react/blockValues.js'

/**
 * Collab-safety invariant for the `pilotiqBlock` custom-block node (issue #96).
 *
 * The node is a contentless leaf whose whole state lives in its `blockData`
 * attr. Under realtime collab the field binds through `@tiptap/extension-
 * collaboration` (y-prosemirror), whose PM↔Yjs attribute sync is string-
 * oriented — an OBJECT-valued attr doesn't round-trip and the block silently
 * drops the moment it's edited. So `blockData` must be a JSON **string** on the
 * node at all times; the NodeView / renderer parse it back at their boundaries.
 *
 * This pins that invariant against the real extension + ProseMirror schema:
 *  1. inserting a block stores `blockData` as a string, not an object;
 *  2. it survives a JSON persistence round-trip still a string, and parses back
 *     to the original object;
 *  3. an `updateAttributes` write (what clicking Edit does) keeps it a string;
 *  4. a legacy doc with an object-valued attr still loads (reads tolerate it).
 *
 * The React NodeView is bypassed (addNodeView → undefined) so the test exercises
 * the schema + commands deterministically in jsdom — collab operates on the PM
 * model, not the rendered NodeView, so this is the faithful surface.
 */
const CALLOUT = { name: 'callout', label: 'Callout', schema: [{ name: 'title', fieldType: 'text' }] }

function mount(): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Block = BlockNodeExtension
    .extend({ addNodeView: () => null })
    .configure({ blocks: [CALLOUT] as never })
  return new Editor({ element: el, extensions: [StarterKit, Block] })
}

function firstBlock(editor: Editor): { type: string; attrs: Record<string, unknown> } {
  const json = editor.getJSON() as { content?: Array<{ type: string; attrs?: Record<string, unknown> }> }
  const node = (json.content ?? []).find((n) => n.type === 'pilotiqBlock')
  assert.ok(node, 'expected a pilotiqBlock node in the doc')
  return { type: node.type, attrs: node.attrs ?? {} }
}

describe('pilotiqBlock blockData is a collab-safe string (#96)', () => {
  it('insertBlock stores blockData as a JSON string, not an object', () => {
    const editor = mount()
    editor.commands.insertBlock('callout', { title: 'Hello' })
    const { attrs } = firstBlock(editor)
    assert.equal(typeof attrs['blockData'], 'string', 'blockData must be a string on the node')
    assert.deepEqual(parseBlockData(attrs['blockData']), { title: 'Hello' })
  })

  it('survives a JSON persistence round-trip still a string', () => {
    const editor = mount()
    editor.commands.insertBlock('callout', { title: 'Persisted' })
    const saved = editor.getJSON()

    // Re-hydrate from the persisted JSON, as a fresh page load / collab peer would.
    const editor2 = mount()
    editor2.commands.setContent(saved)
    const { attrs } = firstBlock(editor2)
    assert.equal(typeof attrs['blockData'], 'string', 'blockData stays a string across reload')
    assert.deepEqual(parseBlockData(attrs['blockData']), { title: 'Persisted' })
  })

  it('updateAttributes (the Edit write path) keeps blockData a string', () => {
    const editor = mount()
    editor.commands.insertBlock('callout', { title: 'Before' })
    // Select the block and update it the way BlockNodeView.handleChange does —
    // it writes serializeBlockData(...) which is a string.
    editor.commands.updateAttributes('pilotiqBlock', { blockData: JSON.stringify({ title: 'After' }) })
    const { attrs } = firstBlock(editor)
    assert.equal(typeof attrs['blockData'], 'string')
    assert.deepEqual(parseBlockData(attrs['blockData']), { title: 'After' })
  })

  it('reads tolerate a legacy object-valued attr (old docs still load)', () => {
    const editor = mount()
    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'pilotiqBlock', attrs: { blockType: 'callout', blockData: { title: 'Legacy' } } }],
    })
    const { attrs } = firstBlock(editor)
    // The legacy object loads; the NodeView/renderer recover it via parseBlockData.
    assert.deepEqual(parseBlockData(attrs['blockData']), { title: 'Legacy' })
  })
})
