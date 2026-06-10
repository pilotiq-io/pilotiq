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
  // prosemirror-view ≥1.41 probes `root instanceof ShadowRoot` while
  // resolving the editor's event root.
  ShadowRoot:         window.ShadowRoot,
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

// jsdom has no layout engine and never implements elementFromPoint;
// prosemirror-view ≥1.41 calls it during view initialization.
if (typeof window.document.elementFromPoint !== 'function') {
  Object.defineProperty(window.document, 'elementFromPoint', {
    value: () => null,
    writable: true,
    configurable: true,
  })
}

// React 19 + RTL require `IS_REACT_ACT_ENVIRONMENT` so `act()` warnings
// don't fire on every render. Without it, Tiptap's mount cascade
// produces dozens of warnings that swamp real test failures.
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
