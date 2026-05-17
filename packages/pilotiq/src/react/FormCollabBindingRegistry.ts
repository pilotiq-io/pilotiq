import type { ElementMeta } from '../schema/Element.js'
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
 * Text-field character-level CRDT lives in `@pilotiq/tiptap`'s
 * `CollabTextRenderer` (`Y.XmlFragment` per field, keyed by bare name
 * for top-level + `${arrayName}.${rowId}.${fieldName}` composite for
 * row leaves) — pilotiq core no longer mediates per-field text CRDT,
 * so this binding only handles non-text values + row lifecycle.
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

  // ── Phase F.5 — Repeater / Builder row-identity surface (all optional) ──

  /**
   * Add a row to a Repeater or Builder field. `rowId` is the stable
   * `__id` the renderer already mints (UUID for new rows / DB PK for
   * relationship-backed rows) — the binding indexes the row's CRDT
   * surface by this id so concurrent inserts from peers both survive.
   *
   * Idempotent — calling with a `rowId` that already exists in the
   * Repeater's array is a no-op. `initial` may carry pre-filled values
   * for the new row (e.g. the inner fields' `default()` from schema
   * resolution); the binding seeds them onto the row's storage under
   * the same idempotent posture as top-level `set` (first writer wins
   * across concurrent first-mounters).
   *
   * Renderer call sites: `RepeaterInput.addRow()` + `BuilderInput.addBlock()`.
   * When absent, F.5 row-level CRDT degrades to v1 behaviour (whole-array
   * LWW under the top-level Y.Map).
   */
  addRow?(arrayName: string, rowId: string, initial: Record<string, unknown>): void

  /**
   * Remove a row from a Repeater/Builder field by stable id. Idempotent
   * — a missing `rowId` is a no-op. Triggered by the renderer's row
   * delete button.
   */
  removeRow?(arrayName: string, rowId: string): void

  /**
   * Apply a new row order. `newOrder` is the full list of row ids in
   * their final positions; the binding computes the minimal CRDT move
   * sequence and applies it inside a single transaction (peers see one
   * coalesced update, not N intermediate states).
   *
   * Called by drag-and-drop / up-down move handlers in
   * `RepeaterInput` + `BuilderInput`.
   */
  reorderRows?(arrayName: string, newOrder: string[]): void

  /**
   * Write a single field on a row. Replaces the dotted-path `set` for
   * row leaves (`tags.0.label` → `setRow('tags', rowId, 'label', value)`).
   * Non-text row fields land on the row's scalar field-map under LWW;
   * text row fields don't flow through here — the Tiptap renderer
   * writes them directly to a `Y.XmlFragment` at the doc root keyed by
   * `${arrayName}.${rowId}.${fieldName}`.
   *
   * `FormStateProvider` calls this on every local edit when both a
   * dotted-path name is being written AND `setRow` is implemented;
   * otherwise the v1 skip-on-dot path runs.
   */
  setRow?(arrayName: string, rowId: string, fieldName: string, value: unknown): void

  /**
   * Subscribe to row-lifecycle events for a Repeater/Builder array.
   * Fires on remote add / remove / move; the renderer reconciles its
   * `rows` state by `__id`. Local mutations fire too — the renderer
   * deduplicates by checking whether the event's `rowId` matches one
   * it just dispatched itself (the binding's roundtrip + the
   * renderer's optimistic update converge).
   */
  subscribeRows?(arrayName: string, fn: (event: RowsEvent) => void): () => void

  /**
   * Snapshot the current row id order for an array. Unlike `subscribeRows`,
   * which only fires on delta events, this returns whatever is in the CRDT
   * right now — used by the renderer's mount-time reconciler to detect
   * orphaned rows (CRDT carries a UUID forward after the parent save
   * switched the row's `__id` to a DB PK; see
   * `docs/plans/repeater-relationship-pk-switch.md` Phase A).
   *
   * Empty array when the binding has no state for `arrayName` yet.
   */
  getRowOrder?(arrayName: string): string[]

  /**
   * PK-switch Phase B — re-key a row from `oldId` to `newId` across the
   * binding's row CRDT surface. Called by `FormRenderer` after a successful
   * form submit that emitted `relationshipRenames` in the JSON response;
   * the relevant `Repeater.relationship` / `Builder.relationship` field
   * pre-assigned the submitter's UUID and the server returned the DB PK
   * each row was actually persisted under. Renaming inside CRDT means
   * other peers converge on the DB PK without reloading.
   *
   * Idempotent: bindings should no-op on `oldId === newId`, on unknown
   * `oldId`, on unknown `arrayName`, AND on collisions where `newId`
   * already exists (clobbering an unrelated row's content is worse than
   * leaving the orphan UUID for the mount-time reconciler to drop).
   *
   * When absent, the dispatch step silently skips — the submitting
   * peer's Phase A reconciler still drops orphans on next mount, but
   * other peers stay on the UUID until they reload (the documented
   * pre-Phase-B posture). See
   * `pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md`.
   */
  renameRow?(arrayName: string, oldId: string, newId: string): void
}

