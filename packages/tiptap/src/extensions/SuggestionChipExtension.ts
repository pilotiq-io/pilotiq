import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * One AI-suggested replacement of `[from, to)` with `replacement`.
 *
 * `from === to` represents a pure insertion at that position. v1 carries
 * plain-text replacement only — marks and structure round-trip through the
 * editor as-is when the suggestion is approved (the original range's marks
 * are preserved on the inserted text node by ProseMirror).
 */
export interface InlineSuggestion {
  /** Stable id; consumer-provided. Re-adding with the same id replaces the prior entry. */
  id:           string
  /** Inclusive document position the original range starts at. */
  from:         number
  /** Exclusive document position the original range ends at. */
  to:           number
  /** Plain-text replacement. Empty string = pure deletion. */
  replacement:  string
  /** Optional attribution surfaced on the chip widget. */
  source?: {
    agentSlug?:  string
    agentLabel?: string
  }
}

export interface SuggestionChipExtensionOptions {
  /**
   * Class prefix for both decoration spans and chip widgets. The package
   * stays CSS-free — consumers ship the matching styles. Default
   * `'pilotiq-suggestion'` produces classes:
   *   - `pilotiq-suggestion-original`     (strikethrough on the original range)
   *   - `pilotiq-suggestion-chip`         (root of the inline widget)
   *   - `pilotiq-suggestion-replacement`  (the suggested-text preview span)
   *   - `pilotiq-suggestion-accept`       (Approve button)
   *   - `pilotiq-suggestion-reject`       (Reject button)
   */
  classPrefix: string
  /**
   * Fired whenever the suggestion list changes — after `add*`, `approve*`,
   * `reject*`, `clear*`, or after a doc edit collapses a range. Lets the host
   * mirror state into a React context (e.g. `PendingSuggestionsApi`).
   */
  onChange?: (suggestions: InlineSuggestion[]) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestionChip: {
      /** Add or replace a suggestion (matched by id). */
      addSuggestion:         (suggestion: InlineSuggestion) => ReturnType
      /** Add or replace many suggestions in one transaction. */
      addSuggestions:        (suggestions: InlineSuggestion[]) => ReturnType
      /** Apply the replacement to the doc and drop the suggestion. */
      approveSuggestion:     (id: string) => ReturnType
      /** Drop the suggestion without touching the doc. */
      rejectSuggestion:      (id: string) => ReturnType
      /** Apply every replacement in highest-`from`-first order. */
      approveAllSuggestions: () => ReturnType
      /** Drop every suggestion. */
      rejectAllSuggestions:  () => ReturnType
      /** Alias for `rejectAllSuggestions`. */
      clearSuggestions:      () => ReturnType
    }
  }
}

interface PluginState {
  suggestions: readonly InlineSuggestion[]
}

interface SetMeta {
  type: 'set'
  next: readonly InlineSuggestion[]
}

export const suggestionChipPluginKey = new PluginKey<PluginState>('pilotiqSuggestionChip')

/**
 * Append or replace by id. Pure — exported for tests and so the same dedupe
 * shape can drive consumer-side mirror state.
 */
export function upsertSuggestion(
  current: readonly InlineSuggestion[],
  next:    InlineSuggestion,
): InlineSuggestion[] {
  const idx = current.findIndex(s => s.id === next.id)
  if (idx === -1) return [...current, next]
  const copy = current.slice()
  copy[idx] = next
  return copy
}

/** Append or replace many — semantically equivalent to a fold over `upsertSuggestion`. */
export function upsertSuggestions(
  current: readonly InlineSuggestion[],
  nexts:   readonly InlineSuggestion[],
): InlineSuggestion[] {
  let acc: InlineSuggestion[] = current.slice()
  for (const n of nexts) acc = upsertSuggestion(acc, n)
  return acc
}

/** Remove by id. */
export function removeSuggestion(
  current: readonly InlineSuggestion[],
  id:      string,
): InlineSuggestion[] {
  return current.filter(s => s.id !== id)
}

/**
 * Remap survivors through a PM mapping; drop ranges that collapsed past
 * each other (`to < from` after remap). Pure — exported for tests.
 */
