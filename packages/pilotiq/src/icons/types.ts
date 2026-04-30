import type { IconType } from './registry.js'

/**
 * Top-level icon field type. Accepted on `Resource.icon`, `Global.icon`,
 * `Page.icon`, and `Resource.navigationIcon` (Plan #9).
 *
 * - **String** — kebab-case name, resolved at render through the
 *   user-extensible registry (`registerIcons({ newspaper: Newspaper })`).
 *
 * - **Component reference** — a React component, e.g.,
 *   `import { Newspaper } from 'lucide-react'; static icon = Newspaper`.
 *   Resolved at render through the build-time `_components.ts` manifest
 *   emitted by the Pilotiq Vite plugin: `panelInfo()` ships the owning
 *   class's name in viewProps; the manifest maps that name back to the
 *   component on the client.
 */
export type IconValue = string | IconType | undefined

/**
 * Wire-format for an icon shipped to the client through `viewProps`.
 *
 * - `string` — registry key, looked up via `getIcon(name)`.
 * - `{ class: 'ArticleResource' }` — class-manifest key, looked up
 *   on the client by reading `componentRegistry['ArticleResource'].icon`.
 * - `undefined` — no icon.
 */
export type SerializedIcon = string | { class: string } | undefined

/**
 * Serialize a top-level `IconValue` for transport. Components serialize
 * as `{ class: ownerClassName }` (the owning Resource/Global/Page class
 * provides the manifest key); strings ship as-is.
 *
 * "Component" here covers plain function components, class components,
 * AND React forwardRef / memo objects (`typeof === 'object'`). Most
 * icon libraries (lucide, heroicons, tabler) ship forwardRef objects.
 */
export function serializeIcon(value: IconValue, ownerClassName?: string): SerializedIcon {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  // Anything else that's component-shaped — function, forwardRef object,
  // memo object — becomes a manifest reference.
  if (typeof value === 'function' || typeof value === 'object') {
    if (ownerClassName) return { class: ownerClassName }
  }
  return undefined
}
