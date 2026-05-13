import type { ElementMeta } from '../schema/Element.js'
import type { CollabRoom } from './CollabRoomContext.js'

/**
 * Phase F.6 — character-level edit op emitted by `TextLikeInput` and
 * applied through `TextBinding.applyDelta`. `replace` covers IME / paste
 * / multi-char selections; `insert` and `delete` cover the single-key
 * common path. Pilotiq core stays Yjs-free — the binding impl in
 * `@pilotiq-pro/collab` translates these into `Y.Text.insert / delete`
 * inside a transaction.
 */
export type TextDelta =
  | { kind: 'insert',  index: number,  text: string }
  | { kind: 'delete',  index: number,  length: number }
  | { kind: 'replace', from:  number,  to: number, text: string }

/**
 * Phase F.6 — per-field character-level CRDT handle. Issued by
 * `FormCollabBinding.getTextBinding(name)` for text-shaped fields
 * (`TextField / TextareaField / EmailField / SlugField / MarkdownField`);
 * returns `null` for non-text fields or text fields opted out via
 * `.collab(false)`. The surface stays intentionally narrow so pilotiq
 * core never touches Yjs directly — same posture as `FormCollabBinding`.
 *
 *   - `read()` returns the current full string. `TextLikeInput` calls
 *     this once on mount to seed its controlled value.
 *   - `applyDelta(delta)` is called from `onInput` events with a single
 *     `insert / delete / replace` op derived from the input's selection.
 *   - `observe(fn)` registers a remote-change listener; `fn(next)`
 *     receives the post-change string. Returns an unsubscribe function.
 *   - `destroy()` cleans up everything the handle holds. The owning
 *     `FormCollabBinding.destroy()` is expected to cascade — consumers
 *     don't need to call this directly.
 */
export interface TextBinding {
  read():     string
  applyDelta(delta: TextDelta): void
  observe(fn: (next: string) => void): () => void
  destroy():  void
}

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
 *   - `getTextBinding(name)` (Phase F.6) returns a `Y.Text`-backed
 *     handle for text-shaped fields, or `null` for non-text fields and
 *     text fields opted out via `.collab(false)`. The text/non-text
 *     allowlist lives in the binding impl — `FormStateProvider` asks
 *     for every field and routes per-field on the answer.
 *   - `destroy()` is called on unmount — gives the plugin a chance to
 *     remove its CRDT observer. Implementations are expected to cascade
 *     into every `TextBinding` they issued.
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
  /** Phase F.6 — per-field text-CRDT handle. Returns `null` for non-text
   *  fields or text fields opted out via `.collab(false)`. Optional so
   *  existing F1-era plugins keep type-checking without a no-op stub;
   *  when absent, every text field stays on today's whole-string LWW
   *  path (i.e. F.6 character-level CRDT is opt-in by impl). */
  getTextBinding?(name: string): TextBinding | null
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
  /**
   * Phase F.6 — initial form meta from the server. The binding walks
   * this once at construction to decide which fields are text-shaped
   * (`fieldType ∈ { text, textarea, email, slug, markdown }`) and
   * which have opted out via `.collab(false)`. Text fields get a
   * dedicated `Y.Text` and route through `getTextBinding`; non-text
   * fields stay on the `Y.Map`. The meta is captured at mount; later
   * structural changes from `live()` re-resolves aren't re-walked
   * (rare in practice — dynamic field add/remove is an F-followup).
   */
  formMeta: ElementMeta
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
