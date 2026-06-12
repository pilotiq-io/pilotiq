/**
 * Alert variant primitives — shared by the node (`contentBlocks.ts`), its
 * React NodeView (`AlertNodeView.tsx`), and the read-side serializer
 * (`render.ts`). Kept dependency-free (no `@tiptap/*`) so the server
 * renderer can import it without pulling a Tiptap runtime.
 *
 * `info` / `warning` / `success` / `tip` are presets (default icon + accent);
 * `custom` is the user-driven variant (own icon + color, Phase 2).
 */
export const ALERT_VARIANTS = ['info', 'warning', 'success', 'tip', 'custom'] as const
export type AlertType = (typeof ALERT_VARIANTS)[number]

export const ALERT_VARIANT_LABEL: Record<AlertType, string> = {
  info: 'Info', warning: 'Warning', success: 'Success', tip: 'Tip', custom: 'Custom',
}

/** Coerce an unknown value to a known variant, defaulting to `info`. */
export function coerceAlertType(value: unknown): AlertType {
  return (ALERT_VARIANTS as readonly string[]).includes(String(value)) ? (value as AlertType) : 'info'
}

/**
 * Curated icon library — inner SVG markup (lucide paths) keyed by name. Shared
 * by the NodeView picker (`AlertNodeView`) and the read-side renderer
 * (`render.ts`) so the editor and published output never drift. Hand-picked
 * (no `lucide-react` dep, no icon font) so the whole set is ~1-2KB gzipped.
 * Wrap in `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
 * stroke-width="2" stroke-linecap="round" stroke-linejoin="round">…</svg>`.
 */
export const ALERT_ICONS: Record<string, string> = {
  info:      '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  warning:   '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check:     '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  sparkles:  '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/>',
  bell:      '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  flame:     '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  star:      '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  heart:     '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  shield:    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  zap:       '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  flag:      '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  bookmark:  '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  rocket:    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  help:      '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  error:     '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  pin:       '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
}

/** Icon keys, in picker display order. */
export const ALERT_ICON_KEYS = Object.keys(ALERT_ICONS)

/** The default icon key per variant (used when the block sets no `icon`). */
export const VARIANT_DEFAULT_ICON: Record<AlertType, string> = {
  info: 'info', warning: 'warning', success: 'check', tip: 'lightbulb', custom: 'sparkles',
}

/**
 * Resolve the inner SVG for a block: the explicit `icon` override when set +
 * known, else the variant's default. Shared by the editor + read-side render.
 */
export function resolveAlertIconInner(iconKey: string | undefined, variant: AlertType): string {
  if (iconKey && ALERT_ICONS[iconKey]) return ALERT_ICONS[iconKey] as string
  return ALERT_ICONS[VARIANT_DEFAULT_ICON[variant]] as string
}

// ── Custom SVG (user-pasted) — sanitized allowlist ───────────────────────────
//
// Custom SVG is raw user markup that renders on PUBLIC pages, so it's an XSS
// surface. We sanitize with a conservative pure-string allowlist (no DOMPurify
// — keeps the bundle lean and works server-side in render.ts): only known
// presentational SVG tags + geometry/paint attributes survive; scripts, event
// handlers, external refs (`use`/`image`/`a`/`href`), `<style>`, `<animate>`,
// `<foreignObject>` and unknown attributes are dropped. Applied on input AND on
// every render (defence in depth — a tampered stored attr stays safe).

const SVG_ALLOWED_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'defs', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc', 'clippath',
])

const SVG_ALLOWED_ATTRS = new Set([
  'viewbox', 'xmlns', 'width', 'height', 'preserveaspectratio',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit',
  'fill-opacity', 'fill-rule', 'clip-rule', 'clip-path', 'opacity', 'transform',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'points', 'class', 'gradientunits', 'gradienttransform', 'offset',
  'stop-color', 'stop-opacity', 'id',
])

/**
 * Sanitize a user-pasted SVG string to a safe subset. Returns '' for anything
 * that isn't an `<svg>` element or that sanitizes to nothing.
 */
export function sanitizeIconSvg(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  let s = raw.trim()
  if (!/^<svg[\s>]/i.test(s)) return ''
  // Drop comments / CDATA / PIs / doctype, then dangerous element blocks whole.
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
       .replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '')
  s = s.replace(/<(script|style|foreignObject)\b[\s\S]*?<\/\1\s*>/gi, '')
  // Allowlist every remaining tag + its attributes.
  s = s.replace(/<\/?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\s*(\/?)>/g, (_m, tag, attrs, slash) => {
    const name = String(tag).toLowerCase()
    if (!SVG_ALLOWED_TAGS.has(name)) return ''
    if (_m.startsWith('</')) return `</${name}>`
    const kept: string[] = []
    const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g
    let am: RegExpExecArray | null
    while ((am = attrRe.exec(attrs)) !== null) {
      const an = (am[1] ?? '').toLowerCase()
      if (!SVG_ALLOWED_ATTRS.has(an)) continue
      const av = (am[2] ?? '').replace(/^["']|["']$/g, '')
      if (/javascript:|expression\(|[<>]/i.test(av)) continue
      kept.push(`${an}="${av.replace(/"/g, '&quot;')}"`)
    }
    return `<${name}${kept.length ? ' ' + kept.join(' ') : ''}${slash ? ' /' : ''}>`
  })
  s = s.trim()
  return /^<svg[\s>]/i.test(s) ? s : ''
}

const ICON_SVG_WRAP_OPEN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'

/**
 * Build the FULL `<svg>` string for a block: a sanitized user `iconSvg` when
 * present, else the (library or variant-default) icon wrapped in the standard
 * stroke svg. Shared by the editor NodeView and the read-side renderer.
 */
export function buildAlertIconSvg(iconKey: string | undefined, iconSvg: string | undefined, variant: AlertType): string {
  const custom = sanitizeIconSvg(iconSvg)
  if (custom) return custom
  return `${ICON_SVG_WRAP_OPEN}${resolveAlertIconInner(iconKey, variant)}</svg>`
}
