import type { Pilotiq } from './Pilotiq.js'

const g = globalThis as Record<string, unknown>
const STORE_KEY = '__pilotiq_registry'
if (!g[STORE_KEY]) g[STORE_KEY] = new Map<string, Pilotiq>()
const map = g[STORE_KEY] as Map<string, Pilotiq>

export const PilotiqRegistry = {
  register(panel: Pilotiq): void {
    const name = panel.getConfig().name
    if (map.has(name)) {
      throw new Error(`[Pilotiq] A panel named "${name}" is already registered.`)
    }
    map.set(name, panel)
  },

  all(): Pilotiq[] {
    return [...map.values()]
  },

  get(name: string): Pilotiq | undefined {
    return map.get(name)
  },

  findByPath(path: string): Pilotiq | undefined {
    for (const panel of map.values()) {
      if (panel.getConfig().path === path) return panel
    }
    return undefined
  },

  /** @internal — for testing and dev hot-reload */
  reset(): void {
    map.clear()
  },
}

/**
 * Resolve the live panel instance from the registry, by name.
 *
 * Route handlers close over the `Pilotiq` instance captured when their
 * routes were registered. In dev, editing the panel module re-registers a
 * fresh panel in `PilotiqRegistry` (via the provider's `register()`), but
 * those already-registered handler closures keep pointing at the stale
 * instance — so SSR-rendered chrome and schema lag one reload behind until
 * the server restarts. Re-resolving by name at request time keeps render
 * data in sync with the latest panel. Falls back to the passed instance
 * when the registry has no entry for it (e.g. tests, teardown).
 */
export function livePanel(panel: Pilotiq): Pilotiq {
  return map.get(panel.getConfig().name) ?? panel
}
