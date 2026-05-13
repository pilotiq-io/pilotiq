import type { CollabRoom } from './CollabRoomContext.js'

/**
 * Binding contract that a collab plugin returns from
 * `registerFormCollabBinding` — wraps a single form's value map in a
 * shared CRDT type (typically a `Y.Map` on the surrounding record's
 * `Y.Doc`) so every field on the form syncs across clients.
 *
 * Pilotiq's `FormStateProvider` calls into this contract when a
 * `<RecordCollabRoom>` is mounted up-tree:
 *
 *   - `get()` is read once on mount to overlay any already-synced
 *     state on top of the form's SSR-rendered defaults.
 *   - `set(name, v)` is called from `setValue` after the local React
 *     state update — every controlled field's edit lands in the CRDT.
 *   - `subscribe(fn)` registers a listener that fires when REMOTE
 *     changes land; `fn(snapshot)` receives the full updated map.
 *     The provider re-applies this snapshot onto its React state.
 *   - `destroy()` is called on unmount — gives the plugin a chance to
 *     remove its CRDT observer.
 *
 * `unknown` payloads keep pilotiq core Yjs-free; the binding owns its
 * own type knowledge. Same posture as `CollabExtensionFactory`.
 */
export interface FormCollabBinding {
  /** Snapshot of the current synced values. Called once on mount. */
  get():        Record<string, unknown>
  /** Write the local edit to the CRDT. Triggers a broadcast to peers. */
  set(name: string, value: unknown): void
  /** Subscribe to remote changes. Returns an unsubscribe function. */
  subscribe(fn: (snapshot: Record<string, unknown>) => void): () => void
  /** Cleanup hook called when the form unmounts. */
  destroy():    void
}

export interface FormCollabBindingFactoryArgs {
  /** Active collab room — provides `ydoc`, `provider`, `user`. Opaque to pilotiq core. */
  room:    CollabRoom
  /**
   * Form identifier — used by the binding to partition CRDT state when
   * multiple forms render against the same room (e.g. a record page that
   * shows a primary form plus a side-mounted action form). Most pages
   * only have one form, so most bindings use this as the `Y.Map` name.
   */
  formId:  string
  /**
   * Initial values from pilotiq's normal SSR resolution. The binding
   * uses these to perform the idempotent "first-load seed" (`!ymap.has(k)`
   * gated write) so the first client to open a record populates the
   * Y.Map with the DB-derived defaults; subsequent clients find the
   * map already populated and skip.
   */
  initial: Record<string, unknown>
}

export type FormCollabBindingFactory = (args: FormCollabBindingFactoryArgs) => FormCollabBinding

let _factory: FormCollabBindingFactory | null = null

/**
 * Register the form-level CRDT binding factory. Called once at boot by
 * `@pilotiq-pro/collab`'s plugin. No-op when no plugin registers —
 * `FormStateProvider` falls back to its plain local-state path.
 */
export function registerFormCollabBinding(factory: FormCollabBindingFactory): void {
  _factory = factory
}

/** Returns the registered binding factory, or `null`. */
export function getFormCollabBinding(): FormCollabBindingFactory | null {
  return _factory
}