/**
 * Phase F.5 — array-scoped imperative API exposed to Repeater / Builder
 * renderers through `useRowBinding(arrayName)`. Each method's first arg
 * (`arrayName`) is pre-bound by the hook so call sites read naturally.
 *
 * Returned by the hook only when the active binding implements all four
 * F.5 row methods (`addRow + removeRow + reorderRows`); partial impls
 * read as null so renderers can do a single existence check before
 * proceeding. `setRow` is intentionally NOT exposed here — it's invoked
 * implicitly via `FormStateProvider.setValue`'s dotted-path routing,
 * so renderers never need to touch it directly.
 */
export interface RowBindingApi {
  /** Register a new row in the array's CRDT surface. `initial` may
   *  carry pre-seeded values (e.g. clone of a sibling); pass `{}` (or
   *  omit) for empty rows. Idempotent under existing rowId. */
  add(rowId: string, initial?: Record<string, unknown>): void
  /** Remove the row with the given id. Idempotent for unknown ids. */
  remove(rowId: string): void
  /** Replace the array's row order. `newOrder` is the full list of row
   *  ids in their post-reorder positions; the binding emits the minimal
   *  CRDT move sequence in one transaction so peers observe a single
   *  coalesced update. */
  reorder(newOrder: string[]): void
  /** Subscribe to remote row-lifecycle events on this array. Returns
   *  an unsubscribe fn the renderer's `useEffect` cleanup hangs on.
   *  Local mutations may also surface here (Yjs observers fire on
   *  local transactions); the renderer is expected to dedupe by
   *  rowId presence in its current state. Optional on the underlying
   *  contract — `null` when the binding lacks `subscribeRows`. */
  subscribe(fn: (event: RowsEvent) => void): () => void
  /** Snapshot the array's current row id order. Empty array when the
   *  binding has no state yet OR when the underlying binding doesn't
   *  implement `getRowOrder` (in which case mount-time reconciliation
   *  no-ops). */
  current(): string[]
}

/**
 * Phase F.5 — row-lifecycle event surfaced through `subscribeRows`.
 *
 *   - `add`    — a new row was inserted at `index`. `values` carries
 *                the row's seeded field values (mirrors `addRow.initial`).
 *   - `remove` — a row was removed; `index` is its position at the
 *                moment of removal.
 *   - `move`   — a row shifted positions. `from` and `to` are 0-based
 *                indices in the post-reorder layout (i.e. the row at
 *                position `from` ended up at `to`).
 *
 * Pilotiq core stays Yjs-free — the binding impl in `@pilotiq-pro/collab`
 * translates `Y.Array<Y.Map>` `observe` deltas into these events.
 */
export type RowsEvent =
  | { kind: 'add';    rowId: string; index: number; values: Record<string, unknown> }
  | { kind: 'remove'; rowId: string; index: number }
  | { kind: 'move';   rowId: string; from: number; to: number }

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
   * Initial form meta from the server. The binding walks this once at
   * construction to index Repeater / Builder array names for row-level
   * CRDT. Text fields (top-level and row leaves alike) don't need to be
   * partitioned here — the Tiptap renderer owns their `Y.XmlFragment`s
   * at the doc root. The meta is captured at mount; later structural
   * changes from `live()` re-resolves aren't re-walked.
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
