import '../../../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { CardsLayoutBody } from './CardsLayoutBody.js'
import type { ElementMeta } from '../../../schema/Element.js'

// Phase 2b — the `contentLayout('cards')` body. It renders one card per
// row, painting each row's server-stamped `_cardChildren` schema through
// the injected `renderElement`. We stub a minimal renderElement (text
// leaves) and assert: card-per-row, empty state, group-section headings,
// and group collapse hiding a section's cards.

afterEach(cleanup)

// Minimal element renderer — just enough to surface card content text.
const renderElement = (el: ElementMeta, i: number): React.ReactNode =>
  <span key={i}>{String(el['text'] ?? '')}</span>
const renderRowActions = () => null

function card(text: string): ElementMeta[] {
  return [{ type: 'text', text }]
}

// Defaults for the (many) required props — overlay per test.
function baseProps(over: Partial<React.ComponentProps<typeof CardsLayoutBody>> = {}): React.ComponentProps<typeof CardsLayoutBody> {
  return {
    rows: [],
    visibleIds: [],
    selected: new Set<string>(),
    toggleRow: () => {},
    hasBulkActions: false,
    hasRowActions: false,
    rowActions: [],
    hasRecordUrl: false,
    hasRecordClasses: false,
    activeEmpty: undefined,
    EmptyIcon: () => null,
    hasFilterOrSearch: false,
    defaultGroup: undefined,
    groupColumnLabel: undefined,
    groupCollapsible: false,
    collapsedGroups: {},
    toggleGroupCollapsed: () => {},
    cardsPerRow: undefined,
    navigate: () => {},
    renderElement,
    renderRowActions,
    ...over,
  }
}

describe('CardsLayoutBody', () => {
  it('renders one card per row with its card-children content', () => {
    render(<CardsLayoutBody {...baseProps({
      rows: [{ _cardChildren: card('First card') }, { _cardChildren: card('Second card') }],
      visibleIds: ['1', '2'],
    })} />)
    assert.ok(screen.getByText('First card'))
    assert.ok(screen.getByText('Second card'))
  })

  it('shows the empty state with no rows', () => {
    render(<CardsLayoutBody {...baseProps({ rows: [], visibleIds: [] })} />)
    assert.ok(screen.getByText('No records yet'))
  })

  it('falls back to a placeholder when a card has no configured content', () => {
    render(<CardsLayoutBody {...baseProps({
      rows: [{ _cardChildren: [] }],
      visibleIds: ['1'],
    })} />)
    assert.ok(screen.getByText('No card content configured.'))
  })

  it('bands cards into group sections and folds a collapsed section', async () => {
    const rows = [
      { _cardChildren: card('Sam one'), _groupValue: 'sam', _groupTitle: 'Group Sam' },
      { _cardChildren: card('Lee one'), _groupValue: 'lee', _groupTitle: 'Group Lee' },
    ]
    let collapsed: Record<string, boolean> = {}
    const { rerender } = render(<CardsLayoutBody {...baseProps({
      rows, visibleIds: ['1', '2'],
      defaultGroup: 'author', groupCollapsible: true,
      collapsedGroups: collapsed,
      toggleGroupCollapsed: (v) => { collapsed = { ...collapsed, [v]: !collapsed[v] } },
    })} />)
    assert.ok(screen.getByText('Group Sam'))
    assert.ok(screen.getByText('Group Lee'))
    assert.ok(screen.getByText('Sam one'))

    // Collapse the Sam section, then re-render with the new fold state.
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Collapse group' })[0]!)
    rerender(<CardsLayoutBody {...baseProps({
      rows, visibleIds: ['1', '2'],
      defaultGroup: 'author', groupCollapsible: true,
      collapsedGroups: collapsed,
      toggleGroupCollapsed: () => {},
    })} />)
    assert.equal(screen.queryByText('Sam one'), null) // folded
    assert.ok(screen.getByText('Lee one'))            // other section intact
  })
})
