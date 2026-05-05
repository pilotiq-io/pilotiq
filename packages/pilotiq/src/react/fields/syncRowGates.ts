/**
 * Sync per-row gate flags (`hidden / canDelete / canClone / canReorder`)
 * from server-resolved row meta into the client's local row-state list.
 *
 * Match by `id` — the server resolves whatever rows the client posted up
 * during a `live()` re-resolve, so row IDs in `fresh` correspond 1:1 to
 * rows in `prev` (any row missing from `fresh` is left untouched, which
 * covers the "client added a row faster than the server response could
 * arrive" race).
 *
 * Preserves every other field on the row (`children, itemLabel,
 * extraActions, type, unknownType`) so locally-mounted uncontrolled inputs
 * don't unmount and lose typed-but-unsubmitted values. The four sync'd
 * fields are pure presentation chrome — toggling them never re-renders an
 * inner field.
 *
 * Returns `prev` reference unchanged when no flag differs across all rows
 * — the `useEffect` caller in `RepeaterInput / BuilderInput` short-circuits
 * `setRows` so we don't trigger a render cascade on idempotent server
 * responses.
 */
export interface RowGateMeta {
  id:          string
  hidden?:     boolean
  canDelete?:  false
  canClone?:   false
  canReorder?: false
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

    if (
      Boolean(row.hidden)  === targetHidden &&
      row.canDelete        === targetCanDelete &&
      row.canClone         === targetCanClone &&
      row.canReorder       === targetCanReorder
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
    return updated
  })

  return changed ? next : prev
}
