/**
 * Shared row-state helpers consumed by both `RepeaterInput` and
 * `BuilderInput`. The two fields keep parallel storage namespaces
 * (`pilotiq.repeater.…` vs `pilotiq.builder.…`) so users with both on
 * the same page can collapse them independently — the namespace is the
 * only thing that varies between the two callers.
 */

import {
  readStoredString, removeStoredString, writeStoredString,
} from '../persistedState.js'

let _rowSeqFallback = 0

export function generateRowId(): string {
  type CryptoLike = { randomUUID?: () => string }
  const c = (globalThis as { crypto?: CryptoLike }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `row-${Date.now()}-${++_rowSeqFallback}`
}

export type RowStateNamespace = 'repeater' | 'builder'

export interface CollapsedStorage {
  key:    (formId: string, name: string, rowId: string) => string
  read:   (formId: string, name: string, rowId: string, defaultValue: boolean) => boolean
  write:  (formId: string, name: string, rowId: string, value: boolean) => void
  remove: (formId: string, name: string, rowId: string) => void
  seed:   (
    rows:         { id: string }[],
    formId:       string,
    name:         string,
    defaultValue: boolean,
    collapsible:  boolean,
  ) => Record<string, boolean>
}

/**
 * Build a namespaced per-row collapse-state store. Uses `'true'` /
 * `'false'` encoding (predates the `'1'` / `'0'` flag helper — kept for
 * back-compat with already-persisted state).
 */
export function makeCollapsedStorage(namespace: RowStateNamespace): CollapsedStorage {
  const key = (formId: string, name: string, rowId: string): string =>
    `pilotiq.${namespace}.${formId}.${name}.${rowId}`

  const read = (formId: string, name: string, rowId: string, defaultValue: boolean): boolean => {
    const raw = readStoredString(key(formId, name, rowId))
    if (raw === null) return defaultValue
    return raw === 'true'
  }

  const write = (formId: string, name: string, rowId: string, value: boolean): void => {
    writeStoredString(key(formId, name, rowId), String(value))
  }

  const remove = (formId: string, name: string, rowId: string): void => {
    removeStoredString(key(formId, name, rowId))
  }

  const seed = (
    rows:         { id: string }[],
    formId:       string,
    name:         string,
    defaultValue: boolean,
    collapsible:  boolean,
  ): Record<string, boolean> => {
    if (!collapsible) return {}
    const out: Record<string, boolean> = {}
    for (const row of rows) out[row.id] = read(formId, name, row.id, defaultValue)
    return out
  }

  return { key, read, write, remove, seed }
}

export interface AccordionStorage {
  key:   (formId: string, name: string) => string
  /**
   * `undefined` = no value stored (caller falls back to default-open
   * heuristic). Empty string = user explicitly closed every row (caller
   * maps to `null` openId). Any other string = the open row id.
   */
  read:  (formId: string, name: string) => string | undefined
  write: (formId: string, name: string, openId: string | null) => void
}

/**
 * Build a namespaced accordion-open-row store. Always one slot per
 * (formId, name) pair regardless of row count.
 */
export function makeAccordionStorage(namespace: RowStateNamespace): AccordionStorage {
  const key = (formId: string, name: string): string =>
    `pilotiq.${namespace}.${formId}.${name}.accordion`

  const read = (formId: string, name: string): string | undefined => {
    const raw = readStoredString(key(formId, name))
    return raw === null ? undefined : raw
  }

  const write = (formId: string, name: string, openId: string | null): void => {
    writeStoredString(key(formId, name), openId ?? '')
  }

  return { key, read, write }
}
