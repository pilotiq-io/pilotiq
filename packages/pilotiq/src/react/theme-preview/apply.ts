import { resolveTheme } from '../../theme/resolve.js'
import { generateThemeCSS } from '../../theme/generate-css.js'
import type { ThemeConfig } from '../../theme/types.js'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Fontshare overrides for fonts not on Google Fonts.
const FONTSHARE_URLS: Record<string, string> = {
  Satoshi: 'https://api.fontshare.com/v2/css?f[]=satoshi@300,500,700&display=swap',
}

export function fontStylesheetUrl(family: string): string {
  return FONTSHARE_URLS[family]
    ?? `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
}

/** Apply theme to parent page immediately — updates the <style> tag AND inline styles. */
export function applyToParent(config: Partial<ThemeConfig>) {
  const merged: ThemeConfig = { preset: 'vega', ...config }
  const resolved = resolveTheme(merged)
  const css = generateThemeCSS(resolved)

  // Update the ThemeProvider's <style> tag so both light and dark mode vars are current
  const id = 'pilotiq-theme'
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  style.textContent = css

  // Also set inline styles for immediate visual feedback (overrides @layer)
  const root = document.documentElement
  const isDark = root.classList.contains('dark')
  const vars = isDark ? resolved.dark : resolved.light

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  root.style.setProperty('--radius', resolved.radius)
  root.style.setProperty('--spacing', resolved.spacing)
  if (resolved.fontFamily?.body) {
    root.style.setProperty('--font-sans', resolved.fontFamily.body)
    root.style.setProperty('--default-font-family', resolved.fontFamily.body)
  }
  if (resolved.fontFamily?.heading) {
    root.style.setProperty('--font-heading', resolved.fontFamily.heading)
  }
}

/**
 * Apply config changes to a live preview document — patches CSS vars, font
 * links, mode class, and preset fingerprint text WITHOUT reloading the iframe.
 * Called on every config/mode change so the user's scroll position survives.
 */
export function applyConfigToDoc(doc: Document, config: Partial<ThemeConfig>, mode: 'light' | 'dark') {
  const merged: ThemeConfig = { preset: 'vega', ...config }
  const resolved = resolveTheme(merged)
  const themeCSS = generateThemeCSS(resolved)

  // Light/dark switch — generateThemeCSS emits `.dark { ... }`, so toggling
  // the class on <html> picks up the right var set without a re-render.
  doc.documentElement.className = mode

  // Theme CSS — single <style id="pilotiq-theme"> we keep refilling.
  let style = doc.getElementById('pilotiq-theme') as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.id = 'pilotiq-theme'
    doc.head.appendChild(style)
  }
  style.textContent = themeCSS

  // Font links — diff against current set so the browser doesn't re-fetch
  // already-loaded stylesheets (avoids the brief FOIT on every config change).
  const wanted = new Set<string>()
  if (resolved.fonts?.body) wanted.add(resolved.fonts.body)
  if (resolved.fonts?.heading) wanted.add(resolved.fonts.heading)
  const existing = doc.querySelectorAll<HTMLLinkElement>('link[data-pilotiq-font]')
  const haveSet = new Set<string>()
  existing.forEach(link => {
    const family = link.dataset.pilotiqFont ?? ''
    if (!wanted.has(family)) link.remove()
    else haveSet.add(family)
  })
  for (const family of wanted) {
    if (haveSet.has(family)) continue
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = fontStylesheetUrl(family)
    link.dataset.pilotiqFont = family
    doc.head.appendChild(link)
  }

  // Preset fingerprint heading — only piece of body text that depends on config.
  const fp = doc.getElementById('preset-fingerprint')
  if (fp) fp.textContent = `${cap(config.preset ?? 'vega')} - ${resolved.fonts?.heading ?? 'System'}`
}
