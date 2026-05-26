/**
 * Minimal RFC 4180 CSV codec — used by `Action.export` / `Action.import`
 * factories. In-memory only (string in / string out); streaming deferred.
 *
 * Intentional shape choices:
 * - Encoder writes CRLF line endings + double-quote escaping.
 * - Parser strips a leading BOM, handles LF or CRLF, doesn't infer types
 *   (every cell is returned as a string — the importer does the coerce).
 * - No third-party dep — both functions stay <150 LOC. Pull in
 *   `papaparse` only if a real-world edge case slips through the test
 *   suite.
 */

export interface CsvColumn {
  /** Object key the row value is read from. */
  key:    string
  /** Header text written to row 1. Defaults to `key` when omitted. */
  label?: string
}

const DELIM = ','
const QUOTE = '"'
const CRLF  = '\r\n'

/**
 * Render an array of row objects as an RFC 4180 CSV string.
 *
 * - `null`, `undefined`, `''` → empty cell.
 * - `Date` → ISO 8601 string.
 * - `boolean / number` → JS `String(...)`.
 * - Any other object → `JSON.stringify(...)` (defensive — most callers
 *   route through `formatStateUsing` upstream so this is the fallback).
 *
 * Quoting kicks in when the cell contains `,`, `"`, `\r`, `\n`, or
 * leading/trailing whitespace. Embedded `"` is doubled.
 */
export function encodeCsv(
  rows:    ReadonlyArray<Record<string, unknown>>,
  columns: ReadonlyArray<CsvColumn>,
): string {
  if (columns.length === 0) return ''

  const headerLine = columns.map(c => escapeCell(c.label ?? c.key)).join(DELIM)
  const bodyLines = rows.map(row =>
    columns.map(c => escapeCell(formatCell(row[c.key]))).join(DELIM)
  )

  return [headerLine, ...bodyLines].join(CRLF) + (rows.length > 0 ? CRLF : '')
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return JSON.stringify(value)
}

function escapeCell(value: string): string {
  if (value === '') return ''
  const needsQuote =
    value.includes(DELIM) ||
    value.includes(QUOTE) ||
    value.includes('\r') ||
    value.includes('\n') ||
    value !== value.trim()
  if (!needsQuote) return value
  return QUOTE + value.replace(/"/g, '""') + QUOTE
}

export interface ParsedCsv {
  headers: string[]
  rows:    Array<Record<string, string>>
}

/**
 * Parse an RFC 4180-shaped CSV string. Tolerant of:
 * - leading UTF-8 BOM
 * - LF or CRLF line endings (mixed within the same file)
 * - optional trailing newline
 *
 * Every cell comes back as a string; type coercion is the importer's job.
 * A row with fewer cells than headers fills missing keys with `''`; a row
 * with extra cells drops them silently (mirrors the major CSV parsers).
 *
 * Throws on:
 * - empty / whitespace-only input
 * - unterminated quoted cell at EOF
 */
export function parseCsv(input: string): ParsedCsv {
  if (input.length === 0) throw new Error('parseCsv: empty input')

  // Strip BOM
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  if (text.trim() === '') throw new Error('parseCsv: empty input')

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  let inQuotes = false

  while (i < text.length) {
    const ch = text[i]!

    if (inQuotes) {
      if (ch === QUOTE) {
        // Escaped quote ("") inside a quoted cell → literal "
        if (text[i + 1] === QUOTE) { cell += QUOTE; i += 2; continue }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }

    // Outside quotes
    if (ch === QUOTE) {
      // RFC 4180 §2.5: quotes only valid at start of a cell. Mid-cell
      // quotes are tolerated as literals (matches Excel behavior).
      if (cell === '') { inQuotes = true; i++; continue }
      cell += ch
      i++
      continue
    }
    if (ch === DELIM)   { row.push(cell); cell = ''; i++; continue }
    if (ch === '\n')    { row.push(cell); cell = ''; rows.push(row); row = []; i++; continue }
    if (ch === '\r') {
      // CRLF or bare CR — collapse either to a row terminator
      row.push(cell); cell = ''; rows.push(row); row = []
      i += text[i + 1] === '\n' ? 2 : 1
      continue
    }
    cell += ch
    i++
  }

  if (inQuotes) throw new Error('parseCsv: unterminated quoted cell at EOF')

  // Flush trailing cell + row (no trailing newline case).
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  // Drop a final empty row caused by a trailing newline.
  if (rows.length > 0) {
    const last = rows[rows.length - 1]!
    if (last.length === 1 && last[0] === '') rows.pop()
  }

  if (rows.length === 0) throw new Error('parseCsv: empty input')

  const headers = rows[0]!
  const body    = rows.slice(1)

  const out: Array<Record<string, string>> = body.map(cells => {
    const obj: Record<string, string> = {}
    for (let h = 0; h < headers.length; h++) {
      obj[headers[h]!] = cells[h] ?? ''
    }
    return obj
  })

  return { headers, rows: out }
}
