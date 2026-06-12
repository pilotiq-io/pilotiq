/**
 * Panel-i18n delivery registry.
 *
 * This is the *delivery channel* the rudder "Bundled translations & overrides"
 * convention calls for (its point #6 — "make sure the layout's data source
 * includes i18n"). Core owns NO strings and runs NO translation: each package
 * that ships UI strings (`@pilotiq-pro/ai`, a Tiptap slash-menu, …) keeps its
 * own typed `src/i18n/<locale>.ts` defaults + a **sync** `get<Pkg>I18n(locale)`
 * resolver (bundled defaults deep-merged with `@rudderjs/localization`
 * overrides) and registers that resolver here.
 *
 * `panelInfo()` then resolves the active locale once per request, calls every
 * registered resolver, and ships the merged objects on `viewProps.panel.i18n`.
 * Client components read them with `usePanelI18n(namespace)` — never
 * recomputing (the override cache is server-only).
 *
 * The map is `globalThis`-backed so registrations survive Vite's SSR module
 * duplication — same posture as the `configureUsing` registry in `Element.ts`.
 */

/** A package's sync i18n resolver: `(locale) => mergedStrings`. */
export type PanelI18nResolver = (locale: string) => Record<string, unknown>

/** Wire shape: `{ [namespace]: mergedStrings }`. */
export type PanelI18nBundle = Record<string, Record<string, unknown>>

const REGISTRY_KEY = '__pilotiq_panel_i18n_resolvers__'
const NAMESPACE_RE = /^[A-Za-z0-9_-]+$/

function registry(): Map<string, PanelI18nResolver> {
  const g = globalThis as Record<string, unknown>
  let reg = g[REGISTRY_KEY] as Map<string, PanelI18nResolver> | undefined
  if (!reg) {
    reg = new Map<string, PanelI18nResolver>()
    g[REGISTRY_KEY] = reg
  }
  return reg
}

/**
 * Register a package's sync i18n resolver under a namespace. The namespace
 * must match `[A-Za-z0-9_-]+` — it doubles as the `@rudderjs/localization`
 * namespace, i.e. the `lang/<locale>/<namespace>.json` override filename, and
 * the key the resolved object lands under on `panel.i18n`. Re-registering a
 * namespace replaces its resolver (one package owns one namespace).
 *
 * @example
 *   // in @pilotiq-pro/ai, at boot:
 *   import { registerPanelI18n } from '@pilotiq/pilotiq/i18n'
 *   import { getAiI18n } from './i18n/index.js'
 *   registerPanelI18n('pilotiq-ai', getAiI18n)
 */
export function registerPanelI18n(namespace: string, resolve: PanelI18nResolver): void {
  if (!namespace || !NAMESPACE_RE.test(namespace)) {
    throw new Error(
      `registerPanelI18n: invalid namespace "${namespace}" — expected ${String(NAMESPACE_RE)}`,
    )
  }
  if (typeof resolve !== 'function') {
    throw new Error(`registerPanelI18n: resolver for "${namespace}" must be a function`)
  }
  registry().set(namespace, resolve)
}

/** The registered resolvers. Consumed by `resolvePanelI18n()` server-side. */
export function getPanelI18nResolvers(): ReadonlyMap<string, PanelI18nResolver> {
  return registry()
}

/** Test-only: clear the registry. Not exported from any public entry. */
export function _resetPanelI18nForTests(): void {
  registry().clear()
}
