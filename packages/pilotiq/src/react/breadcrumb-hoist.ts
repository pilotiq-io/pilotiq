'use client'

import { createContext, useContext } from 'react'

/**
 * Signals that the active layout has hoisted the page's breadcrumb into
 * its sticky header (the sidebar layout does this next to the toggle).
 * When true, the in-body `BreadcrumbsRenderer` returns null so the
 * breadcrumb isn't rendered twice. Default false — layouts that don't
 * hoist (topbar) leave the body breadcrumb in place.
 */
const BreadcrumbHoistContext = createContext(false)

export const BreadcrumbHoistProvider = BreadcrumbHoistContext.Provider

export function useBreadcrumbsHoisted(): boolean {
  return useContext(BreadcrumbHoistContext)
}
