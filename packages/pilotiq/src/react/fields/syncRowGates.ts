// Match by `id`: rows in `fresh` come from server re-resolve of whatever
// rows the client posted, so any row missing from `fresh` (a client-added
// row that arrived after the live() request fired) is left untouched.
// Returns `prev` reference unchanged when nothing differs — caller's
// `setRows` then no-ops, avoiding a render cascade on idempotent responses.
export interface RowGateMeta {
  id:            string
  hidden?:       boolean
  canDelete?:    false
  canClone?:     false
  canReorder?:   false
  itemLabel?:    string
  extraActions?: readonly unknown[]
}

export function syncRowGates<R extends RowGateMeta>(
  prev:  R[],
  fresh: ReadonlyArray<RowGateMeta>,
): R[] {
  const byId = new Map<string, RowGateMeta>()
  for (const r of fresh) byId.set(r.id, r)

  let changed = false
  const next = prev.map((row): R => {
    const m = byId.get(row.id)
    if (!m) return row

    const targetHidden     = m.hidden === true
    const targetCanDelete  = m.canDelete  === false ? (false as const) : undefined
    const targetCanClone   = m.canClone   === false ? (false as const) : undefined
    const targetCanReorder = m.canReorder === false ? (false as const) : undefined
    const targetItemLabel  = typeof m.itemLabel === 'string' ? m.itemLabel : undefined
    const targetExtra      = m.extraActions && m.extraActions.length > 0 ? m.extraActions : undefined

    const extraDiffers =
      (row.extraActions?.length ?? 0) !== (targetExtra?.length ?? 0)
      || (targetExtra !== undefined && JSON.stringify(row.extraActions) !== JSON.stringify(targetExtra))

    if (
      Boolean(row.hidden)  === targetHidden &&
      row.canDelete        === targetCanDelete &&
      row.canClone         === targetCanClone &&
      row.canReorder       === targetCanReorder &&
      row.itemLabel        === targetItemLabel &&
      !extraDiffers
    ) return row

    changed = true
    const updated = { ...row }
    if (targetHidden)     updated.hidden     = true
    else delete updated.hidden
    if (targetCanDelete  === false) updated.canDelete  = false
    else delete updated.canDelete
    if (targetCanClone   === false) updated.canClone   = false
    else delete updated.canClone
    if (targetCanReorder === false) updated.canReorder = false
    else delete updated.canReorder
    if (targetItemLabel !== undefined) updated.itemLabel = targetItemLabel
    else delete updated.itemLabel
    if (targetExtra !== undefined) updated.extraActions = targetExtra
    else delete updated.extraActions
    return updated
  })

  return changed ? next : prev
}
