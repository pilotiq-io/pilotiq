import { createContext, useContext } from 'react'
import type {
  UseYjsCollabOptions,
  UseYjsCollabReturn,
  YjsCollabRef,
  YjsProvider,
} from './types.js'

// Re-export the public types so existing imports from this module keep working.
export type { UseYjsCollabOptions, UseYjsCollabReturn, YjsCollabRef, YjsProvider }

/**
 * Stub hook returning the local-only state shape. Used when no
 * `@pilotiq-pro/collab` provider is wrapping the tree — i.e. when the app
 * has not installed (or not registered) the commercial collab package.
 *
 * The editor then renders in local-only mode: LexicalEditor has no
 * CollaborationPlugin wired up, and CollaborativePlainText shows the
 * read-only fallback that its component already renders when collab
 * isn't ready.
 */
const stubUseYjsCollab = (_opts: UseYjsCollabOptions): UseYjsCollabReturn => ({
  collabReady:     false,
  providerSynced:  false,
  collabRef:       { current: null },
  isCollab:        false,
  providerFactory: undefined,
})

/**
 * Context whose value is a hook implementation. Free ships the stub as the
 * default; `@pilotiq-pro/collab`'s `<CollabProvider>` overrides it with the
 * real Yjs-backed implementation (`useYjsCollabImpl`) when installed.
 *
 * This is the React-side counterpart to the `CollabSupportRegistry` seam
 * in `@pilotiq/panels` — the registry gates server-side `Field.persist(...)`,
 * while this context gates the client-side hook that actually wires up
 * Yjs + y-websocket + y-indexeddb.
 *
 * Open-core rationale: keeping `useYjsCollab` free ensures LexicalEditor
 * and CollaborativePlainText compile without yjs installed, and keeps
 * `@pilotiq/lexical`'s dependency surface Yjs-free. Pro consumers
 * override the context at their tree root to activate real collaboration.
 */
export const CollabHookContext = createContext<(opts: UseYjsCollabOptions) => UseYjsCollabReturn>(stubUseYjsCollab)

/**
 * Shared Yjs collaboration setup for Lexical editors.
 *
 * The hook itself just reads the current `CollabHookContext` value and
 * delegates to it. Without pro: the stub returns a local-only state shape.
 * With pro (`<CollabProvider>` mounted): the real `useYjsCollabImpl` runs,
 * creating a per-editor Y.Doc + WebSocket + IndexedDB provider.
 *
 * Used by both LexicalEditor (rich text) and CollaborativePlainText.
 */
export function useYjsCollab(opts: UseYjsCollabOptions): UseYjsCollabReturn {
  const hook = useContext(CollabHookContext)
  return hook(opts)
}