export function remapSuggestions(
  suggestions: readonly InlineSuggestion[],
  map: (pos: number, side: -1 | 1) => number,
): InlineSuggestion[] {
  const out: InlineSuggestion[] = []
  for (const s of suggestions) {
    const from = map(s.from, -1)
    const to   = map(s.to,   1)
    if (to < from) continue
    out.push({ ...s, from, to })
  }
  return out
}

/**
 * Order suggestions for `approveAll` so the highest-`from` runs first;
 * earlier-in-doc replacements then can't shift positions of later ones.
 * Pure — exported for tests.
 */
export function sortForApproveAll(
  suggestions: readonly InlineSuggestion[],
): InlineSuggestion[] {
  return suggestions.slice().sort((a, b) => b.from - a.from)
}

/**
 * Editor extension that tracks AI-suggested edits as inline decorations with
 * per-hunk Approve/Reject chips. The package is CSS-free — consumers wire
 * styles against the documented class names.
 *
 * Usage:
 * ```ts
 * editor.commands.addSuggestion({
 *   id:          'seo-1',
 *   from:        12,
 *   to:          18,
 *   replacement: 'better',
 *   source:      { agentLabel: 'SEO' },
 * })
 * // …user clicks ✓ on the chip, or:
 * editor.commands.approveSuggestion('seo-1')
 * ```
 *
 * Mounted by default inside `TiptapEditor`; consumer code reaches it through
 * the editor's command surface.
 */
