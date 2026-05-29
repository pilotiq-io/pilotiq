import '../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { CommandPalette } from './CommandPalette.js'
import { jsonFetch } from '../__test__/fakes.js'
import type { NavItem } from '../pageData.js'
import type { GlobalSearchResult } from '../search.js'

// Phase 3b — the ⌘K command palette. It exposes clean test seams
// (`fetchImpl`, `navigateOverride`, controlled `open`/`onOpenChange`) so
// no provider stack is needed. We drive the controlled-open path and
// assert: empty input → quick-nav from the navigation tree; typing →
// debounced search results; ↑/↓ + Enter → navigate; Escape → close.
//
// `import '../__test__/dom.js'` is one level up from the fields tests
// because this file lives in `react/`, not `react/fields/`.

afterEach(cleanup)

const NAV: NavItem[] = [
  { name: 'articles', label: 'Articles', url: '/admin/articles', group: 'Content' },
  { name: 'users', label: 'Users', url: '/admin/users', group: 'Content' },
]

function result(over: Partial<GlobalSearchResult> = {}): GlobalSearchResult {
  return {
    resource: 'articles',
    resourceLabel: 'Articles',
    id: '1',
    title: 'Hello world',
    url: '/admin/articles/1',
    ...over,
  }
}

describe('CommandPalette', () => {
  it('shows flattened navigation entries when the query is empty', () => {
    render(
      <CommandPalette
        basePath="/admin"
        navigation={NAV}
        open
        onOpenChange={() => {}}
        navigateOverride={() => {}}
      />,
    )
    assert.ok(screen.getByText('Articles'))
    assert.ok(screen.getByText('Users'))
  })

  it('fetches and renders search results after debounce when typing', async () => {
    render(
      <CommandPalette
        basePath="/admin"
        navigation={NAV}
        open
        onOpenChange={() => {}}
        navigateOverride={() => {}}
        fetchImpl={jsonFetch(() => ({ ok: true, results: [result({ title: 'Post one' })] }))}
      />,
    )
    await userEvent.setup().type(screen.getByRole('textbox'), 'po')
    assert.ok(await screen.findByText('Post one'))
  })

  it('navigates to the active entry on Enter', async () => {
    const navigated: string[] = []
    render(
      <CommandPalette
        basePath="/admin"
        navigation={NAV}
        open
        onOpenChange={() => {}}
        navigateOverride={(url) => navigated.push(url)}
        fetchImpl={jsonFetch(() => ({ ok: true, results: [result({ url: '/admin/articles/42', title: 'Answer' })] }))}
      />,
    )
    const user = userEvent.setup()
    const input = screen.getByRole('textbox')
    await user.type(input, 'an')
    await screen.findByText('Answer') // results arrived; active defaults to row 0
    await user.keyboard('{Enter}')
    // go() is deferred to a microtask so the close transition fires first.
    await waitFor(() => assert.deepEqual(navigated, ['/admin/articles/42']))
  })

  it('closes on Escape', async () => {
    const opens: boolean[] = []
    render(
      <CommandPalette
        basePath="/admin"
        navigation={NAV}
        open
        onOpenChange={(o) => opens.push(o)}
        navigateOverride={() => {}}
      />,
    )
    await userEvent.setup().type(screen.getByRole('textbox'), '{Escape}')
    assert.ok(opens.includes(false))
  })
})
