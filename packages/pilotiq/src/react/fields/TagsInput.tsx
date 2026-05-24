import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { GripVerticalIcon, XIcon } from 'lucide-react'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
import { reorderRows } from './RepeaterInput.js'

/**
 * Free-text tag chips. Value is `string[]`. Renders pill-shaped chips
 * for each committed tag plus an inline text input. Pressing Enter (or
 * any key in `splitKeys`) commits the trimmed draft to the chip set.
 * Pasting a string containing `separator` splits into multiple chips.
 * Backspace on an empty draft removes the last chip.
 *
 * The chip set serializes to a single hidden input as JSON; the server's
 * `coerceFormValues` `tagsInput` branch parses it back into `string[]`.
 *
 * When `reorderable` is set, each chip becomes draggable via native HTML5
 * drag-and-drop. A 2px vertical drop indicator hints where the dragged chip
 * will land. Reuses `reorderRows` from RepeaterInput so behavior matches.
 */
export function TagsInput({
  name, defaultValue, disabled, placeholder, suggestions, separator, splitKeys, maxTags, reorderable,
}: {
  name:         string
  defaultValue: unknown
  disabled:     boolean
  placeholder:  string | undefined
  suggestions:  string[]
  separator:    string | null
  splitKeys:    string[]
  maxTags:      number | null
  reorderable:  boolean
}): React.ReactElement {
  const fs = useFieldState(name)

  const initial = useMemo<string[]>(() => toArray(defaultValue), [])
  const [localTags, setLocalTags] = useState<string[]>(initial)
  const [draft, setDraft] = useState<string>('')
  const [focused, setFocused] = useState<boolean>(false)
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const canReorder = reorderable && !disabled

  const tags = fs.controlled ? toArray(fs.value) : localTags

  const setTags = (next: string[]): void => {
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else                { setLocalTags(next); fs.triggerLive(next) }
  }

  // Cross-tree applier — chip set lives in React; hidden mirror is a
  // write-only JSON serialization. FieldShell skips its generic
  // registration for fieldType === 'tagsInput'.
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const next = toArray(suggestion.suggestedValue)
      const cur = fsRef.current
      if (cur.controlled) { cur.setValue(next); cur.triggerLive(next) }
      else { setLocalTags(next); cur.triggerLive(next) }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

  const canAddMore = maxTags == null || tags.length < maxTags

  const addTag = (raw: string): void => {
    const t = raw.trim()
    if (!t) return
    if (tags.includes(t)) return
    if (!canAddMore) return
    setTags([...tags, t])
  }

  const addMany = (raws: string[]): void => {
    if (raws.length === 0) return
    const next = tags.slice()
    const seen = new Set(next)
    for (const r of raws) {
      const t = r.trim()
      if (!t || seen.has(t)) continue
      if (maxTags != null && next.length >= maxTags) break
      next.push(t)
      seen.add(t)
    }
    if (next.length !== tags.length) setTags(next)
  }

  const removeTag = (idx: number): void => {
    setTags(tags.filter((_, i) => i !== idx))
  }

  const onChipDragStart = (idx: number) => (e: React.DragEvent<HTMLSpanElement>): void => {
    if (!canReorder) return
    setDragFromIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox refuses to start a drag without setData on the dataTransfer.
    e.dataTransfer.setData('text/plain', String(idx))
  }

  const onChipDragOver = (idx: number) => (e: React.DragEvent<HTMLSpanElement>): void => {
    if (dragFromIdx == null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const before = e.clientX < rect.left + rect.width / 2
    setDropAt(before ? idx : idx + 1)
  }

  const onChipDrop = (e: React.DragEvent<HTMLSpanElement>): void => {
    if (dragFromIdx == null || dropAt == null) {
      setDragFromIdx(null); setDropAt(null)
      return
    }
    e.preventDefault()
    const next = reorderRows(tags, dragFromIdx, dropAt)
    if (next !== tags) setTags(next)
    setDragFromIdx(null)
    setDropAt(null)
  }

  const onChipDragEnd = (): void => {
    setDragFromIdx(null)
    setDropAt(null)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    // Backspace on an empty draft pops the most recent chip.
    if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      e.preventDefault()
      removeTag(tags.length - 1)
      return
    }
    // Commit on splitKeys OR on the configured separator char.
    const isSplit = splitKeys.includes(e.key) || (separator !== null && e.key === separator)
    if (isSplit && draft.trim() !== '') {
      e.preventDefault()
      addTag(draft)
      setDraft('')
    }
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = e.target.value
    // Paste-friendly: split on separator inline as the user types.
    if (separator !== null && v.includes(separator)) {
      const parts = v.split(separator)
      const tail  = parts.pop() ?? ''
      addMany(parts)
      setDraft(tail)
      return
    }
    setDraft(v)
  }

  const onBlur = (): void => {
    setFocused(false)
    if (draft.trim() !== '') {
      addTag(draft)
      setDraft('')
    }
  }

  const filteredSuggestions = useMemo(() => {
    if (!focused || suggestions.length === 0) return []
    const needle = draft.trim().toLowerCase()
    const taken  = new Set(tags)
    return suggestions
      .filter(s => !taken.has(s))
      .filter(s => needle === '' || s.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [focused, draft, suggestions, tags])

  const hiddenValue = useMemo(() => JSON.stringify(tags), [tags])

  return (
    <div className="relative">
      <input type="hidden" name={name} value={hiddenValue} readOnly />
      <div
        className={[
          'flex flex-wrap items-center gap-1 min-h-8 px-2 py-1 rounded-lg border bg-transparent text-sm',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          disabled ? 'opacity-50 pointer-events-none' : 'cursor-text',
        ].join(' ')}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((t, i) => (
          <React.Fragment key={`${t}-${i}`}>
            {canReorder && dropAt === i && dragFromIdx !== null && dragFromIdx !== i && dragFromIdx + 1 !== i && (
              <span aria-hidden className="inline-block w-0.5 h-5 bg-primary rounded self-center" />
            )}
            <span
              className={[
                'inline-flex items-center gap-1 rounded bg-secondary text-secondary-foreground text-xs px-2 py-0.5',
                canReorder ? 'cursor-grab active:cursor-grabbing' : '',
                dragFromIdx === i ? 'opacity-50' : '',
              ].join(' ')}
              draggable={canReorder}
              onDragStart={canReorder ? onChipDragStart(i) : undefined}
              onDragOver={canReorder ? onChipDragOver(i) : undefined}
              onDrop={canReorder ? onChipDrop : undefined}
              onDragEnd={canReorder ? onChipDragEnd : undefined}
            >
              {canReorder && (
                <GripVerticalIcon
                  className="size-3 text-muted-foreground -ml-0.5"
                  aria-hidden
                />
              )}
              <span>{t}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); removeTag(i) }}
                disabled={disabled}
                aria-label={`Remove ${t}`}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          </React.Fragment>
        ))}
        {canReorder && dropAt === tags.length && dragFromIdx !== null && dragFromIdx !== tags.length - 1 && (
          <span aria-hidden className="inline-block w-0.5 h-5 bg-primary rounded self-center" />
        )}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-[6ch] bg-transparent outline-none border-none text-sm py-0.5"
          value={draft}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={onBlur}
          disabled={disabled || !canAddMore}
          placeholder={tags.length === 0 ? placeholder : undefined}
        />
      </div>
      {filteredSuggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="block w-full text-left text-sm px-2 py-1 hover:bg-accent"
              // mousedown beats the input's blur — otherwise the click
              // never lands because blur clears `focused` first and the
              // dropdown unmounts before onClick fires.
              onMouseDown={(e) => {
                e.preventDefault()
                addTag(s)
                setDraft('')
                inputRef.current?.focus()
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function toArray(v: unknown): string[] {
  if (v === undefined || v === null || v === '') return []
  if (Array.isArray(v)) return v.map(String).filter(s => s !== '')
  if (typeof v === 'string') {
    // Tolerate JSON-encoded arrays for record-load default-values.
    if (v.startsWith('[')) {
      try {
        const parsed = JSON.parse(v)
        if (Array.isArray(parsed)) return parsed.map(String).filter(s => s !== '')
      } catch { /* fall through */ }
    }
    return [v]
  }
  return []
}
