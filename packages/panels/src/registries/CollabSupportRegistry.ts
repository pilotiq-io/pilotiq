/**
 * Registry of enabled collaborative persistence providers.
 *
 * Free `@pilotiq/panels` ships only browser-local persistence modes
 * (`localStorage`, `url`, `session`) for `Field.persist()`. The
 * collaborative modes (`websocket`, `indexeddb`) require the Yjs runtime
 * and the server-side persistence wiring that lives in
 * `@pilotiq-pro/collab`. To prevent silent breakage when an app calls
 * `Field.persist(['websocket'])` without the pro package installed,
 * `Field.persist()` checks this registry at form-build time and throws a
 * helpful error if the requested provider isn't enabled.
 *
 * **Today** (Phase 3): `PanelServiceProvider.register()` seeds
 * `['websocket', 'indexeddb']` so existing apps keep working unchanged.
 *
 * **After Phase 5**: the seed moves into `@pilotiq-pro/collab`'s service
 * provider. Apps without the pro package will hit the helpful error from
 * `Field.persist()` pointing them at `@pilotiq-pro/collab` instead of
 * silently rendering a non-collaborative field.
 *
 * Mirror of `BuiltInAiActionRegistry` — both are Phase 3 seams that pro
 * packages will flip in Phase 4 / Phase 5.
 */

const enabled = new Set<string>()

export class CollabSupportRegistry {
  /** Mark one or more collab persist providers as supported. */
  static enable(providers: string[]): void {
    for (const p of providers) enabled.add(p)
  }

  /** True if `provider` has been registered as supported. */
  static has(provider: string): boolean {
    return enabled.has(provider)
  }

  /** All registered providers (insertion order). */
  static all(): string[] {
    return [...enabled]
  }

  /** Remove every registered provider. Test/HMR escape hatch. */
  static reset(): void {
    enabled.clear()
  }
}
