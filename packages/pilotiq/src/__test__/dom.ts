// Registers a happy-dom environment into the Node process so React
// components can render under `node:test`. Render tests MUST import this
// module FIRST (before React / Testing Library), e.g.
//
//   import '../__test__/dom.js'
//   import { renderWithProviders } from '../__test__/renderWithProviders.js'
//
// ESM evaluates imported modules in source order, so importing this first
// guarantees the DOM globals exist before `react-dom` is loaded. This file
// deliberately imports nothing from React / Testing Library — doing so would
// pull `react-dom` in before the globals are registered.
//
// `node --test` runs each test file in its own process, so registering the
// DOM here does not leak into the ~3,100 pure (DOM-free) tests.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
  GlobalRegistrator.register()
}

// A couple of browser APIs happy-dom doesn't implement that pilotiq
// components touch on mount. Stub them as no-ops so a render doesn't throw.
// Extend this list as new gaps surface — and document each here.
const g = globalThis as Record<string, unknown>
if (typeof g['matchMedia'] === 'undefined') {
  g['matchMedia'] = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
