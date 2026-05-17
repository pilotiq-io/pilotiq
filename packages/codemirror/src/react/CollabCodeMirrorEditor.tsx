import React, { useEffect, useMemo, useRef, useState } from 'react'
import { EditorView, lineNumbers as lineNumbersExt, keymap } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { basicSetup } from 'codemirror'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { onProviderSynced, type SyncedProviderLike } from '@pilotiq/pilotiq/react'
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
   * for cursor presence. `provider.synced` / `provider.once('synced', …)` are
   * used to defer first-load seeding until the server-side ydoc has streamed in.
   */
  provider:        unknown
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
 */
export function CollabCodeMirrorEditor(props: CollabCodeMirrorEditorProps): React.ReactElement {
  const {
    ydoc, provider, fragmentKey, hiddenInputName, defaultValue,
    language, height, lineNumbers, lineWrapping, indentWithTabs, indentSize,
    theme, readOnly, disabled, placeholder,
  } = props

  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [text, setText] = useState<string>(defaultValue)
  const themeIsDark = useThemeIsDark(theme)

  // Re-mount the editor when any structural prop changes. Stable per field;
  // `readOnly`/`disabled` are handled via a `Compartment` reconfigure below
  // so we don't tear down the doc binding for runtime state changes.
  const mountKey = useMemo(
    () => `${fragmentKey}::${language ?? ''}::${lineNumbers}::${lineWrapping}::${indentWithTabs}::${indentSize}::${themeIsDark ? 'dark' : 'light'}`,
    [fragmentKey, language, lineNumbers, lineWrapping, indentWithTabs, indentSize, themeIsDark],
  )

  const editableCompartment = useRef<Compartment>(new Compartment())

  useEffect(() => {
    if (!hostRef.current) return
    const ydocAny     = ydoc as { getText: (k: string) => unknown }
    const providerAny = provider as ({ awareness?: unknown } & SyncedProviderLike) | null | undefined
    if (!ydocAny || typeof ydocAny.getText !== 'function') {
      return undefined
    }

    const yText = ydocAny.getText(fragmentKey) as Y.Text
    const awareness = providerAny?.awareness ?? null

    const extensions: Extension[] = []
    extensions.push(basicSetup)
    extensions.push(history())
    extensions.push(keymap.of([...defaultKeymap, ...historyKeymap, ...yUndoManagerKeymap]))
    if (lineNumbers) extensions.push(lineNumbersExt())
    if (lineWrapping) extensions.push(EditorView.lineWrapping)
    extensions.push(indentUnit.of(indentWithTabs ? '\t' : ' '.repeat(indentSize)))
    const langFactory = language ? getCodeLanguage(language) : undefined
    if (langFactory) extensions.push(langFactory())
    extensions.push(editableCompartment.current.of(buildEditableExtension(disabled, readOnly)))
    extensions.push(EditorView.theme({
      '&':           { height: height ?? '300px' },
      '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', overflow: 'auto' },
      '.cm-content': { caretColor: 'currentcolor' },
    }, themeIsDark ? { dark: true } : {}))

    // y-codemirror.next: bind editor doc to Y.Text + (optional) awareness for
    // remote cursors. Pass `awareness ?? undefined` — the implementation
    // wraps remote-selection wiring in `if (awareness)` so undefined disables
    // cursor decorations cleanly. `undoManager: false` lets our own
    // `historyKeymap` run on the plain CodeMirror history (Yjs maintains its
    // own per-client undo stack via the keymap we already added).
    extensions.push(yCollab(yText, awareness, { undoManager: false } as never))

    // Mirror editor text into React state on every change. Single doc-read
    // per change (cheap — CodeMirror's doc is a rope).
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setText(update.state.doc.toString())
      }
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

    // First-load seed: brand-new records arrive with an empty Y.Text + a
    // server-rendered defaultValue. Wait for provider sync (so we know the
    // emptiness isn't just "not yet streamed"), then push defaultValue into
    // yText if it's still empty. Two peers mounting against a brand-new
    // record can both seed → duplicated text; same window as
    // `CollabTextRenderer`'s plain-text seed. Acceptable for v1.
    let didSeed = false
    const trySeed = (): void => {
      if (didSeed) return
      didSeed = true
      try {
        if (yText.length === 0 && defaultValue) {
          yText.insert(0, defaultValue)
        }
      } catch {
        // ignore
      }
    }
    const seedCleanup = onProviderSynced(providerAny ?? null, trySeed)

    // Initial mirror of yText into the hidden input (yCollab's first sync
    // happens after EditorView mount; mirror once now and the updateListener
    // takes over for subsequent changes).
    setText(seed)

    return () => {
      seedCleanup()
      try { view.destroy() } catch { /* ignore */ }
      viewRef.current = null
    }
    // mountKey collapses the structural deps into a single rebuild trigger.
    // Other deps are stable per mount or handled via reconfigure below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountKey])

  // Reconfigure editable state without re-mounting the editor (preserves
  // CRDT binding, cursor, undo history, etc).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableCompartment.current.reconfigure(buildEditableExtension(disabled, readOnly)),
    })
  }, [disabled, readOnly])

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

function useThemeIsDark(keyword: CodeEditorTheme): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (keyword === 'light') return false
    if (keyword === 'dark')  return true
    if (typeof window === 'undefined') return false
    return resolveAutoDark()
  })

  useEffect(() => {
    if (keyword === 'light') { setIsDark(false); return }
    if (keyword === 'dark')  { setIsDark(true);  return }

    const update = (): void => setIsDark(resolveAutoDark())
    update()

    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)

    return () => {
      observer.disconnect()
      mq.removeEventListener('change', update)
    }
  }, [keyword])

  return isDark
}

function resolveAutoDark(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return true
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return true
  return false
}
