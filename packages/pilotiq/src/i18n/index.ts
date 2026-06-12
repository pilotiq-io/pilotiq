/**
 * `@pilotiq/pilotiq/i18n` — the panel-i18n delivery channel.
 *
 * Packages that ship UI strings follow the rudder "Bundled translations &
 * overrides" convention (typed `src/i18n/<locale>.ts` defaults + a sync
 * `get<Pkg>I18n(locale)` deep-merge resolver + a provider that preloads the
 * override namespace) and `registerPanelI18n(namespace, resolver)` here. Core
 * resolves the active locale server-side in `panelInfo()` (via
 * `resolvePanelI18n`) and ships the merged objects on `viewProps.panel.i18n`.
 * Client components read them with `usePanelI18n(namespace)` from
 * `@pilotiq/pilotiq/react`.
 *
 * Client-safe entry — pure registry + a lazily-imported resolver — so a panel
 * module re-imported on the client can call `registerPanelI18n` at module
 * scope without dragging in the node-only main barrel.
 */
export {
  registerPanelI18n,
  getPanelI18nResolvers,
  _resetPanelI18nForTests,
  type PanelI18nResolver,
  type PanelI18nBundle,
} from './registry.js'

export { resolvePanelI18n, _setTestLocale } from './resolve.js'
