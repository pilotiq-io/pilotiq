import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, cleanup, screen } from '@testing-library/react'

import { clampPanelWidth } from './BlockSidePanel.js'

/**
 * Phase 6e proof-of-concept — exercise React Testing Library's
 * `render()` against the jsdom environment that `src/test/setup.ts`
 * boots. The pure helper `clampPanelWidth` is already covered by the
 * neighbouring `BlockSidePanel.test.ts`; this file proves the RTL
 * surface (render / screen / cleanup) actually works in the test
 * harness — every future component-level test for `BlockSidePanel`,
 * `Toolbar`, `SlashMenu`, etc. uses the same primitives.
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

  it('exports clampPanelWidth as a stable pure helper (sanity)', () => {
    // Cross-check: pure-data assertions still work alongside RTL
    // mounts. `clampPanelWidth` is the helper tested via the
    // pure-mode `BlockSidePanel.test.ts` already — re-asserting one
    // case here confirms the dual-import surface (both pure tests
    // and DOM tests in the same package) doesn't conflict.
    assert.equal(clampPanelWidth(100), 240)
    assert.equal(clampPanelWidth(320), 320)
    assert.equal(clampPanelWidth(1000), 600)
  })
})
