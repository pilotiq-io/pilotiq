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
