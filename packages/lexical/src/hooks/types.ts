// Shared types for the collab hook. Kept in a standalone file so the free
// stub (in useYjsCollab.ts) and the pro impl (in @pilotiq-pro/collab) can
// both reference them without depending on each other.

/** Minimal structural interface for a Yjs WebSocket provider. */
export interface YjsProvider {
  awareness: { setLocalStateField(field: string, state: Record<string, unknown>): void }
  once(event: string, callback: () => void): void
  destroy(): void
}

/**
 * Structural ref shape shared between the free stub and pro's real impl.
 *
 * `doc` and `Y` are intentionally typed as `unknown`: free lexical must not
 * import from `yjs` at all (that's the whole point of the open-core split —
 * see pilotiq/docs/plans/phase-5-collab-extraction.md). Consumers of
 * `collabRef.current` cast to the shapes they need at the use site (this
 * matches what SeedPlugin already does with `{ doc: any; Y: any }`).
 */
export interface YjsCollabRef {
  doc:      unknown
  provider: YjsProvider
  Y:        unknown
}

export interface UseYjsCollabOptions {
  /** WebSocket path (e.g. '/ws-live'). Null/undefined = no collaboration. */
  wsPath?:       string | null | undefined
  /** Base document name — room = `${docName}:${fragmentName}` */
  docName?:      string | null | undefined
  /** Fragment name — unique per editor instance */
  fragmentName:  string
  /** Display name for cursors */
  userName?:     string | undefined
  /** Cursor color (CSS color) */
  userColor?:    string | undefined
}

export interface UseYjsCollabReturn {
  /** Whether Y.Doc + provider are ready */
  collabReady:    boolean
  /** Whether initial server sync has completed */
  providerSynced: boolean
  /** Ref to the collab state (doc, provider, Y module) */
  collabRef:      React.MutableRefObject<YjsCollabRef | null>
  /** Whether collaboration is active (wsPath + docName both present) */
  isCollab:       boolean
  /**
   * Memoized provider factory for Lexical's CollaborationPlugin.
   * Undefined when collab is not ready.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerFactory: ((id: string, yjsDocMap: Map<string, any>) => any) | undefined
}
