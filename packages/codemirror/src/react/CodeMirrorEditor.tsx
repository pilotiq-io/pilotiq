import React, { useEffect, useMemo, useState } from 'react'
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror'
import { indentUnit } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import type { FieldRendererProps } from '@pilotiq/pilotiq/react'
import {
  useFieldState,
  useCollabRoom,
  useRowCoords,
  parseRowFieldPath,
} from '@pilotiq/pilotiq/react'
import { getCodeLanguage } from '../languageRegistry.js'
import { CollabCodeMirrorEditor } from './CollabCodeMirrorEditor.js'

type CodeEditorTheme = 'auto' | 'light' | 'dark'

/**
 * The pilotiq field renderer for `CodeEditorField`. Registered globally
 * via `registerCodeEditor()`; pilotiq's `SchemaRenderer` looks it up by
 * `fieldType: 'code'` and mounts it inline inside the form.
 *
 * Form integration: a hidden `<input type="hidden" name={field}>`
 * mirrors the current text value, so plain HTML form-post submission
 * works without `FormStateProvider`. When inside a state provider,
 * `useFieldState` controls the value and triggers reactive re-resolves.
 */
export function CodeMirrorEditor(props: FieldRendererProps): React.ReactElement {
  // CodeMirror's EditorView constructor reads `window` at module-init in
  // some code paths — render a placeholder during SSR and mount the real
  // editor after hydration.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return <PlaceholderEditor {...props} />
  }

  return <ClientEditor {...props} />
}

/**
 * Compose the doc-root share key for collab. Mirrors the convention used by
 * `TextLikeInput` for plain-text fields:
 *
 *   - Top-level fields: bare `name`.
 *   - Repeater / Builder row leaves: `${arrayName}.${rowId}.${fieldName}` —
 *     row id is the stable identity, so the share survives row reorders.
 *
 * Returns `null` when the dotted path doesn't match a row shape OR row
 * coords are missing — callers fall through to the local-only editor.
 */
function composeFragmentKey(name: string, rowCoords: { arrayName: string; rowIndex: number; rowId: string } | null): string | null {
  if (!name.includes('.')) return name
  if (!rowCoords) return null
  const parsed = parseRowFieldPath(name)
  if (!parsed) return null
  if (parsed.arrayName !== rowCoords.arrayName) return null
  if (parsed.index     !== rowCoords.rowIndex)  return null
  return `${rowCoords.arrayName}.${rowCoords.rowId}.${parsed.fieldName}`
}

function PlaceholderEditor({ name, defaultValue, placeholder }: FieldRendererProps): React.ReactElement {
  const initial = stringValue(defaultValue)
  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name={name} value={initial} readOnly />
      <div className="rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm text-muted-foreground min-h-[120px]">
        {placeholder ?? 'Loading editor…'}
      </div>
    </div>
  )
}

function ClientEditor(props: FieldRendererProps): React.ReactElement {
  const { el, name } = props

  // Collab branch — y-codemirror.next binding against the room's Y.Doc.
  // Mounts when a `<RecordCollabRoom>` is up-tree AND the field hasn't
  // opted out via `.collab(false)`. Top-level fields bind to bare `name`;
  // Repeater / Builder row leaves bind to `${arrayName}.${rowId}.${fieldName}`
  // so the Y.Text share survives row reorders. Each branch lives in its own
  // component so the hook count stays stable across renders — entering or
  // leaving the collab branch remounts; we never call a different set of
  // hooks under one component instance.
  const room = useCollabRoom()
  const rowCoords = useRowCoords()
  const fieldCollab = el['collab'] as boolean | undefined
  const fragmentKey = composeFragmentKey(name, rowCoords)
  if (room && fieldCollab !== false && fragmentKey !== null) {
    return <CollabBranch {...props} fragmentKey={fragmentKey} room={room} />
  }
  return <LocalBranch {...props} />
}

