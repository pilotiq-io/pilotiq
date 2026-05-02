import React, { useEffect, useMemo, useState } from 'react'
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror'
import { indentUnit } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import type { FieldRendererProps } from '@pilotiq/pilotiq/react'
import { useFieldState } from '@pilotiq/pilotiq/react'
import { getCodeLanguage } from '../languageRegistry.js'

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
  const initial = useMemo(() => stringValue(defaultValue), [])
  const [localValue, setLocalValue] = useState<string>(initial)

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
