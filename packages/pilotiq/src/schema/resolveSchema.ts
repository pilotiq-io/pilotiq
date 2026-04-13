import type { SchemaElement, SchemaElementMeta } from './SchemaElement.js'
import type { Card } from './Card.js'

export interface SchemaContext {
  user?: { name?: string; email?: string; [key: string]: unknown }
  [key: string]: unknown
}

export type SchemaDefinition =
  | SchemaElement[]
  | ((ctx: SchemaContext) => SchemaElement[] | Promise<SchemaElement[]>)

/**
 * Resolve a schema definition into serializable metadata.
 *
 * Handles:
 * - Static arrays or async factory functions
 * - Nested schemas (Card with inner elements)
 * - Recursive depth tracking
 */
export async function resolveSchema(
  definition: SchemaDefinition | undefined,
  ctx: SchemaContext = {},
): Promise<SchemaElementMeta[]> {
  if (!definition) return []

  const elements = typeof definition === 'function'
    ? await definition(ctx)
    : definition

  return resolveElements(elements, ctx)
}

async function resolveElements(
  elements: SchemaElement[],
  ctx: SchemaContext,
): Promise<SchemaElementMeta[]> {
  const resolved: SchemaElementMeta[] = []

  for (const el of elements) {
    const type = el.getType()
    const meta = el.toMeta() as SchemaElementMeta

    // Recursively resolve nested schemas for container elements
    if (type === 'card') {
      const card = el as Card
      const innerElements = card.getSchema()
      if (innerElements.length > 0) {
        meta['elements'] = await resolveElements(innerElements, ctx)
      }
    }

    resolved.push(meta)
  }

  return resolved
}
