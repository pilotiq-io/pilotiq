import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { EditorView, lineNumbers as lineNumbersExt, keymap } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { basicSetup } from 'codemirror'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { useCollabSeed, type CollabRoom } from '@pilotiq/pilotiq/react'
// Type-only import keeps the value-import surface inside `y-codemirror.next`
// (a peer dep), so consumers without `yjs` installed still type-check this
// file via TS' module-omission rules for type-only imports.
import type * as Y from 'yjs'
import { getCodeLanguage } from '../languageRegistry.js'

type CodeEditorTheme = 'auto' | 'light' | 'dark'

export interface CollabCodeMirrorEditorProps {
  /**
   * Y.Doc handle from `useCollabRoom()`. Opaque to pilotiq core; the renderer
   * reads `ydoc.getText(fragmentKey)` for the bound `Y.Text` instance.
   */
  ydoc:            unknown
  /**
   * Provider from `useCollabRoom()`. The renderer reads `provider.awareness`
   * for cursor presence.
   */
  provider:        unknown
  /**
   * The room's `synced` Promise (from `useCollabRoom()`); resolves on the
   * provider's first sync. Threaded through pilotiq's `CollabRoom.synced`
   * by `@pilotiq-pro/collab@>=0.2`'s `<RecordCollabRoom>`. Omit / `null`
   * for legacy / hand-rolled providers — the renderer falls back to
   * seeding immediately (the legacy gate ran on `provider.once('synced')`
   * and could race the same way).
   */
  synced?:         Promise<void> | null
  /** Doc-root share key — top-level: bare field name; row-leaf: `${arrayName}.${rowId}.${fieldName}`. */
  fragmentKey:     string
  /** Hidden-input name for FormData submission. */
  hiddenInputName: string
  /** Server-rendered initial value. Used to seed the Y.Text once if it's empty after first sync. */
  defaultValue:    string
  /** CodeMirror language registry id (e.g. `'json'`, `'sql'`). */
  language?:       string | undefined
  /** CSS height (`'300px'`, `'60vh'`). Defaults to `'300px'`. */
  height?:         string | undefined
  lineNumbers:     boolean
  lineWrapping:    boolean
  indentWithTabs:  boolean
  indentSize:      number
  theme:           CodeEditorTheme
  readOnly:        boolean
  disabled:        boolean
  placeholder?:    string | undefined
}

/**
 * CodeMirror 6 + `y-codemirror.next` collaborative editor. Used by
 * `CodeMirrorEditor` when a `<RecordCollabRoom>` is mounted up-tree and
 * the field hasn't opted out via `.collab(false)`.
 *
 * Bypasses `@uiw/react-codemirror` because the React wrapper's `value`
 * prop competes with `yCollab` for ownership of the editor doc — every
 * render would dispatch a `changes` transaction trying to set the doc,
 * racing the Yjs sync. Mounting an `EditorView` directly keeps yCollab
 * as the single source of truth.
 *
 * Doc-root convention mirrors `@pilotiq/tiptap`'s `CollabTextRenderer`:
 * top-level fields key off the bare name; Repeater / Builder row leaves
 * key off `${arrayName}.${rowId}.${fieldName}` so the share survives
 * row reorders (keyed by stable rowId, not array index).
 *
 * Only `fragmentKey` and `language` force a full remount — every other
 * structural prop (theme, height, line numbers, wrapping, indent, editable)
 * is wired through a `Compartment` and reconfigured in place, preserving
 * cursor, scroll, and undo history across toggles (e.g. dark-mode switch
 * inside a dense Repeater).
 */
