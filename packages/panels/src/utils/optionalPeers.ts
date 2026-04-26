/**
 * Type shapes for optional peer packages loaded via `loadOptional`.
 *
 * These are intentionally narrow — only the surface that panels actually
 * calls. We don't depend on the source packages' types, so this stays
 * decoupled and the optional peers can be absent at install time.
 */

export interface BroadcastModule {
  broadcast(channel: string, event: string, data: unknown): void
}

export interface SyncModule {
  Sync: {
    seed?(docName: string, fields: Record<string, unknown>): Promise<void> | void
  }
}

export interface YjsModule {
  Doc: new () => YDocLike
  applyUpdate(doc: YDocLike, update: Uint8Array): void
}

export interface YDocLike {
  getMap(name: string): {
    forEach(fn: (value: unknown, key: string) => void): void
  }
  destroy(): void
}

export interface ImagePipeline {
  optimize(): ImagePipeline
  resize(width: number, height?: number): ImagePipeline
  fit(mode: 'cover' | 'contain' | 'inside' | 'outside'): ImagePipeline
  format(fmt: string): ImagePipeline
  quality(q: number): ImagePipeline
  stripMetadata(): ImagePipeline
  conversions(specs: unknown): ImagePipeline
  toBuffer(): Promise<Buffer>
}

export interface ImageModule {
  image(input: Buffer): ImagePipeline
}
