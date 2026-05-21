import type { ComponentType } from 'react'

/**
 * Module-level registry slot for the collab-aware plain-text editor renderer.
 *
 * Wiring posture (mirrors `CollabExtensionFactoryRegistry` /
 * `FormCollabBindingRegistry`):
 *   - `@pilotiq/tiptap`'s `registerTiptap(...)` calls `registerCollabTextRenderer(...)`
 *     once at boot. The registered component closes over `@tiptap/*` imports so
 *     pilotiq core stays free of any tiptap peer dep — same posture as the
 *     existing rich-text renderer registry.
 *   - `TextLikeInput` checks for the registered component when a `<RecordCollabRoom>`
 *     is mounted up-tree AND the field hasn't opted out via `.collab(false)` AND
 *     the field has no `.mask()`. If present, the legacy `BoundTextInput`
 *     (Y.Text + `computeDelta` + heuristic `preserveCursor`) is bypassed in
 *     favour of a y-prosemirror-backed Tiptap editor that anchors selections to
 *     `Yjs.RelativePosition` — the architectural fix for the cursor-jump and
 *     two-peer concurrent-insert races documented in
 *     `docs/plans/text-fields-tiptap-backed-collab.md`.
 *
 * Wire props are deliberately framework-agnostic — the renderer doesn't take a
 * `binding` since it consumes the room's `ydoc` directly via the existing
 * `useCollabRoom()` + `getCollabExtensions()` plumbing on its own side. Core
 * keeps the seam narrow: handler callbacks + DOM chrome only.
 */
export interface CollabTextRendererProps {
  /**
   * Field name — drives the FormData hidden input AND the routing key
   * for AI suggestion delivery (chip widget, applier registry). For
   * Repeater / Builder row leaves this is the dotted positional path
   * (`items.0.title`).
   */
  name: string
  /**
   * Collab-stable identifier for the `Y.XmlFragment` selector. When
   * present, the renderer binds its collab fragment under this key
   * instead of `name`. Row leaves pass a row-id-anchored composite
   * (`items.<rowId>.title`) so the fragment survives reorders even
   * as the dotted positional `name` shifts. Top-level fields omit
   * it — `name` is stable on its own.
   *
   * AI suggestion routing continues to use `name` regardless. Tool
   * calls reference fields by their positional FormData name, not
   * the collab-stable composite.
   */
  fragmentKey?: string
  /** `true` for textarea-like (multiple paragraphs); `false` for input-like. */
  multiline: boolean
  /**
   * Server-rendered default value. The renderer is expected to seed the
   * `Y.XmlFragment` from this on first connect when the room has no
   * persisted state for this field (i.e. brand-new record).
   */
  defaultValue: string
  /** Optional placeholder hint. */
  placeholder?: string
  /** Disabled / read-only state. */
  disabled?: boolean
  /** Fired on every editor `update` with the editor's current plain text. */
  onChange: (text: string) => void
  /** Fired on editor blur — host wires this to live-onBlur trigger semantics. */
  onBlur: () => void
  /**
   * Single-line submit — fired when `multiline: false` AND the user presses
   * Enter. The renderer is expected to blur the editor after invoking this.
   * Multiline mode ignores it (Enter inserts a paragraph instead).
   */
  onSubmit?: () => void
  /**
   * Tailwind className applied to the editor's contenteditable wrapper so the
   * rendered editor matches the native `<input>` / `<textarea>` chrome it
   * replaces. The host owns the styling — the adapter just forwards.
   */
  className?: string
  /**
   * Additional DOM attributes for the editor's contenteditable wrapper —
   * typically `id`, `aria-*`, `autocomplete`, etc.
   */
  editorAttributes?: Record<string, string>
}

export type CollabTextRenderer = ComponentType<CollabTextRendererProps>

let _renderer: CollabTextRenderer | null = null

/**
 * Register the collab plain-text editor component. Called once at boot by
 * `@pilotiq/tiptap`'s `registerTiptap()` (or directly by an app that imports
 * the renderer). Calling with `null` clears the registry — useful for tests.
 *
 * No-op behaviour when no renderer is registered: `TextLikeInput` falls back
 * to the legacy `BoundTextInput` path (or the plain controlled / uncontrolled
 * input when no collab room is mounted).
 */
export function registerCollabTextRenderer(component: CollabTextRenderer | null): void {
  _renderer = component
}

/** Returns the registered component, or `null` when no adapter is installed. */
export function getCollabTextRenderer(): CollabTextRenderer | null {
  return _renderer
}