export function CollabCodeMirrorEditor(props: CollabCodeMirrorEditorProps): React.ReactElement {
  const {
    ydoc, provider, synced, fragmentKey, hiddenInputName, defaultValue,
    language, height, lineNumbers, lineWrapping, indentWithTabs, indentSize,
    theme, readOnly, disabled, placeholder,
  } = props

  // Synthetic `CollabRoom` for `useCollabSeed` — this component takes
  // `ydoc / provider / synced` as separate props rather than the full
  // context object so the wrapper in `CodeMirrorEditor.tsx` keeps
  // control of which fields it threads through. Recomputed only when
  // the underlying handles change; `useCollabSeed`'s effect deps key
  // on the room identity.
  const seedRoom = useMemo<CollabRoom | null>(() => {
    if (!ydoc || !provider) return null
    return {
      ydoc,
      provider,
      ...(synced ? { synced } : {}),
    }
  }, [ydoc, provider, synced ?? null])

  const hostRef      = useRef<HTMLDivElement | null>(null)
  const viewRef      = useRef<EditorView | null>(null)
  const lastTextRef  = useRef<string>(defaultValue)
  const [text, setText] = useState<string>(defaultValue)
  const themeIsDark  = useThemeIsDark(theme)

  // Stable Compartments — created once per component instance, reused across
  // remounts. Reconfigured by the prop-mirror effects below.
  const editableCompartment     = useRef<Compartment>(new Compartment())
  const lineNumbersCompartment  = useRef<Compartment>(new Compartment())
  const lineWrappingCompartment = useRef<Compartment>(new Compartment())
  const indentCompartment       = useRef<Compartment>(new Compartment())
  const themeCompartment        = useRef<Compartment>(new Compartment())

  // Only fragmentKey + language force a teardown: the Y.Text binding and the
  // language-support extension can't be swapped via Compartment.
  const mountKey = `${fragmentKey}::${language ?? ''}`

  useEffect(() => {
    if (!hostRef.current) return
    const ydocAny     = ydoc as { getText: (k: string) => unknown }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerAny = provider as ({ awareness?: any } | null | undefined)
    if (!ydocAny || typeof ydocAny.getText !== 'function') {
      return undefined
    }

    const yText = ydocAny.getText(fragmentKey) as Y.Text
    const awareness = providerAny?.awareness ?? null

    const extensions: Extension[] = []
    extensions.push(basicSetup)
    extensions.push(history())
    extensions.push(keymap.of([...defaultKeymap, ...historyKeymap, ...yUndoManagerKeymap]))
    extensions.push(lineNumbersCompartment.current.of(buildLineNumbersExtension(lineNumbers)))
    extensions.push(lineWrappingCompartment.current.of(buildLineWrappingExtension(lineWrapping)))
    extensions.push(indentCompartment.current.of(buildIndentExtension(indentWithTabs, indentSize)))
    const langFactory = language ? getCodeLanguage(language) : undefined
    if (langFactory) extensions.push(langFactory())
    extensions.push(editableCompartment.current.of(buildEditableExtension(disabled, readOnly)))
    extensions.push(themeCompartment.current.of(buildThemeExtension(themeIsDark, height)))

    // y-codemirror.next: bind editor doc to Y.Text + (optional) awareness for
    // remote cursors. Pass `awareness ?? undefined` — the implementation
    // wraps remote-selection wiring in `if (awareness)` so undefined disables
    // cursor decorations cleanly. `undoManager: false` lets our own
    // `historyKeymap` run on the plain CodeMirror history (Yjs maintains its
    // own per-client undo stack via the keymap we already added). The option
    // key is `undoManager` (verified against y-codemirror.next's
    // `index.d.ts` — `{ undoManager: Y.UndoManager | false }`); the prior
    // `as never` cast was bypassing typecheck for no reason and is gone.
    extensions.push(yCollab(yText, awareness, { undoManager: false }))

    // Mirror editor text into React state on every change. `update.docChanged`
    // can fire with an identical `doc.toString()` (IME composition, cursor-only
    // edits) — short-circuit to avoid spurious FormData rerenders.
    extensions.push(EditorView.updateListener.of((update) => {
      if (!update.docChanged) return
      const next = update.state.doc.toString()
      if (next === lastTextRef.current) return
      lastTextRef.current = next
      setText(next)
    }))

    // y-codemirror.next's `ySyncPlugin` assumes editor.doc and yText are
    // already in sync at init time and only observes subsequent deltas — it
    // does NOT pull pre-existing yText content into the editor. So a remount
    // onto a yText that already has content (e.g. after `renameRow` clones a
    // row leaf to a new composite key on PK switch) would paint blank unless
    // we seed here. No double-insert risk: the plugin won't try to insert
    // anything already in the editor doc on first attachment.
    const seed = yText.toString()
    const state = EditorState.create({ doc: seed, extensions })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view

    // First-load seed runs outside this mount effect via `useCollabSeed`
    // — see the call below. It gates on `seedRoom.synced` resolving so
    // we don't conflate "empty stream" with "brand-new record"; same
    // race-window caveat (two peers mounting against a brand-new
    // record can both seed → duplicated text). Wait for v1's
    // server-side seed handoff to tighten.

    // Initial mirror of yText into the hidden input (yCollab's first sync
    // happens after EditorView mount; mirror once now and the updateListener
    // takes over for subsequent changes).
    lastTextRef.current = seed
    setText(seed)

    return () => {
      try { view.destroy() } catch { /* ignore */ }
      viewRef.current = null
    }
    // mountKey collapses fragmentKey + language into the single rebuild trigger.
    // Other structural props are reconfigured via Compartments below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountKey])

  // First-load seed gate — runs after the room's first sync resolves
  // (or immediately for legacy rooms without a `synced` Promise). The
  // seedFn checks `yText.length === 0` so subsequent peers joining
  // the same room don't re-seed; pair with the in-mount `yText.toString()`
  // pre-seed above which handles re-mount onto a yText that already has
  // content (e.g. `renameRow` clones).
  useCollabSeed(seedRoom, fragmentKey, (doc) => {
    const yText = (doc as Y.Doc).getText(fragmentKey)
    if (yText.length === 0 && defaultValue) {
      yText.insert(0, defaultValue)
    }
  })

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: editableCompartment.current.reconfigure(buildEditableExtension(disabled, readOnly)) })
  }, [disabled, readOnly])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: lineNumbersCompartment.current.reconfigure(buildLineNumbersExtension(lineNumbers)) })
  }, [lineNumbers])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: lineWrappingCompartment.current.reconfigure(buildLineWrappingExtension(lineWrapping)) })
  }, [lineWrapping])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: indentCompartment.current.reconfigure(buildIndentExtension(indentWithTabs, indentSize)) })
  }, [indentWithTabs, indentSize])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: themeCompartment.current.reconfigure(buildThemeExtension(themeIsDark, height)) })
  }, [themeIsDark, height])

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name={hiddenInputName} value={text} readOnly />
      <div className="overflow-hidden rounded-md border border-input bg-transparent text-sm">
        <div
          ref={hostRef}
          data-pilotiq-collab-code={hiddenInputName}
          aria-label={placeholder ?? undefined}
        />
      </div>
    </div>
  )
}

