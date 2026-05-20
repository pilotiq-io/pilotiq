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
export interface AiSuggestion {
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

export interface AiSuggestionExtensionOptions {
  /**
   * Class prefix for both decoration spans and chip widgets. The package
   * stays CSS-free — consumers ship the matching styles. Default
   * `'pilotiq-ai-suggestion'` produces classes:
   *   - `pilotiq-ai-suggestion-original`     (strikethrough on the original range)
   *   - `pilotiq-ai-suggestion-chip`         (root of the inline widget)
   *   - `pilotiq-ai-suggestion-replacement`  (the suggested-text preview span)
   *   - `pilotiq-ai-suggestion-accept`       (Approve button)
   *   - `pilotiq-ai-suggestion-reject`       (Reject button)
   */
  classPrefix: string
  /**
   * Fired whenever the suggestion list changes — after `add*`, `approve*`,
   * `reject*`, `clear*`, or after a doc edit collapses a range. Lets the host
   * mirror state into a React context (e.g. `PendingSuggestionsApi`).
   */
  onChange?: (suggestions: AiSuggestion[]) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiSuggestion: {
      /** Add or replace a suggestion (matched by id). */
      addAiSuggestion:         (suggestion: AiSuggestion) => ReturnType
      /** Add or replace many suggestions in one transaction. */
      addAiSuggestions:        (suggestions: AiSuggestion[]) => ReturnType
      /** Apply the replacement to the doc and drop the suggestion. */
      approveAiSuggestion:     (id: string) => ReturnType
      /** Drop the suggestion without touching the doc. */
      rejectAiSuggestion:      (id: string) => ReturnType
      /** Apply every replacement in highest-`from`-first order. */
      approveAllAiSuggestions: () => ReturnType
      /** Drop every suggestion. */
      rejectAllAiSuggestions:  () => ReturnType
      /** Alias for `rejectAllAiSuggestions`. */
      clearAiSuggestions:      () => ReturnType
    }
  }
}

interface PluginState {
  suggestions: readonly AiSuggestion[]
}

interface SetMeta {
  type: 'set'
  next: readonly AiSuggestion[]
}

export const aiSuggestionPluginKey = new PluginKey<PluginState>('pilotiqAiSuggestion')

/**
 * Append or replace by id. Pure — exported for tests and so the same dedupe
 * shape can drive consumer-side mirror state.
 */
export function upsertSuggestion(
  current: readonly AiSuggestion[],
  next:    AiSuggestion,
): AiSuggestion[] {
  const idx = current.findIndex(s => s.id === next.id)
  if (idx === -1) return [...current, next]
  const copy = current.slice()
  copy[idx] = next
  return copy
}

/** Append or replace many — semantically equivalent to a fold over `upsertSuggestion`. */
export function upsertSuggestions(
  current: readonly AiSuggestion[],
  nexts:   readonly AiSuggestion[],
): AiSuggestion[] {
  let acc: AiSuggestion[] = current.slice()
  for (const n of nexts) acc = upsertSuggestion(acc, n)
  return acc
}

/** Remove by id. */
export function removeSuggestion(
  current: readonly AiSuggestion[],
  id:      string,
): AiSuggestion[] {
  return current.filter(s => s.id !== id)
}

/**
 * Remap survivors through a PM mapping; drop ranges that collapsed past
 * each other (`to < from` after remap). Pure — exported for tests.
 */
export function remapSuggestions(
  suggestions: readonly AiSuggestion[],
  map: (pos: number, side: -1 | 1) => number,
): AiSuggestion[] {
  const out: AiSuggestion[] = []
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
  suggestions: readonly AiSuggestion[],
): AiSuggestion[] {
  return suggestions.slice().sort((a, b) => b.from - a.from)
}

/**
 * Editor extension that tracks AI-suggested edits as inline decorations with
 * per-hunk Approve/Reject chips. The package is CSS-free — consumers wire
 * styles against the documented class names.
 *
 * Usage:
 * ```ts
 * editor.commands.addAiSuggestion({
 *   id:          'seo-1',
 *   from:        12,
 *   to:          18,
 *   replacement: 'better',
 *   source:      { agentLabel: 'SEO' },
 * })
 * // …user clicks ✓ on the chip, or:
 * editor.commands.approveAiSuggestion('seo-1')
 * ```
 *
 * Mounted by default inside `TiptapEditor`; consumer code reaches it through
 * the editor's command surface.
 */
