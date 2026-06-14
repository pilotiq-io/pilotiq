import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, cleanup, screen } from '@testing-library/react'

/**
 * Proof that React Testing Library's `render()` works against the jsdom
 * environment `src/test/setup.ts` boots — the shared harness every future
 * component-level test (Toolbar, SlashMenu, NodeViews, …) builds on.
 */
describe('RTL render() (DOM)', () => {
  it('renders a trivial React tree and queries it via `screen`', () => {
    render(<div data-testid="probe">hello tiptap</div>)
    try {
      const node = screen.getByTestId('probe')
      assert.equal(node.textContent, 'hello tiptap')
    } finally {
      cleanup()
    }
  })
})
