import type { TextDelta } from '../FormCollabBindingRegistry.js'

/**
 * Phase F.6 — derive a single character-level edit op from two strings.
 *
 * Strategy: find the longest common prefix and suffix between `before`
 * and `after`; whatever's left in the middle is the changed region.
 *
 *   - middle-after empty + middle-before non-empty → `delete`
 *   - middle-before empty + middle-after non-empty → `insert`
 *   - both non-empty                              → `replace`
 *   - both empty (identical strings)              → `null`
 *
 * This correctly handles the common edit shapes: single-key insert,
 * single-key backspace, multi-char paste replacing a selection, IME
 * commits, accent-key composition. It does NOT preserve user intent
 * when the same character appears at multiple positions and the edit
 * could be attributed to either occurrence — Yjs's per-character
 * identity makes that distinction lossy at the string-diff layer
 * (the `Y.Text` itself maintains item identity internally). For v1
 * we accept the ambiguity; the CRDT semantics still converge.
 */
export function computeDelta(before: string, after: string): TextDelta | null {
  if (before === after) return null

  let prefix = 0
  const minLen = Math.min(before.length, after.length)
  while (prefix < minLen && before[prefix] === after[prefix]) prefix++

  // Walk back from each end, capped so suffix can't overlap the prefix
  // on either side. Without the cap, identical strings of repeated
  // chars (e.g. 'aaa' → 'aa') would consume the same byte from both
  // directions and produce an empty middle on both sides.
  let suffix = 0
  const maxSuffix = Math.min(before.length - prefix, after.length - prefix)
  while (
    suffix < maxSuffix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++
  }

  const beforeMid = before.slice(prefix, before.length - suffix)
  const afterMid  = after.slice(prefix, after.length - suffix)

  if (beforeMid.length === 0 && afterMid.length > 0) {
    return { kind: 'insert', index: prefix, text: afterMid }
  }
  if (afterMid.length === 0 && beforeMid.length > 0) {
    return { kind: 'delete', index: prefix, length: beforeMid.length }
  }
  return { kind: 'replace', from: prefix, to: prefix + beforeMid.length, text: afterMid }
}

/**
 * Phase F.6 — best-effort cursor anchor across a remote-applied edit.
 *
 *   - Edit landed AFTER cursor (cursor inside the common prefix) → keep
 *     cursor where it is.
 *   - Edit landed BEFORE cursor                                  → shift
 *     cursor by `after.length − before.length` so its character-offset
 *     into the post-edit string matches its pre-edit anchor.
 *   - Edit landed OVERLAPPING the cursor                         → cursor
 *     ends up at the boundary between the changed region and the
 *     unchanged suffix (which `Math.max(0, cursor + delta)` produces
 *     naturally and clamps to the new bounds).
 *
 * This is a heuristic, not a Yjs `RelativePosition`. Two peers typing
 * at the exact same insertion point can still see a one-character cursor
 * twitch on the remote-mirror side; v2 (in-input remote carets) would
 * upgrade to relative positions if/when a consumer asks. Native input
 * cursors are clamped to `[0, after.length]` by every browser, so this
 * function does the same to avoid `setSelectionRange` throwing.
 */
export function preserveCursor(before: string, after: string, cursor: number): number {
  if (before === after) return cursor

  let prefix = 0
  const minLen = Math.min(before.length, after.length)
  while (prefix < minLen && before[prefix] === after[prefix]) prefix++

  if (cursor <= prefix) return Math.min(cursor, after.length)

  const delta = after.length - before.length
  return Math.max(0, Math.min(after.length, cursor + delta))
}
