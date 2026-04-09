/**
 * Registry of client-side tool handlers that PanelAgent sub-runs can
 * dispatch to during a chat turn.
 *
 * Free `@pilotiq/panels` ships the empty registry — the class is the
 * contract, pro populates it. The commercial `@pilotiq-pro/ai` package's
 * `AiServiceProvider.register()` calls
 * `ClientToolRegistry.register('update_form_state', handler)` etc. at
 * boot time. Free `SchemaForm.tsx` and the agent dispatcher read via
 * `ClientToolRegistry.get(name)` at turn time.
 *
 * **Why a classic registry and not the React `AiUiContext`?** Client
 * tools are registered at boot (module/provider time), not render time,
 * and they're dispatched from non-React code paths (the chat run loop).
 * Keeping them out of React Context avoids the timing pitfalls called
 * out in the Phase 4 plan D1 ("`SchemaForm.registerClientTool` wrinkle")
 * where mount-ordering could leave tools unregistered when an agent run
 * starts.
 *
 * Mirror of `CollabSupportRegistry` — both are open-core seams that pro
 * packages populate. This registry was introduced in Phase 4.1 as the
 * runtime-side half of the AI extraction seam.
 */

/** Signature any client tool handler must satisfy. Args + return stay
 * loose because the concrete tool schemas live in pro. */
export type ClientToolHandler = (args: any) => unknown | Promise<unknown>

const handlers = new Map<string, ClientToolHandler>()

export class ClientToolRegistry {
  /**
   * Register a client tool handler under `name`. Subsequent calls with
   * the same name overwrite the previous handler — matches the HMR-safe
   * semantics of the old `registerClientTool()` helper.
   */
  static register(name: string, handler: ClientToolHandler): void {
    handlers.set(name, handler)
  }

  /** Look up a registered handler by name, or `undefined` if missing. */
  static get(name: string): ClientToolHandler | undefined {
    return handlers.get(name)
  }

  /** Every registered tool name (insertion order). */
  static all(): string[] {
    return [...handlers.keys()]
  }

  /** Remove a single handler. Returns `true` if it was present. */
  static unregister(name: string): boolean {
    return handlers.delete(name)
  }

  /** Drop every registered handler. Test / HMR escape hatch. */
  static reset(): void {
    handlers.clear()
  }
}
