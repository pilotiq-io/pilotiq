import '../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React, { useState } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

afterEach(cleanup)

// Toolchain proof: happy-dom + React 19 + Testing Library + user-event all
// work under `node:test` after the `tsconfig.test.json` compile step. No
// pilotiq imports here — this only validates the harness itself. Real
// component tests live in `*.test.tsx` beside their components.
describe('test harness', () => {
  it('renders a component and queries the DOM', () => {
    render(<button type="button">Save</button>)
    assert.ok(screen.getByRole('button', { name: 'Save' }))
  })

  it('drives state updates through user-event', async () => {
    function Counter(): React.ReactElement {
      const [n, setN] = useState(0)
      return <button type="button" onClick={() => setN(n + 1)}>count: {n}</button>
    }
    const user = userEvent.setup()
    render(<Counter />)
    const btn = screen.getByRole('button')
    assert.equal(btn.textContent, 'count: 0')
    await user.click(btn)
    assert.equal(btn.textContent, 'count: 1')
  })
})
