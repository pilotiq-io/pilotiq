import '../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { AppShell, type AppShellProps } from './AppShell.js'
import type { NavItem } from '../pageData.js'
import type { RightPanelProps } from '../RightPanel.js'

// Phase 4 — chrome smoke. AppShell self-mounts every chrome provider
// (Toaster / CommandPalette / ComponentRegistry / RightPanelRegistry /
// CurrentUser), so rendering it exercises the full sidebar/topbar tree
// end-to-end — exactly the kind of mount-time path the original
// rules-of-hooks regressions lived in. We assert nav renders, the active
// route highlights, and the page body comes through, under both layouts.

afterEach(() => {
  cleanup()
  document.documentElement.className = ''
  window.localStorage.clear()
})

const NAV: NavItem[] = [
  { name: 'articles', label: 'Articles', url: '/admin/articles', group: 'Content' },
  { name: 'users', label: 'Users', url: '/admin/users', group: 'Content' },
]

function panel(over: Partial<AppShellProps['panel']> = {}): AppShellProps['panel'] {
  return { name: 'Admin', branding: { title: 'Admin' }, navigation: NAV, userMenu: null, ...over }
}

describe('AppShell chrome', () => {
  it('renders the sidebar layout with nav links, active route, and page body', () => {
    render(
      <AppShell panel={panel()} basePath="/admin" currentPath="/admin/articles">
        <div>Page body</div>
      </AppShell>,
    )
    assert.ok(screen.getByText('Page body'))
    const articles = screen.getByRole('link', { name: 'Articles' })
    const users = screen.getByRole('link', { name: 'Users' })
    assert.match(articles.getAttribute('href') ?? '', /\/admin\/articles$/)
    // The current route's link highlights and the sibling does not — assert
    // they differ rather than pinning base-ui's exact data-active encoding.
    assert.notEqual(articles.getAttribute('data-active'), users.getAttribute('data-active'))
  })

  it('renders the brand title', () => {
    render(
      <AppShell panel={panel({ branding: { title: 'Acme Admin' } })} basePath="/admin" currentPath="/admin">
        <div>Body</div>
      </AppShell>,
    )
    assert.ok(screen.getByText('Acme Admin'))
  })

  it('forwards the breadcrumb leaf as recordTitle to the active right panel', () => {
    // The breadcrumb's last crumb is the record title on a record page; it
    // should reach the right-panel pane as `RightPanelProps.recordTitle`.
    let captured: RightPanelProps | undefined
    const Pane = (props: RightPanelProps): React.ReactElement => {
      captured = props
      return <div>pane</div>
    }
    // Open the panel (provider rehydrates from localStorage on mount; activeId
    // defaults to the first contribution).
    window.localStorage.setItem('pilotiq.rightSidebar./admin.open', 'true')

    render(
      <AppShell
        panel={panel({ rightSidebar: { panels: [{ id: 'ai.chat', label: 'AI', defaultWidth: 360 }], defaultWidth: 360, minWidth: 240, maxWidth: 800 } })}
        basePath="/admin"
        currentPath="/admin/posts/42"
        breadcrumb={{ type: 'breadcrumbs', items: [{ label: 'Posts', url: '/admin/posts' }, { label: 'My First Post' }] }}
        rightPanelRegistry={{ 'ai.chat': Pane }}
      >
        <div>Body</div>
      </AppShell>,
    )

    assert.equal(captured?.recordTitle, 'My First Post')
    assert.equal(captured?.currentPath, '/admin/posts/42')
    assert.equal(captured?.basePath, '/admin')
  })

  it('mounts the topbar layout variant (grouped nav folds into dropdowns)', () => {
    // The topbar collapses each nav group into a dropdown trigger, so the
    // item links aren't in the DOM until opened. This is a mount smoke —
    // it proves the whole topbar chrome tree renders without throwing —
    // plus the brand + page body, which are always present.
    render(
      <AppShell layout="topbar" panel={panel()} basePath="/admin" currentPath="/admin/articles">
        <div>Topbar body</div>
      </AppShell>,
    )
    assert.ok(screen.getByText('Topbar body'))
    assert.ok(screen.getByText('Admin')) // brand title
  })
})