function CollabBranch(props: FieldRendererProps & { fragmentKey: string; room: { ydoc: unknown; provider: unknown; synced?: Promise<void> } }): React.ReactElement {
  const { el, name, defaultValue, disabled, placeholder, fragmentKey, room } = props
  return (
    <CollabCodeMirrorEditor
      ydoc={room.ydoc}
      provider={room.provider}
      synced={room.synced ?? null}
      fragmentKey={fragmentKey}
      hiddenInputName={name}
      defaultValue={stringValue(defaultValue)}
      language={readString(el['language'])}
      height={readString(el['height'])}
      lineNumbers={readBool(el['lineNumbers'], true)}
      lineWrapping={readBool(el['lineWrapping'], false)}
      indentWithTabs={readBool(el['indentWithTabs'], false)}
      indentSize={readNumber(el['indentSize'], 2)}
      theme={readTheme(el['theme'])}
      readOnly={readBool(el['readOnly'], false)}
      disabled={Boolean(disabled)}
      placeholder={placeholder}
    />
  )
}

function LocalBranch(props: FieldRendererProps): React.ReactElement {
  const { el, name, defaultValue, disabled, placeholder } = props

  const languageId    = readString(el['language'])
  const height        = readString(el['height'])
  const lineNumbers   = readBool(el['lineNumbers'],   true)
  const lineWrapping  = readBool(el['lineWrapping'],  false)
  const indentWithTabs = readBool(el['indentWithTabs'], false)
  const indentSize    = readNumber(el['indentSize'],  2)
  const themeKeyword  = readTheme(el['theme'])
  const readOnly      = readBool(el['readOnly'], false)

  const fs = useFieldState(name)
  // Uncontrolled fallback path locks to the first `defaultValue` seen at
  // mount — same shape as native `<input defaultValue=…>`. Parents that
  // need a fresh starting value across record swaps mount under `key`
  // (FormRenderer keys on `formId` already; Repeater/Builder per-row
  // mounts). When the form opts into reactive state via `Form.stateUrl`,
  // `fs.controlled` flips to true and `value` reads from `fs.value` —
  // the localValue branch is unused in that case.
  const [localValue, setLocalValue] = useState<string>(() => stringValue(defaultValue))

  const value = fs.controlled ? stringValue(fs.value) : localValue
  const setValue = (next: string): void => {
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else                { setLocalValue(next); fs.triggerLive(next) }
  }

  const isDark = useThemeIsDark(themeKeyword)

  const extensions: Extension[] = useMemo(() => {
    const list: Extension[] = []
    const langFactory = languageId ? getCodeLanguage(languageId) : undefined
    if (langFactory) list.push(langFactory())
    list.push(indentUnit.of(indentWithTabs ? '\t' : ' '.repeat(indentSize)))
    if (lineWrapping) list.push(EditorView.lineWrapping)
    if (readOnly || disabled) list.push(EditorState.readOnly.of(true))
    return list
  }, [languageId, indentWithTabs, indentSize, lineWrapping, readOnly, disabled])

  const basicSetup = useMemo(() => ({
    lineNumbers,
    foldGutter:        true,
    highlightActiveLine: true,
    bracketMatching:   true,
    closeBrackets:     true,
    autocompletion:    false,
    indentOnInput:     true,
    tabSize:           indentSize,
  }), [lineNumbers, indentSize])

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name={name} value={value} readOnly />
      <div className="overflow-hidden rounded-md border border-input bg-transparent text-sm">
        <CodeMirror
          value={value}
          height={height ?? '300px'}
          theme={isDark ? 'dark' : 'light'}
          editable={!disabled && !readOnly}
          readOnly={readOnly}
          basicSetup={basicSetup}
          extensions={extensions}
          onChange={(next) => setValue(next)}
          {...(placeholder !== undefined ? { placeholder } : {})}
        />
      </div>
    </div>
  )
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

    // Track the app's `.dark` class (pilotiq's ThemeProvider toggles it on
    // <html>) so the editor follows manual theme switches, not just OS.
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

function stringValue(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return String(v)
}

function readString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function readBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function readNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function readTheme(v: unknown): CodeEditorTheme {
  if (v === 'light' || v === 'dark' || v === 'auto') return v
  return 'auto'
}
