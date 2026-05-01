import React, { useMemo, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'
import { useFieldState } from '../FormStateContext.js'

/**
 * Free-text tag chips. Value is `string[]`. Renders pill-shaped chips
 * for each committed tag plus an inline text input. Pressing Enter (or
 * any key in `splitKeys`) commits the trimmed draft to the chip set.
 * Pasting a string containing `separator` splits into multiple chips.
 * Backspace on an empty draft removes the last chip.
 *
 * The chip set serializes to a single hidden input as JSON; the server's
 * `coerceFormValues` `tagsInput` branch parses it back into `string[]`.
 */
export function TagsInput({
  name, defaultValue, disabled, placeholder, suggestions, separator, splitKeys, maxTags,
}: {
  name:         string
  defaultValue: unknown
  disabled:     boolean
  placeholder:  string | undefined
  suggestions:  string[]
  separator:    string | null
  splitKeys:    string[]
  maxTags:      number | null
}): React.ReactElement {
  const fs = useFieldState(name)

  const initial = useMemo<string[]>(() => toArray(defaultValue), [])
  const [localTags, setLocalTags] = useState<string[]>(initial)
  const [draft, setDraft] = useState<string>('')
  const [focused, setFocused] = useState<boolean>(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const tags = fs.controlled ? toArray(fs.value) : localTags

  const setTags = (next: string[]): void => {
    if (fs.controlled) { fs.setValue(next); fs.triggerLive(next) }
    else                { setLocalTags(next); fs.triggerLive(next) }
  }

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
          'flex flex-wrap items-center gap-1 min-h-9 px-2 py-1 rounded-md border bg-transparent text-sm',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          disabled ? 'opacity-50 pointer-events-none' : 'cursor-text',
        ].join(' ')}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-secondary text-secondary-foreground text-xs px-2 py-0.5"
          >
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
        ))}
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
