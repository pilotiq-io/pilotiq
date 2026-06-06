import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, cleanup, waitFor } from '@testing-library/react'
import {
  CollabRoomContext,
  registerCollabCodeExtensions,
  type CollabRoom,
} from '@pilotiq/pilotiq/react'

import { CodeMirrorEditor } from './CodeMirrorEditor.js'

/**
 * Gating coverage for the collab branch — this package no longer imports
 * `y-codemirror.next` / `yjs`; the binding arrives via the
 * `registerCollabCodeExtensions` registry (filled by `@pilotiq-pro/collab`).
 * A structural fake Y.Doc + a factory returning `[]` are enough to prove
 * the branch decision; the real yCollab binding is e2e'd in
 * `pilotiq-pro/e2e/collab`.
 *
 * NOTE: the registry is module-global, so the no-factory test MUST run
 * before the registration test — `it()` blocks run sequentially in
 * declaration order within one file, and node:test isolates files per
 * process, so this ordering is safe.
 */

class FakeYText {
  private content = ''
  toString(): string { return this.content }
  get length(): number { return this.content.length }
  insert(_index: number, text: string): void { this.content += text }
}

function makeFakeRoom(): CollabRoom {
  const texts = new Map<string, FakeYText>()
  const ydoc = {
    getText: (key: string) => {
      let t = texts.get(key)
      if (!t) { t = new FakeYText(); texts.set(key, t) }
      return t
    },
    transact: (fn: () => void) => { fn() },
  }
  return {
    ydoc,
    provider: { awareness: null },
    synced: Promise.resolve(),
  } as unknown as CollabRoom
}

function renderInRoom(room: CollabRoom): ReturnType<typeof render> {
  return render(
    <CollabRoomContext.Provider value={room}>
      <CodeMirrorEditor
        el={{ type: 'field', fieldType: 'code', name: 'snippet' }}
        name="snippet"
        defaultValue="const x = 1"
        required={false}
        disabled={false}
        placeholder={undefined}
      />
    </CollabRoomContext.Provider>,
  )
}

describe('CodeMirrorEditor — collab gating', () => {
  it('falls back to the local branch when no factory is registered (room present)', async () => {
    const { container } = renderInRoom(makeFakeRoom())
    try {
      await waitFor(() => {
        assert.ok(container.querySelector('.cm-editor'), '.cm-editor mounted')
      })
      assert.equal(
        container.querySelector('[data-pilotiq-collab-code]'),
        null,
        'collab host must NOT mount without a registered factory',
      )
    } finally {
      cleanup()
    }
  })

  it('mounts the collab editor when a factory is registered AND a room is up-tree', async () => {
    const seen: Array<{ ytext: unknown; awareness: unknown }> = []
    registerCollabCodeExtensions((args) => { seen.push(args); return [] })
    const { container } = renderInRoom(makeFakeRoom())
    try {
      await waitFor(() => {
        assert.ok(
          container.querySelector('[data-pilotiq-collab-code="snippet"]'),
          'collab host mounted with the field name stamped',
        )
        assert.ok(container.querySelector('.cm-editor'), '.cm-editor mounted')
      })
      assert.equal(seen.length, 1, 'factory called once per mount')
      assert.ok(seen[0]!.ytext instanceof FakeYText, 'factory receives the resolved Y.Text share')
      assert.equal(seen[0]!.awareness, null, 'factory receives the (null) awareness handle')
      // Seed-on-sync path: defaultValue lands in the share once synced.
      await waitFor(() => {
        const t = seen[0]!.ytext as FakeYText
        assert.equal(t.toString(), 'const x = 1', 'empty share seeded from defaultValue')
      })
    } finally {
      cleanup()
    }
  })
})
