/**
 * Lazy-load an optional peer package. Returns the module typed as `T`,
 * or `undefined` if the package isn't installed.
 *
 * Replaces the `try { await import(pkg) as any } catch {}` pattern at
 * call sites with a single typed helper. The string-variable indirection
 * keeps Vite from statically analysing the import — required for optional
 * peers that may not be present in the consuming app's `node_modules`.
 *
 * @example
 * interface BroadcastModule { broadcast(channel: string, event: string, data: unknown): void }
 * const mod = await loadOptional<BroadcastModule>('@rudderjs/broadcast')
 * mod?.broadcast('live:table:articles', 'refresh', { id: 1 })
 */
export async function loadOptional<T>(pkg: string): Promise<T | undefined> {
  try {
    const id = pkg
    return (await import(/* @vite-ignore */ id)) as T
  } catch {
    return undefined
  }
}
