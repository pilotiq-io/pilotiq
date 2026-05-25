import type { Element } from '../schema/Element.js'
import { Heading } from '../schema/Heading.js'
import { Text } from '../schema/Text.js'
import { Image } from '../schema/Image.js'
import type { Column } from '../Column.js'

/**
 * Record-identity attributes used to build a card automatically from a
 * table's columns when a cards-mode / `stackOnMobile` table has no explicit
 * `cardSchema`. Sourced from the owning `Resource`'s
 * `recordTitleAttribute` / `recordImageAttribute` / `recordDescriptionAttribute`
 * statics (threaded via `LoadTableHooks`). All optional — the builder
 * degrades gracefully when none are set.
 */
export interface AutoCardAttrs {
  recordTitleAttribute?:       string | undefined
  recordImageAttribute?:       string | undefined
  recordDescriptionAttribute?: string | undefined
}

/**
 * Resolve a record's display title — mirrors `Resource.getRecordTitle`'s
 * heuristic (`recordTitleAttribute` → `name` → `title` → `id`) so the card
 * heading matches the rest of the panel.
 */
function resolveTitle(record: Record<string, unknown>, attr: string | undefined): string {
  if (attr !== undefined && record[attr] != null && String(record[attr]) !== '') {
    return String(record[attr])
  }
  for (const k of ['name', 'title']) {
    if (record[k] != null && String(record[k]) !== '') return String(record[k])
  }
  if (record['id'] != null) return String(record['id'])
  return 'Untitled'
}

/** Pick the image URL from the configured attribute, falling back to the
 *  first `ImageColumn`'s value. Returns undefined when neither yields a
 *  non-empty string. */
function resolveImageUrl(
  record:               Record<string, unknown>,
  attr:                 string | undefined,
  firstImageColumnName: string | undefined,
): string | undefined {
  const src = attr ?? firstImageColumnName
  if (src === undefined) return undefined
  const v = record[src]
  return typeof v === 'string' && v !== '' ? v : undefined
}

/**
 * Build the default card content for one record from the table's columns:
 *
 *   [Image?]  — recordImageAttribute, else the first ImageColumn
 *   Heading   — recordTitleAttribute (title)
 *   [Text?]   — recordDescriptionAttribute (muted subtitle)
 *   Text…     — every other column as a muted `Label · value` line
 *
 * Returns unresolved `Element` builders so the caller can splice extras
 * (`cardSchema((record, auto) => [...auto, …])`) before a single
 * `resolveSchema` pass. Column values reuse the row's already-computed
 * `_formatted[col]` so the card matches the table cell-for-cell, falling
 * back to the raw record value. Empty values are skipped.
 */
export function buildAutoCard(
  record:                Record<string, unknown>,
  columns:               Column[],
  formatted:             Record<string, string> | undefined,
  attrs:                 AutoCardAttrs,
  firstImageColumnName?: string | undefined,
): Element[] {
  const els: Element[] = []

  const title    = resolveTitle(record, attrs.recordTitleAttribute)
  const imageUrl = resolveImageUrl(record, attrs.recordImageAttribute, firstImageColumnName)

  if (imageUrl !== undefined) {
    els.push(Image.make(imageUrl).alt(title).size(48).rounded())
  }
  els.push(Heading.make(title).level(3))

  if (attrs.recordDescriptionAttribute !== undefined) {
    const d = record[attrs.recordDescriptionAttribute]
    if (d != null && String(d) !== '') {
      els.push(Text.make(String(d)).size('sm').color('muted'))
    }
  }

  // Columns already represented by the title / image / description slots
  // shouldn't repeat as label·value lines.
  const used = new Set<string>(
    [
      attrs.recordTitleAttribute,
      attrs.recordImageAttribute,
      attrs.recordDescriptionAttribute,
      firstImageColumnName,
    ].filter((s): s is string => typeof s === 'string'),
  )

  for (const col of columns) {
    if (used.has(col.name)) continue
    const raw = formatted?.[col.name] ?? record[col.name]
    if (raw == null || String(raw) === '') continue
    els.push(Text.make(`${col.getLabel()} · ${String(raw)}`).size('sm').color('muted'))
  }

  return els
}