export const AiSuggestionExtension = Extension.create<AiSuggestionExtensionOptions>({
  name: 'pilotiqAiSuggestion',

  addOptions() {
    return {
      classPrefix: 'pilotiq-ai-suggestion',
    }
  },

  onCreate() {
    // Inject minimal default styles for the chip + strikethrough on first
    // mount so consumers see the visualization without wiring CSS. Idempotent
    // via the `data-pilotiq-ai-suggestion-styles` sentinel; consumers who
    // want full control just add their own `<style>` with the same class
    // names (last wins — the cascade picks user overrides over our defaults
    // since the user stylesheet appears AFTER our injected one in `<head>`
    // when imported via Vite/Webpack, OR via higher specificity).
    if (typeof document === 'undefined') return
    const SENTINEL = 'data-pilotiq-ai-suggestion-styles'
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
    `
    document.head.appendChild(style)
  },

  addCommands() {
    return {
      addAiSuggestion: (suggestion) => ({ tr, state, dispatch }) => {
        const current = aiSuggestionPluginKey.getState(state)?.suggestions ?? []
        const next    = upsertSuggestion(current, suggestion)
        if (dispatch) {
          tr.setMeta(aiSuggestionPluginKey, { type: 'set', next } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      addAiSuggestions: (suggestions) => ({ tr, state, dispatch }) => {
        const current = aiSuggestionPluginKey.getState(state)?.suggestions ?? []
        const next    = upsertSuggestions(current, suggestions)
        if (dispatch) {
          tr.setMeta(aiSuggestionPluginKey, { type: 'set', next } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      approveAiSuggestion: (id) => ({ tr, state, dispatch }) => {
        const current = aiSuggestionPluginKey.getState(state)?.suggestions ?? []
        const target  = current.find(s => s.id === id)
        if (!target) return false
        if (dispatch) {
          applyApprove(tr, state, target)
          tr.setMeta(aiSuggestionPluginKey, {
            type: 'set',
            next: removeSuggestion(current, id),
          } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      rejectAiSuggestion: (id) => ({ tr, state, dispatch }) => {
        const current = aiSuggestionPluginKey.getState(state)?.suggestions ?? []
        const target  = current.find(s => s.id === id)
        if (!target) return false
        if (dispatch) {
          tr.setMeta(aiSuggestionPluginKey, {
            type: 'set',
            next: removeSuggestion(current, id),
          } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      approveAllAiSuggestions: () => ({ tr, state, dispatch }) => {
        const current = aiSuggestionPluginKey.getState(state)?.suggestions ?? []
        if (current.length === 0) return false
        if (dispatch) {
          for (const s of sortForApproveAll(current)) applyApprove(tr, state, s)
          tr.setMeta(aiSuggestionPluginKey, {
            type: 'set',
            next: [],
          } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      rejectAllAiSuggestions: () => ({ tr, state, dispatch }) => {
        const current = aiSuggestionPluginKey.getState(state)?.suggestions ?? []
        if (current.length === 0) return false
        if (dispatch) {
          tr.setMeta(aiSuggestionPluginKey, {
            type: 'set',
            next: [],
          } satisfies SetMeta)
          dispatch(tr)
        }
        return true
      },

      clearAiSuggestions: () => ({ tr, state, dispatch }) => {
        const current = aiSuggestionPluginKey.getState(state)?.suggestions ?? []
        if (current.length === 0) return false
        if (dispatch) {
          tr.setMeta(aiSuggestionPluginKey, {
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
        key: aiSuggestionPluginKey,
        state: {
          init: (): PluginState => ({ suggestions: [] }),
          apply(tr, prev): PluginState {
            const meta = tr.getMeta(aiSuggestionPluginKey) as SetMeta | undefined
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
            const ps = aiSuggestionPluginKey.getState(state)
            if (!ps || ps.suggestions.length === 0) return DecorationSet.empty
            return buildDecorations(state, ps.suggestions, ext.options.classPrefix, ext.editor)
          },
        },
        view(view) {
          let last = aiSuggestionPluginKey.getState(view.state)?.suggestions
          return {
            update(updated) {
              const next = aiSuggestionPluginKey.getState(updated.state)?.suggestions
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

function applyApprove(tr: Transaction, state: EditorState, target: AiSuggestion): void {
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
  suggestions: readonly AiSuggestion[],
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
          'data-pilotiq-ai-suggestion-id': s.id,
        }),
      )
    }

    decos.push(
      Decoration.widget(to, () => buildChip(s, prefix, editor), {
        side: 1,
        ignoreSelection: true,
        key: `pilotiq-ai-suggestion:${s.id}`,
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

function buildChip(s: AiSuggestion, prefix: string, editor: Editor): HTMLElement {
  const root = document.createElement('span')
  root.className = `${prefix}-chip`
  root.setAttribute('data-pilotiq-ai-suggestion-id', s.id)
  root.contentEditable = 'false'

  if (s.replacement.length > 0) {
    const insert = document.createElement('span')
    insert.className   = `${prefix}-replacement`
    insert.textContent = s.replacement
    root.appendChild(insert)
  }

  if (s.source?.agentLabel) {
    root.setAttribute('data-pilotiq-ai-suggestion-source', s.source.agentLabel)
  }
  if (s.source?.agentSlug) {
    root.setAttribute('data-pilotiq-ai-suggestion-source-slug', s.source.agentSlug)
  }

  root.appendChild(buildButton(prefix, 'accept', '✓', 'Accept suggestion', () => {
    editor.chain().focus().approveAiSuggestion(s.id).run()
  }))
  root.appendChild(buildButton(prefix, 'reject', '✕', 'Reject suggestion', () => {
    editor.chain().focus().rejectAiSuggestion(s.id).run()
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
