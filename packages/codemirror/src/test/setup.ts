/**
 * Phase 6e test setup — boots jsdom into globalThis so React Testing
 * Library + Tiptap render against a real-ish DOM. Loaded via the test
 * script's `--import` flag *before* any test file is imported, so React
 * sees the DOM globals at module-load time (RTL's `cleanup()` and
 * `render()` both expect `document` + `window` to exist as globals).
 *
 * We register a minimal subset of DOM globals: the rest hang off
 * `window`, which is how the browser code under test reaches them. The
 * `assign` helper preserves `globalThis`'s native bindings (e.g. Node's
 * `URL`) when jsdom exports a shadowing constructor that breaks
 * downstream code (Tiptap uses `URL` in extension-link's autolink
 * heuristic).
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url:               'http://localhost/',
  pretendToBeVisual: true,
})

const window = dom.window as unknown as Window & typeof globalThis

// jsdom doesn't ship `matchMedia`; CodeMirror's `EditorView.theme` queries
// `(prefers-color-scheme: dark)` at mount under `@uiw/react-codemirror` when
// the user picks the `auto` theme. Stub returns "no match" so the editor
// resolves to its default theme — sufficient for behavioral tests that
// assert mount + DOM shape rather than dark-mode-specific styling.
if (typeof window.matchMedia !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).matchMedia = (query: string) => ({
    matches:       false,
    media:         query,
    onchange:      null,
    addListener:    () => {},
    removeListener: () => {},
    addEventListener:    () => {},
    removeEventListener: () => {},
    dispatchEvent:       () => false,
  })
}

// Properties that Tiptap, React 19, and RTL touch directly via the
// global namespace (rather than via the captured `window` reference).
// Keep this list tight — every override is a place where jsdom and Node
// can diverge subtly.
const globals: Record<string, unknown> = {
  window,
  document:           window.document,
  navigator:          window.navigator,
  HTMLElement:        window.HTMLElement,
  HTMLInputElement:   window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLAnchorElement:  window.HTMLAnchorElement,
  HTMLDivElement:     window.HTMLDivElement,
  HTMLSpanElement:    window.HTMLSpanElement,
  Element:            window.Element,
  Node:               window.Node,
  Text:               window.Text,
  Event:              window.Event,
  MouseEvent:         window.MouseEvent,
  KeyboardEvent:      window.KeyboardEvent,
  CustomEvent:        window.CustomEvent,
  DocumentFragment:   window.DocumentFragment,
  Range:              window.Range,
  Selection:          window.Selection,
  MutationObserver:   window.MutationObserver,
  IntersectionObserver: window.IntersectionObserver,
  ResizeObserver:     window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} },
  DOMRect:            window.DOMRect,
  getComputedStyle:   window.getComputedStyle.bind(window),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
  cancelAnimationFrame:  (id: number) => clearTimeout(id),
}

for (const [k, v] of Object.entries(globals)) {
  Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true })
}

// React 19 + RTL require `IS_REACT_ACT_ENVIRONMENT` so `act()` warnings
// don't fire on every render. Without it, Tiptap's mount cascade
// produces dozens of warnings that swamp real test failures.
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
