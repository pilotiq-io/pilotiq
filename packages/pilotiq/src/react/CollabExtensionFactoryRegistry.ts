/**
 * Module-level registry slot for the Tiptap extension factory that turns
 * a collab room into editor-attachable extensions (`Collaboration` +
 * `CollaborationCursor`).
 *
 * Wiring posture (mirrors `PendingSuggestionOverlayRegistry`):
 *   - `@pilotiq-pro/collab`'s plugin calls `registerCollabExtensions(...)`
 *     once at boot from inside `register(panel)`. The factory closes over
 *     the `@tiptap/extension-collaboration` + `-cursor` imports, so pilotiq
 *     core (and `@pilotiq/tiptap`) never carry those as peer deps.
 *   - `@pilotiq/tiptap`'s `TiptapEditor` calls `getCollabExtensions()` at
 *     mount; if non-null AND a `useCollabRoom()` value is present, it calls
 *     the factory and spreads the returned array into the editor's
 *     `extensions` slot. If either is missing, plain Tiptap + History runs.
 *
 * `unknown[]` return type is deliberate — pilotiq core has zero `@tiptap/*`
 * imports and treats the returned values as opaque editor-extension refs.
 * The Tiptap host trusts them and spreads them in.
 */
export interface CollabExtensionFactoryArgs {
  /** `Y.Doc` for the surrounding record. Opaque to pilotiq core. */
  ydoc:      unknown
  /** `WebsocketProvider` for the same room. Opaque to pilotiq core. */
  provider:  unknown
  /**
   * Field name — becomes the `Y.XmlFragment` selector
   * (`Collaboration.configure({ field: fieldName })`) so multiple
   * collab editors on the same record write to distinct fragments
   * inside one shared ydoc.
   */
  fieldName: string
  /** Presence info forwarded to `CollaborationCursor`. Sparse. */
  user?: {
    name?:  string
    color?: string
  }
}

export type CollabExtensionFactory = (args: CollabExtensionFactoryArgs) => unknown[]

let _factory: CollabExtensionFactory | null = null

/**
 * Register the factory that builds collab extensions for one field +
 * room. Called once at boot by `@pilotiq-pro/collab`'s plugin. No-op when
 * no plugin registers — Tiptap renderers fall back to plain editing.
 */
export function registerCollabExtensions(factory: CollabExtensionFactory): void {
  _factory = factory
}

/** Returns the registered factory, or `null`. */
export function getCollabExtensions(): CollabExtensionFactory | null {
  return _factory
}
