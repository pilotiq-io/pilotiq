import '../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { SearchTrigger } from './SearchTrigger.js'
import { CommandPaletteProvider } from './CommandPalette.js'

// Phase 3c — the "Search… ⌘K" pill. Its whole contract is the opener
// context: render nothing when no `CommandPaletteProvider` is mounted
// (defensive — a panel embedded without AppShell), and open the palette
// on click otherwise.

afterEach(cleanup)

describe('SearchTrigger', () => {
  it('renders nothing outside a CommandPaletteProvider', () => {
    const { container } = render(<SearchTrigger />)
    assert.equal(container.firstChild, null)
  })

  it('opens the palette when clicked inside the provider', async () => {
    const opens: boolean[] = []
    render(
      <CommandPaletteProvider setOpen={(o) => opens.push(o)}>
        <SearchTrigger />
      </CommandPaletteProvider>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open search' }))
    assert.deepEqual(opens, [true])
  })
})
