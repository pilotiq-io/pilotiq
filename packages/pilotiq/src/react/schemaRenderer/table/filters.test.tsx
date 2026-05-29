import '../../../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { NavigateProvider } from '../../navigate.js'
import { fakeColumnMeta } from '../../../__test__/fakes.js'
import type { ElementMeta } from '../../../schema/Element.js'
import { SortByPicker, ColumnsToggleDropdown, FilterPopover } from './filters.js'

// Phase 2c — table-toolbar popover chrome. These three pieces are the last
// untested base-ui surfaces in the table layer: a Select (SortByPicker), a
// DropdownMenu (ColumnsToggleDropdown), and a Popover wrapping filter widgets
// (FilterPopover). All three mount their body in a portal that only appears
// once the trigger is opened — the happy-dom portal audit (see the CellSelect
// note) confirmed `userEvent.click` opens them and the contents are queryable.
// SortByPicker/ColumnsToggleDropdown are pure-prop (assert the callbacks);
// FilterPopover reads `useNavigate`, so it renders under a NavigateProvider
// and we capture the URL patch the filter widget pushes.

afterEach(cleanup)

const sortable = (name: string): ElementMeta => ({ ...fakeColumnMeta(name), sortable: true })

describe('SortByPicker', () => {
  it('renders nothing when no column is sortable', () => {
    const { container } = render(
      <SortByPicker columns={[fakeColumnMeta('title')]} active={undefined} onChange={() => {}} />,
    )
    assert.equal(container.innerHTML, '')
  })

  it('fires onChange with the chosen column + direction', async () => {
    const calls: Array<[string, string]> = []
    render(
      <SortByPicker
        columns={[sortable('title'), sortable('createdAt')]}
        active={undefined}
        onChange={(c, d) => calls.push([c, d])}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'CreatedAt (Z→A)' }))
    assert.deepEqual(calls, [['createdAt', 'desc']])
  })

  it('reflects the active sort on base-ui\'s hidden input', () => {
    render(
      <SortByPicker
        columns={[sortable('title')]}
        active={{ column: 'title', direction: 'asc' }}
        onChange={() => {}}
      />,
    )
    const hidden = document.querySelector<HTMLInputElement>('input[id$="-hidden-input"]')
    assert.equal(hidden?.getAttribute('value'), 'title:asc')
  })
})

describe('ColumnsToggleDropdown', () => {
  const columns = [fakeColumnMeta('title'), fakeColumnMeta('status')]

  it('toggles a visible column to hidden on click', async () => {
    const calls: Array<[string, boolean]> = []
    render(
      <ColumnsToggleDropdown
        columns={columns}
        hidden={new Set()}
        onToggle={(n, h) => calls.push([n, h])}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Show or hide columns' }))
    await user.click(await screen.findByText('Title'))
    assert.deepEqual(calls, [['title', true]])
  })

  it('reports the un-hide direction for an already-hidden column', async () => {
    const calls: Array<[string, boolean]> = []
    render(
      <ColumnsToggleDropdown
        columns={columns}
        hidden={new Set(['status'])}
        onToggle={(n, h) => calls.push([n, h])}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Show or hide columns' }))
    await user.click(await screen.findByText('Status'))
    assert.deepEqual(calls, [['status', false]])
  })

  it('stays open across clicks so multiple columns toggle in one pass', async () => {
    const calls: Array<[string, boolean]> = []
    render(
      <ColumnsToggleDropdown
        columns={columns}
        hidden={new Set()}
        onToggle={(n, h) => calls.push([n, h])}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Show or hide columns' }))
    await user.click(await screen.findByText('Title'))
    // The menu didn't close (closeOnClick={false}) — the second item is still
    // mounted and clickable without re-opening the trigger.
    await user.click(screen.getByText('Status'))
    assert.deepEqual(calls, [['title', true], ['status', true]])
  })
})

describe('FilterPopover', () => {
  const selectFilter: ElementMeta = {
    type: 'filter',
    name: 'status',
    label: 'Status',
    kind: 'select',
    placeholder: 'All',
    options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }],
  }
  const noopChild = () => null

  function renderPopover(filters: ElementMeta[], navigate: (url: string) => void = () => {}) {
    return render(
      <NavigateProvider navigate={navigate}>
        <FilterPopover filters={filters} renderFormChild={noopChild} />
      </NavigateProvider>,
    )
  }

  it('renders the Filters trigger with no active-count badge when nothing is set', () => {
    renderPopover([selectFilter])
    const trigger = screen.getByRole('button', { name: 'Filters' })
    assert.ok(trigger)
    assert.equal(trigger.textContent?.includes('Filters'), true)
    // No numeric badge — the only text is the label.
    assert.equal(/\d/.test(trigger.textContent ?? ''), false)
  })

  it('shows the active-count badge for filters carrying a value', () => {
    renderPopover([{ ...selectFilter, value: 'draft' }])
    const trigger = screen.getByRole('button', { name: 'Filters' })
    assert.match(trigger.textContent ?? '', /1/)
  })

  it('reveals the filter controls once opened', async () => {
    renderPopover([selectFilter])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    // The select filter's label appears in the portal-mounted popover body.
    assert.ok(await screen.findByText('Status'))
  })

  it('pushes a URL patch when a filter value is chosen', async () => {
    const navigated: string[] = []
    renderPopover([selectFilter], (url: string) => { navigated.push(url) })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    // The popover hosts a base-ui Select; open it and pick an option.
    await user.click(await screen.findByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Published' }))
    await waitFor(() => assert.equal(navigated.length >= 1, true))
    assert.match(navigated[navigated.length - 1]!, /status=published/)
  })
})
