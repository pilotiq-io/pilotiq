/**
 * Server-side resolution of every registered panel-i18n namespace into the
 * `viewProps.panel.i18n` bundle, stamped by `panelInfo()`.
 *
 * Core's only job is to supply the **active locale** to each package's sync
 * resolver — the resolvers themselves own the bundled-defaults + override
 * deep-merge (per the rudder convention). The active locale comes from
 * `@rudderjs/localization` via a variable-string dynamic import (optional
 * soft-dep — zero hard dep on it); when it isn't installed the locale falls
 * back to `'en'`, so resolvers return their bundled defaults and the panel
 * works unchanged.
 *
 * Resolution runs inside the request's locale `AsyncLocalStorage` scope, so
 * `getLocale()` reads the active locale ambiently — no `req` threading needed.
 */

import { getPanelI18nResolvers, type PanelI18nBundle } from './registry.js'

interface LocalizationModule {
  getLocale(): string
}

let _testLocale: string | null | 'unset' = 'unset'

/**
 * Test seam — force the active locale (`null` ⇒ exercise the no-localization
 * fallback path). Pass `undefined` to clear back to the real soft-import.
 */
export function _setTestLocale(locale: string | null | undefined): void {
  _testLocale = locale === undefined ? 'unset' : locale
}

async function activeLocale(): Promise<string> {
  if (_testLocale !== 'unset') return _testLocale ?? 'en'
  const moduleName = '@rudderjs/localization'
  try {
    const mod = (await import(/* @vite-ignore */ moduleName)) as Partial<LocalizationModule>
    return typeof mod.getLocale === 'function' ? mod.getLocale() : 'en'
  } catch {
    return 'en'
  }
}

/**
 * Resolve all registered namespaces against the active locale. Returns
 * `undefined` when nothing is registered (so `panelInfo()` omits the `i18n`
 * key entirely — sparse wire shape). A resolver that throws is skipped; its
 * siblings still resolve.
 */
export async function resolvePanelI18n(): Promise<PanelI18nBundle | undefined> {
  const resolvers = getPanelI18nResolvers()
  if (resolvers.size === 0) return undefined

  const locale = await activeLocale()
  const out: PanelI18nBundle = {}
  for (const [ns, resolve] of resolvers) {
    try {
      out[ns] = resolve(locale)
    } catch {
      // A broken resolver shouldn't take the whole panel down — skip it.
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}