function buildEditableExtension(disabled: boolean, readOnly: boolean): Extension {
  const locked = disabled || readOnly
  return [
    EditorView.editable.of(!locked),
    EditorState.readOnly.of(locked),
  ]
}

function buildLineNumbersExtension(enabled: boolean): Extension {
  return enabled ? lineNumbersExt() : []
}

function buildLineWrappingExtension(enabled: boolean): Extension {
  return enabled ? EditorView.lineWrapping : []
}

function buildIndentExtension(withTabs: boolean, size: number): Extension {
  return indentUnit.of(withTabs ? '\t' : ' '.repeat(size))
}

function buildThemeExtension(isDark: boolean, height: string | undefined): Extension {
  return EditorView.theme({
    '&':            { height: height ?? '300px' },
    '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', overflow: 'auto' },
    '.cm-content':  { caretColor: 'currentcolor' },
  }, isDark ? { dark: true } : {})
}

// One MutationObserver + one matchMedia listener for the whole page, fanned
// out to all `useThemeIsDark` subscribers via `useSyncExternalStore`. Previous
// implementation installed an observer pair per editor instance, which scaled
// linearly with editor count in dense Repeaters.
const autoDarkListeners = new Set<() => void>()
let autoDarkSubscribed = false
let cachedAutoDark = false

function notifyAutoDarkListeners(): void {
  const next = resolveAutoDark()
  if (next === cachedAutoDark) return
  cachedAutoDark = next
  autoDarkListeners.forEach((l) => l())
}

function ensureAutoDarkSubscribed(): void {
  if (autoDarkSubscribed) return
  if (typeof window === 'undefined') return
  autoDarkSubscribed = true
  cachedAutoDark = resolveAutoDark()
  const observer = new MutationObserver(notifyAutoDarkListeners)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', notifyAutoDarkListeners)
}

function subscribeAutoDark(listener: () => void): () => void {
  ensureAutoDarkSubscribed()
  autoDarkListeners.add(listener)
  return () => { autoDarkListeners.delete(listener) }
}

function getAutoDarkSnapshot(): boolean {
  return cachedAutoDark
}

function getAutoDarkServerSnapshot(): boolean {
  return false
}

function useThemeIsDark(keyword: CodeEditorTheme): boolean {
  const isAutoDark = useSyncExternalStore(subscribeAutoDark, getAutoDarkSnapshot, getAutoDarkServerSnapshot)
  if (keyword === 'light') return false
  if (keyword === 'dark')  return true
  return isAutoDark
}

function resolveAutoDark(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return true
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return true
  return false
}
