import type { ComponentType, ReactNode } from 'react'

/**
 * Props the page-record wrapper receives from `RecordWrapperGate` when
 * the current URL resolves to a record-bound edit page (`${base}/.../:id/edit`).
 *
 * The wrapper is responsible for whatever record-scoped context the
 * plugin owns — `@pilotiq-pro/collab` mounts a `<RecordCollabRoom>`
 * here so every collab field inside the page shares one Y.Doc + WS
 * connection. Other plugins could mount per-record presence, audit
 * logging, or anything else that's record-bound rather than panel-bound.
 *
 * `resourceSlug` is the slash-joined slug-path (cluster-prefixed for
 * clustered resources, parent-prefixed for nested-relation edits) so
 * two URLs that target different records always produce distinct
 * wrapper keys / room names.
 */
export interface RecordWrapperProps {
  resourceSlug: string
  recordId:     string
  children:     ReactNode
}

let _component: ComponentType<RecordWrapperProps> | null = null

/**
 * Register a component that wraps the page tree on every record-edit
 * route. Called once at boot by a plugin (e.g. `@pilotiq-pro/collab`).
 * No-op when no plugin registers — `RecordWrapperGate` passes through
 * unchanged.
 */
export function registerRecordWrapper(C: ComponentType<RecordWrapperProps>): void {
  _component = C
}

/** Returns the registered wrapper component, or `null`. */
export function getRecordWrapper(): ComponentType<RecordWrapperProps> | null {
  return _component
}
