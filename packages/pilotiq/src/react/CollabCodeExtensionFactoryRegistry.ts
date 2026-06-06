/**
 * Module-level registry slot for the CodeMirror extension factory that
 * turns a collab room's `Y.Text` into editor-attachable extensions
 * (`yCollab` binding + the Yjs undo keymap).
 *
 * Sibling of `CollabExtensionFactoryRegistry` (the Tiptap slot) — same
 * wiring posture:
 *   - `@pilotiq-pro/collab`'s plugin calls
 *     `registerCollabCodeExtensions(...)` once at boot from inside
 *     `register(panel)`. The factory closes over the `y-codemirror.next`
 *     import, so pilotiq core AND `@pilotiq/codemirror` never carry
 *     `y-codemirror.next` / `yjs` as required peer deps.
 *   - `@pilotiq/codemirror`'s `CodeMirrorEditor` calls
 *     `getCollabCodeExtensions()` at mount; if non-null AND a
 *     `useCollabRoom()` value is present, the collab editor mounts and
 *     spreads the factory's returned array into its CodeMirror
 *     extensions. If either is missing, the plain local editor runs.
 *
 * `unknown[]` return type is deliberate — pilotiq core has zero
 * `@codemirror/*` imports and treats the returned values as opaque
 * editor-extension refs. The CodeMirror host trusts them and spreads
 * them in.
 */
export interface CollabCodeExtensionFactoryArgs {
  /**
   * The field's `Y.Text` share (already resolved from the room's ydoc
   * via the fragment-key convention — top-level fields use the bare
   * name, Repeater/Builder row leaves `${arrayName}.${rowId}.${fieldName}`).
   * Opaque to pilotiq core.
   */
  ytext:     unknown
  /**
   * The provider's `awareness` handle for remote-cursor presence, or
   * `null` when the provider doesn't expose one (cursor decorations
   * are disabled cleanly downstream).
   */
  awareness: unknown
}

export type CollabCodeExtensionFactory = (args: CollabCodeExtensionFactoryArgs) => unknown[]

let _factory: CollabCodeExtensionFactory | null = null

/**
 * Register the factory that builds CodeMirror collab extensions for one
 * field + room. Called once at boot by `@pilotiq-pro/collab`'s plugin.
 * No-op when no plugin registers — code editors fall back to plain
 * local editing.
 */
export function registerCollabCodeExtensions(factory: CollabCodeExtensionFactory): void {
  _factory = factory
}

/** Returns the registered factory, or `null`. */
export function getCollabCodeExtensions(): CollabCodeExtensionFactory | null {
  return _factory
}
