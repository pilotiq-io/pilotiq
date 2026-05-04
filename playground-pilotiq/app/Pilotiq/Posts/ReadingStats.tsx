/**
 * Demo for `ComponentEntry` — escape-hatch infolist entry.
 *
 * The `BodyStats` element on `PostResource.detail()` resolves the post
 * body via `state(r => r.body ?? '')` and ships the resolved string to
 * this component as the `value` prop. Core's `SchemaRenderer` looks up
 * the component name here at render through
 * `getEntryComponent('ReadingStats')` (see `+Layout.tsx`'s
 * `registerEntryComponents` call) and mounts it with the resolved value.
 *
 * Anything goes here — `ComponentEntry` exists so panels can drop in
 * one-off React (custom maps, audit timelines, syntax-highlighted JSON,
 * …) without inventing new entry built-ins for every shape.
 */

interface Stats {
  words:        number
  characters:   number
  readMinutes:  number
}

// Props match `EntryComponentProps` (`{ value, record? }`).
export function ReadingStats({ value }: { value: unknown }) {
  const text  = typeof value === 'string' ? value : ''
  const stats = compute(text)
  if (stats.words === 0) {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        No body — nothing to read yet.
      </div>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat label="Words"      value={stats.words.toLocaleString()} />
      <Stat label="Characters" value={stats.characters.toLocaleString()} />
      <Stat label="Read"       value={`${stats.readMinutes} min`} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function compute(text: string): Stats {
  const trimmed    = text.trim()
  const words      = trimmed === '' ? 0 : trimmed.split(/\s+/).length
  const characters = text.length
  // 200 wpm — adult silent-read average.
  const readMinutes = Math.max(1, Math.round(words / 200))
  return { words, characters, readMinutes: words === 0 ? 0 : readMinutes }
}