export const SuggestionChipExtension = Extension.create<SuggestionChipExtensionOptions>({
  name: 'pilotiqSuggestionChip',

  addOptions() {
    return {
      classPrefix: 'pilotiq-suggestion',
    }
  },

  onCreate() {
    // Inject minimal default styles for the chip + strikethrough on first
    // mount so consumers see the visualization without wiring CSS. Idempotent
    // via the `data-pilotiq-suggestion-styles` sentinel; consumers who
    // want full control just add their own `<style>` with the same class
    // names (last wins — the cascade picks user overrides over our defaults
    // since the user stylesheet appears AFTER our injected one in `<head>`
    // when imported via Vite/Webpack, OR via higher specificity).
    if (typeof document === 'undefined') return
    const SENTINEL = 'data-pilotiq-suggestion-styles'
    if (document.head.querySelector(`style[${SENTINEL}]`)) return
    const prefix = this.options.classPrefix
    const style  = document.createElement('style')
    style.setAttribute(SENTINEL, '')
    // Colors picked to look right on light + dark surfaces without theme
    // overrides (60% alpha on background-color, 100% on text). Tuned to
    // match the inline-diff convention used by the Tiptap Pro AI Agent.
    style.textContent = `
      .${prefix}-original {
        text-decoration: line-through;
        text-decoration-color: rgba(220, 38, 38, 0.7);
        background-color: rgba(254, 226, 226, 0.6);
        color: rgb(153, 27, 27);
      }
      .${prefix}-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        margin-left: 0.25rem;
        padding: 0 0.25rem;
        border-radius: 0.25rem;
        background-color: rgba(220, 252, 231, 0.7);
        color: rgb(22, 101, 52);
        font-size: 0.875em;
        line-height: 1.4;
      }
      .${prefix}-replacement {
        padding: 0 0.125rem;
      }
      .${prefix}-accept,
      .${prefix}-reject {
        appearance: none;
        background: transparent;
        border: 0;
        padding: 0 0.25rem;
        cursor: pointer;
        font-size: 0.875em;
        line-height: 1;
        color: inherit;
      }
      .${prefix}-accept:hover { color: rgb(21, 128, 61); }
      .${prefix}-reject:hover { color: rgb(185, 28, 28); }

      /* Banner — bottom-of-editor strip for whole-field suggestions on rich
         surfaces (markdown / richtext). Sibling to the chip styles above;
         lives here so both ship via the same extension-mount sentinel.
         Class names live under \`pilotiq-suggestion-banner-*\` (not \`-suggestion-\`)
         since the banner is a host-mounted React component, not a PM
         decoration. */
      .pilotiq-suggestion-banner {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.625rem;
        margin-top: 0.375rem;
        border-radius: 0.375rem;
        background-color: rgba(254, 252, 232, 0.9);
        border: 1px solid rgba(234, 179, 8, 0.4);
        color: rgb(113, 63, 18);
        font-size: 0.875rem;
        line-height: 1.4;
      }
      .pilotiq-suggestion-banner-icon { flex: 0 0 auto; }
      .pilotiq-suggestion-banner-label { flex: 1 1 auto; }
      .pilotiq-suggestion-banner-actions {
        display: inline-flex;
        gap: 0.375rem;
        flex: 0 0 auto;
      }
      .pilotiq-suggestion-banner-reject,
      .pilotiq-suggestion-banner-accept {
        appearance: none;
        cursor: pointer;
        font-size: 0.8125rem;
        font-weight: 500;
        line-height: 1;
        padding: 0.25rem 0.625rem;
        border-radius: 0.25rem;
        border: 1px solid transparent;
      }
      .pilotiq-suggestion-banner-reject {
        background-color: transparent;
        color: rgb(120, 53, 15);
        border-color: rgba(180, 83, 9, 0.4);
      }
      .pilotiq-suggestion-banner-reject:hover {
        background-color: rgba(254, 215, 170, 0.4);
      }
      .pilotiq-suggestion-banner-accept {
        background-color: rgb(22, 101, 52);
        color: white;
      }
      .pilotiq-suggestion-banner-accept:hover { background-color: rgb(21, 128, 61); }
    `
    document.head.appendChild(style)
  },

  addCommands() {
    return {
      addSuggestion: (suggestion) => ({ tr, state, dispatch }) => {
        const current = suggestionChipPluginKey.getState(state)?.suggestions ?? []
        const next    = upsertSuggestion(current, suggestion)
        if (dispatch) {
          tr.setMeta(suggestionChipPluginKey, { type: 'set', next } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      addSuggestions: (suggestions) => ({ tr, state, dispatch }) => {
        const current = suggestionChipPluginKey.getState(state)?.suggestions ?? []
        const next    = upsertSuggestions(current, suggestions)
        if (dispatch) {
          tr.setMeta(suggestionChipPluginKey, { type: 'set', next } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      approveSuggestion: (id) => ({ tr, state, dispatch }) => {
        const current = suggestionChipPluginKey.getState(state)?.suggestions ?? []
        const target  = current.find(s => s.id === id)
        if (!target) return false
        if (dispatch) {
          applyApprove(tr, state, target)
          tr.setMeta(suggestionChipPluginKey, {
            type: 'set',
            next: removeSuggestion(current, id),
          } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      rejectSuggestion: (id) => ({ tr, state, dispatch }) => {
        const current = suggestionChipPluginKey.getState(state)?.suggestions ?? []
        const target  = current.find(s => s.id === id)
        if (!target) return false
        if (dispatch) {
          tr.setMeta(suggestionChipPluginKey, {
            type: 'set',
            next: removeSuggestion(current, id),
          } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      approveAllSuggestions: () => ({ tr, state, dispatch }) => {
        const current = suggestionChipPluginKey.getState(state)?.suggestions ?? []
        if (current.length === 0) return false
        if (dispatch) {
          for (const s of sortForApproveAll(current)) applyApprove(tr, state, s)
          tr.setMeta(suggestionChipPluginKey, {
            type: 'set',
            next: [],
          } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      rejectAllSuggestions: () => ({ tr, state, dispatch }) => {
        const current = suggestionChipPluginKey.getState(state)?.suggestions ?? []
        if (current.length === 0) return false
        if (dispatch) {
          tr.setMeta(suggestionChipPluginKey, {
            type: 'set',
            next: [],
          } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      clearSuggestions: () => ({ tr, state, dispatch }) => {
        const current = suggestionChipPluginKey.getState(state)?.suggestions ?? []
        if (current.length === 0) return false
        if (dispatch) {
          tr.setMeta(suggestionChipPluginKey, {
            type: 'set',
            next: [],
          } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const ext = this
    return [
      new Plugin<PluginState>({
        key: suggestionChipPluginKey,
        state: {
          init: (): PluginState => ({ suggestions: [] }),
          apply(tr, prev): PluginState {
            const meta = tr.getMeta(suggestionChipPluginKey) as SetMeta | undefined
            const base = meta?.type === 'set' ? meta.next : prev.suggestions
            if (!tr.docChanged) return { suggestions: base }
            return {
              suggestions: remapSuggestions(base, (pos, side) =>
                tr.mapping.map(pos, side)),
            }
          },
        },
        props: {
          decorations(state) {
            const ps = suggestionChipPluginKey.getState(state)
            if (!ps || ps.suggestions.length === 0) return DecorationSet.empty
            return buildDecorations(state, ps.suggestions, ext.options.classPrefix, ext.editor)
          },
        },
        view(view) {
          let last = suggestionChipPluginKey.getState(view.state)?.suggestions
          return {
            update(updated) {
              const next = suggestionChipPluginKey.getState(updated.state)?.suggestions
              if (next === last) return
              last = next
              const cb = ext.options.onChange
              if (cb) cb(next ? [...next] : [])
            },
            destroy() {},
          }
        },
      }),
    ]
  },
})

function applyApprove(tr: Transaction, state: EditorState, target: InlineSuggestion): void {
  const docSize = state.doc.content.size
  const from = clampPos(target.from, docSize)
  const to   = clampPos(target.to,   docSize)
  if (from > to) return
  if (target.replacement.length > 0) {
    tr.replaceWith(from, to, state.schema.text(target.replacement))
  } else if (from < to) {
    tr.delete(from, to)
  }
}

function buildDecorations(
  state:       EditorState,
  suggestions: readonly InlineSuggestion[],
  prefix:      string,
  editor:      Editor,
): DecorationSet {
  const docSize = state.doc.content.size
  const decos:  Decoration[] = []

  for (const s of suggestions) {
    const from = clampPos(s.from, docSize)
    const to   = clampPos(s.to,   docSize)
    if (from > to) continue

    if (from < to) {
      decos.push(
        Decoration.inline(from, to, {
          class: `${prefix}-original`,
          'data-pilotiq-suggestion-id': s.id,
        }),
      )
    }

    decos.push(
      Decoration.widget(to, () => buildChip(s, prefix, editor), {
        side: 1,
        ignoreSelection: true,
        key: `pilotiq-suggestion:${s.id}`,
      }),
    )
  }

  return DecorationSet.create(state.doc, decos)
}

/** Bound `pos` into `[0, max]`; non-finite or negative input collapses to 0. */
export function clampPos(pos: number, max: number): number {
  if (!Number.isFinite(pos)) return 0
  if (pos < 0) return 0
  if (pos > max) return max
  return Math.trunc(pos)
}

function buildChip(s: InlineSuggestion, prefix: string, editor: Editor): HTMLElement {
  const root = document.createElement('span')
  root.className = `${prefix}-chip`
  root.setAttribute('data-pilotiq-suggestion-id', s.id)
  root.contentEditable = 'false'

  if (s.replacement.length > 0) {
    const insert = document.createElement('span')
    insert.className   = `${prefix}-replacement`
    insert.textContent = s.replacement
    root.appendChild(insert)
  }

  if (s.source?.agentLabel) {
    root.setAttribute('data-pilotiq-suggestion-source', s.source.agentLabel)
  }
  if (s.source?.agentSlug) {
    root.setAttribute('data-pilotiq-suggestion-source-slug', s.source.agentSlug)
  }

  root.appendChild(buildButton(prefix, 'accept', '✓', 'Accept suggestion', () => {
    editor.chain().focus().approveSuggestion(s.id).run()
  }))
  root.appendChild(buildButton(prefix, 'reject', '✕', 'Reject suggestion', () => {
    editor.chain().focus().rejectSuggestion(s.id).run()
  }))

  return root
}

function buildButton(
  prefix:  string,
  variant: 'accept' | 'reject',
  glyph:   string,
  title:   string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type        = 'button'
  btn.className   = `${prefix}-${variant}`
  btn.title       = title
  btn.textContent = glyph
  // Don't steal the editor selection on press — the click handler runs on
  // mouseup, but mousedown is what flips focus to the button. Cancelling it
  // keeps the cursor in the editor so `editor.chain().focus()` lands cleanly.
  btn.addEventListener('mousedown', (e) => e.preventDefault())
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onClick()
  })
  return btn
}
