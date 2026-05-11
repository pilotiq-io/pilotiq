/** Apply a built-in `ColumnFormat` to a raw value; returns a string.
 *
 *  Used by both `formatCell` (table layer) and `renderEntry` (infolist
 *  Phase #16). Hoisted out of the table block so EntryRenderer doesn't
 *  need to import across phases. */
export function applyColumnFormat(value: unknown, format: { kind: string; [k: string]: unknown }): string {
  if (value === null || value === undefined || value === '') return ''
  switch (format['kind']) {
    case 'dateTime': {
      const d = value instanceof Date ? value : new Date(String(value))
      if (isNaN(d.getTime())) return String(value)
      // Default — locale-aware short date+time. Custom patterns aren't
      // supported (no date-fns dep); pattern is kept on meta for future use.
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    }
    case 'since': {
      const d = value instanceof Date ? value : new Date(String(value))
      if (isNaN(d.getTime())) return String(value)
      const seconds = Math.round((Date.now() - d.getTime()) / 1000)
      const abs = Math.abs(seconds)
      const past = seconds >= 0
      const fmt = (n: number, unit: string): string =>
        past ? `${n} ${unit}${n === 1 ? '' : 's'} ago` : `in ${n} ${unit}${n === 1 ? '' : 's'}`
      if (abs < 60)        return past ? 'just now' : 'in a moment'
      if (abs < 3600)      return fmt(Math.floor(abs / 60),    'minute')
      if (abs < 86400)     return fmt(Math.floor(abs / 3600),  'hour')
      if (abs < 2592000)   return fmt(Math.floor(abs / 86400), 'day')
      if (abs < 31536000)  return fmt(Math.floor(abs / 2592000), 'month')
      return fmt(Math.floor(abs / 31536000), 'year')
    }
    case 'money': {
      const n = typeof value === 'number' ? value : Number(value)
      if (isNaN(n)) return String(value)
      const currency = String(format['currency'] ?? 'USD')
      const locale   = format['locale'] as string | undefined
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n)
    }
    case 'numeric': {
      const n = typeof value === 'number' ? value : Number(value)
      if (isNaN(n)) return String(value)
      const decimals = format['decimals'] as number | undefined
      const locale   = format['locale']   as string | undefined
      const opts: Intl.NumberFormatOptions = {}
      if (decimals !== undefined) {
        opts.minimumFractionDigits = decimals
        opts.maximumFractionDigits = decimals
      }
      return new Intl.NumberFormat(locale, opts).format(n)
    }
    case 'limit': {
      const s = String(value)
      const n = format['chars'] as number
      return s.length > n ? s.slice(0, n) + '…' : s
    }
    case 'words': {
      const s = String(value).trim()
      if (s.length === 0) return s
      const tokens = s.split(/\s+/)
      const n = format['words'] as number
      return tokens.length > n ? tokens.slice(0, n).join(' ') + '…' : s
    }
    default:
      return String(value)
  }
}
