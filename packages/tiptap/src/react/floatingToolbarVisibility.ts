import { NodeSelection, type EditorState } from '@tiptap/pm/state'

import { isSelectionInAlert } from '../extensions/contentBlocks.js'

/**
 * Inline marks the `FloatingToolbar` can toggle — bold / italic / strike /
 * code / link. A caret (empty selection) sitting inside any of these surfaces
 * the toolbar so the formatting can be edited in place, without first
 * selecting the text (#156).
 */
export const TOOLBAR_MARKS = ['bold', 'italic', 'strike', 'code', 'link'] as const
const TOOLBAR_MARK_SET = new Set<string>(TOOLBAR_MARKS)

/**
 * True when the caret (an EMPTY selection) sits inside one of the toolbar's
 * formatting marks. Reads `storedMarks` first (so the active mark at a typed
 * boundary still counts), then the marks resolved at the cursor.
 */
function caretInToolbarMark(state: EditorState): boolean {
  const sel = state.selection
  if (!sel.empty) return false
  const marks = state.storedMarks ?? sel.$from.marks()
  return marks.some((m) => TOOLBAR_MARK_SET.has(m.type.name))
}

/**
 * Whether the selection-based `FloatingToolbar` should be visible. A PURE
 * decision (no DOM / coords) so it's unit-testable against the real schema:
 *
 *  - never inside a callout/alert block — it owns its own chrome (#155);
 *  - never on a whole-node selection of a non-text block — a custom block
 *    card (`pilotiqBlock`), image, hr, etc. has no inline text to format, so
 *    clicking/selecting it must not surface the mark toolbar (#155 for the
 *    schema-form custom blocks, which the alert-only guard above missed);
 *  - a caret (empty selection) shows ONLY when it sits inside a formatting
 *    mark (link / bold / …) so the mark can be edited without selecting (#156);
 *  - a non-empty range shows whenever it actually spans inline content (the
 *    `childCount === 0` guard skips degenerate full-block selections).
 */
export function shouldShowFloatingToolbar(state: EditorState): boolean {
  const sel = state.selection
  if (isSelectionInAlert(sel)) return false
  if (sel instanceof NodeSelection && sel.node.isBlock && !sel.node.isTextblock) {
    return false
  }
  if (state.selection.empty) return caretInToolbarMark(state)
  const { from, to } = state.selection
  return state.doc.slice(from, to).content.childCount > 0
}
