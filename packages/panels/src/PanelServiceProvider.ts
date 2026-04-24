import { ServiceProvider } from '@rudderjs/core'
import type { MiddlewareHandler, AppRequest, AppResponse } from '@rudderjs/core'
import { debugWarn } from './debug.js'
import { PanelRegistry } from './registries/PanelRegistry.js'
import { registerResolver } from './registries/ResolverRegistry.js'
import { DashboardRegistry } from './registries/DashboardRegistry.js'
import {
  buildPanelMiddleware,
  mountMetaRoutes,
  mountResourceRoutes,
  mountGlobalRoutes,
  mountDashboardRoutes,
} from './handlers/index.js'
import { mountThemeRoutes, loadThemeOverrides } from './handlers/themeRoutes.js'
import { mountNotificationRoutes } from './handlers/notificationRoutes.js'
import { _clearI18nCache, _setLocalizationRegistry } from './i18n/index.js'

/**
 * Best-effort preload of `lang/<locale>/pilotiq.json` overrides into the
 * `@rudderjs/localization` cache so `getPanelI18n()` can resolve them sync.
 * Also wires the `LocalizationRegistry` reference into the panels i18n
 * module so `getOverride()` can read the cache via a typed API instead of
 * reaching into `globalThis`. No-ops if `@rudderjs/localization` isn't
 * installed — panels keeps working with bundled defaults.
 */
async function preloadPanelTranslations(): Promise<void> {
  try {
    const loc = await import('@rudderjs/localization') as {
      preloadNamespace?: (locale: string, namespace: string) => Promise<void>
      LocalizationRegistry?: {
        getConfig(): { locale: string; fallback: string }
        getCached(locale: string, namespace: string): Record<string, unknown> | undefined
      }
    }
    if (!loc.preloadNamespace || !loc.LocalizationRegistry) return
    const { locale, fallback } = loc.LocalizationRegistry.getConfig()
    await loc.preloadNamespace(locale, 'pilotiq')
    if (fallback && fallback !== locale) {
      await loc.preloadNamespace(fallback, 'pilotiq')
    }
    // Wire the typed registry for sync reads from `getOverride()`.
    _setLocalizationRegistry(loc.LocalizationRegistry)
    // Drop any merged result computed before the override landed in cache.
    _clearI18nCache()
  } catch {
    // @rudderjs/localization not installed — bundled defaults only.
  }
}

// Re-export for public API
export { buildDefaultLayout } from './handlers/index.js'

// ─── Panel Service Provider ────────────────────────────────

export class PanelServiceProvider extends ServiceProvider {
  register(): void {
    // Built-in AI quick actions — the `BuiltInAiActionRegistry` seam lives
    // in `src/ai-actions/registry.ts` (Phase 3), but the catalogue and its
    // seeding moved to `@pilotiq-pro/ai`'s `AiServiceProvider.register()`
    // in Phase 4.3. Free panels deliberately does NOT seed the registry —
    // apps without pro get a helpful build-time error from `Field.ai([...])`
    // pointing them to install pro.

    // Collab persist providers — `Field.persist(['websocket', 'indexeddb'])`
    // is gated by `CollabSupportRegistry`. Free panels deliberately does NOT
    // seed it — that's `@pilotiq-pro/collab`'s `CollabServiceProvider`'s job
    // (Phase 5, shipped 2026-04-10). Apps without pro get a helpful
    // build-time error from `Field.persist()` pointing them to install pro.
    //
    // Tests that need collab behavior seed the registry themselves (see
    // `src/__tests__/field.test.ts`).

    // Panel schema (ORM + driver-specific)
    const schemaDir = new URL(/* @vite-ignore */ '../schema', import.meta.url).pathname
    this.publishes([
      { from: `${schemaDir}/panels.prisma`,            to: 'prisma/schema',   tag: 'pilotiq-schema', orm: 'prisma' as const },
      { from: `${schemaDir}/panels.drizzle.sqlite.ts`, to: 'database/schema', tag: 'pilotiq-schema', orm: 'drizzle' as const, driver: 'sqlite' as const },
      { from: `${schemaDir}/panels.drizzle.pg.ts`,     to: 'database/schema', tag: 'pilotiq-schema', orm: 'drizzle' as const, driver: 'postgresql' as const },
      { from: `${schemaDir}/panels.drizzle.mysql.ts`,  to: 'database/schema', tag: 'pilotiq-schema', orm: 'drizzle' as const, driver: 'mysql' as const },
    ])

    // Translation override starter — `lang/en/pilotiq.json` (empty by default).
    // Users edit it to override bundled UI strings; missing keys fall back to
    // bundled defaults. Add a `lang/<locale>/pilotiq.json` to introduce a new
    // locale. See `getPanelI18n()` for the resolution chain.
    const langDir = new URL(/* @vite-ignore */ '../lang/en', import.meta.url).pathname
    this.publishes([
      { from: langDir, to: 'lang/en', tag: 'pilotiq-translations' },
    ])
  }

