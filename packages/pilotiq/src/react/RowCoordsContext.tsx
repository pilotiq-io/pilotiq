import React, { createContext, useContext } from 'react'

/**
 * Phase 1 — row-text Tiptap-backed collab plan
 * (`pilotiq-pro/docs/plans/collab-row-text-tiptap-backed.md`).
 *
 * Each Repeater / Builder row mounts a `<RowCoordsContext.Provider>`
 * around its children so dotted-path text leaves can compose a
 * fragment-key that includes the stable `rowId` (survives reorders).
 * Top-level fields see `null` and fall through to bare-name fragment
 * routing.
 */
export interface RowCoords {
  arrayName: string
  rowIndex:  number
  rowId:     string
}

export const RowCoordsContext = createContext<RowCoords | null>(null)

export function useRowCoords(): RowCoords | null {
  return useContext(RowCoordsContext)
}
