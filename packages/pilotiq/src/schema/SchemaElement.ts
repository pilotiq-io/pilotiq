/** Base interface for all schema elements. */
export interface SchemaElement {
  getType(): string
  toMeta(): Record<string, unknown>
}

/** Resolved metadata — JSON-serializable, passed to the client via viewProps. */
export type SchemaElementMeta = Record<string, unknown> & { type: string }