  async boot(): Promise<void> {
    this.publishes({
      from: new URL(/* @vite-ignore */ '../pages', import.meta.url).pathname,
      to:   'pages/(panels)',
      tag:  'pilotiq-pages',
    })

    // Pre-load panel translation overrides from `lang/<locale>/pilotiq.json`
    // (if `@rudderjs/localization` is installed). `getPanelI18n()` is sync,
    // so the override has to be in the localization cache before any panel
    // request is served. Silently no-ops if localization isn't present.
    await preloadPanelTranslations()

    // Conversation store binding moved to `@pilotiq-pro/ai`'s
    // `AiServiceProvider.boot()` in Phase 4.3. Free no longer knows about
    // `PrismaConversationStore` — pro binds `ai.conversations` into the
    // container itself when it's installed.

    const { router } = await import('@rudderjs/router') as {
      router: {
        get(path: string, handler: (req: AppRequest, res: AppResponse) => unknown, mw?: MiddlewareHandler[]): void
        post(path: string, handler: (req: AppRequest, res: AppResponse) => unknown, mw?: MiddlewareHandler[]): void
        put(path: string, handler: (req: AppRequest, res: AppResponse) => unknown, mw?: MiddlewareHandler[]): void
        delete(path: string, handler: (req: AppRequest, res: AppResponse) => unknown, mw?: MiddlewareHandler[]): void
      }
    }

    // Auto-detect session middleware from DI (bound by @rudderjs/session provider)
    let sessionMw: MiddlewareHandler | undefined
    try {
      sessionMw = this.app.make<MiddlewareHandler>('session.middleware')
    } catch (e) { debugWarn('session.autodetect', e) }

    for (const panel of PanelRegistry.all()) {
      const mw = [
        ...(sessionMw ? [sessionMw] : []),
        ...panel.getMiddleware(),
        ...buildPanelMiddleware(panel),
      ]

      mountMetaRoutes(router, panel, mw)
      // Chat routes (`/api/_chat/*`) are mounted by
      // `@pilotiq-pro/ai`'s `AiServiceProvider.boot()` since Phase 4.3.

      // Theme: when the editor is on, load saved overrides from DB and mount
      // editor routes. This works even when `.theme()` wasn't called — the
      // built-in default preset still renders and the editor persists on top.
      if (panel.hasThemeEditor()) {
        const overrides = await loadThemeOverrides(panel)
        if (overrides) panel.setThemeOverrides(overrides)
        mountThemeRoutes(router, panel, mw)
      } else if (panel.getTheme()) {
        const overrides = await loadThemeOverrides(panel)
        if (overrides) panel.setThemeOverrides(overrides)
      }

      // Notifications
      if (panel.hasNotifications()) {
        mountNotificationRoutes(router, panel, mw)
      }

      for (const ResourceClass of panel.getResources()) {
        mountResourceRoutes(router, panel, ResourceClass, mw)
      }

      for (const GlobalClass of panel.getGlobals()) {
        mountGlobalRoutes(router, panel, GlobalClass, mw)
      }

      mountDashboardRoutes(router, panel, mw)

      // Boot panel plugins
      for (const plugin of panel.getPlugins()) {
        if (plugin.resolvers) {
          for (const [type, resolver] of Object.entries(plugin.resolvers)) {
            registerResolver(type, resolver)
          }
        }
        if (plugin.boot) await plugin.boot(panel, this.app)
      }
    }
  }
}

// ─── Factory ───────────────────────────────────────────────

import type { Panel as PanelType } from './Panel.js'
import type { Application, ProviderClass } from '@rudderjs/core'

/**
 * Register one or more panels and mount their API routes.
 *
 * An optional second argument accepts an array of extension providers
 * (e.g. `panelsLexical()`). These are dynamically registered during boot
 * via `this.app.register()`, keeping all panels-related wiring in one call.
 *
 * @example
 * import { panels } from '@pilotiq/panels'
 * import { panelsLexical } from '@pilotiq/lexical/server'
 * import { adminPanel } from './panels.js'
 *
 * export default [
 *   panels([adminPanel], [panelsLexical()]),
 * ]
 */
export function panels(
  panelList:   PanelType[],
  extensions?: ProviderClass[],
): new (app: Application) => PanelServiceProvider {
  return class PanelsProvider extends PanelServiceProvider {
    register(): void {
      PanelRegistry.reset()
      DashboardRegistry.reset()

      // Built-in AI quick actions — seeded by `@pilotiq-pro/ai`'s
      // `AiServiceProvider.register()` since Phase 4.3. The factory
      // override no longer has anything to seed itself.

      // Collab persist providers — see PanelServiceProvider.register() above.
      // Seeding moved to `@pilotiq-pro/collab`'s CollabServiceProvider in
      // Phase 5 (2026-04-10). Free panels no longer seeds it.

      const publishedSchemas = new Set<string>()

      for (const panel of panelList) {
        PanelRegistry.register(panel)

        for (const plugin of panel.getPlugins()) {
          // Publish plugin schemas (deduplicated — same schema published once)
          if (plugin.schemas) {
            for (const schema of plugin.schemas) {
              const key = `${schema.from}:${schema.to}:${schema.tag}`
              if (!publishedSchemas.has(key)) {
                publishedSchemas.add(key)
                this.publishes([schema])
              }
            }
          }

          if (plugin.register) plugin.register(panel, this.app)
        }
      }
    }

    override async boot(): Promise<void> {
      // Publish plugin pages (deduplicated)
      const publishedPages = new Set<string>()
      for (const panel of panelList) {
        for (const plugin of panel.getPlugins()) {
          if (plugin.pages && !publishedPages.has(plugin.pages)) {
            publishedPages.add(plugin.pages)
            this.publishes({ from: plugin.pages, to: 'pages/(panels)', tag: 'plugin-pages' })
          }
        }
      }

      // Legacy: register extension providers (e.g. panels-lexical, panels-media)
      if (extensions) {
        for (const ext of extensions) {
          await this.app.register(ext)
        }
      }

      await super.boot()
    }
  }
}
