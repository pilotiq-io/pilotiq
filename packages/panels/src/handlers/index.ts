export type { RouterLike, RouteHandler } from './types.js'

export { flattenFields, relationName } from './shared/fields.js'
export { buildPanelMiddleware } from './panelMiddleware.js'
export { mountMetaRoutes } from './metaRoutes.js'
export { mountResourceRoutes } from './resource/index.js'
export { mountGlobalRoutes } from './globalRoutes.js'
export { mountVersionRoutes } from './versionRoutes.js'
export { mountDashboardRoutes, buildDefaultLayout } from './dashboardRoutes.js'
// `mountPanelChat` moved to `@pilotiq-pro/ai` in Phase 4.3.
export { mountThemeRoutes, loadThemeOverrides } from './themeRoutes.js'
