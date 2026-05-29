import '../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './ThemeProvider.js'
import { resolveTheme } from '../theme/index.js'

// Phase 4 — theme chrome. ThemeProvider owns light/dark/system state, the
// `<html>` class, localStorage persistence, and CSS-variable injection.
// These mutate process-global DOM state, so we reset it between cases.

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.className = ''
  document.getElementById('pilotiq-theme')?.remove()
})

function Probe() {
  const { theme, resolved, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolved}</span>
      <button type="button" onClick={() => setTheme('dark')}>go dark</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  it('applies the chosen theme to <html> and persists it', async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    await userEvent.setup().click(screen.getByText('go dark'))
    assert.equal(screen.getByTestId('theme').textContent, 'dark')
    assert.equal(screen.getByTestId('resolved').textContent, 'dark')
    assert.ok(document.documentElement.classList.contains('dark'))
    assert.equal(localStorage.getItem('pilotiq-theme'), 'dark')
  })

  it('reads the persisted theme from localStorage on mount', async () => {
    localStorage.setItem('pilotiq-theme', 'dark')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    await waitFor(() => assert.equal(screen.getByTestId('theme').textContent, 'dark'))
    assert.ok(document.documentElement.classList.contains('dark'))
  })

  it('injects a <style> block of CSS variables when a resolved theme is provided', () => {
    render(<ThemeProvider theme={resolveTheme({})}><Probe /></ThemeProvider>)
    const style = document.getElementById('pilotiq-theme')
    assert.ok(style)
    assert.ok((style!.textContent ?? '').includes(':root'))
  })
})
