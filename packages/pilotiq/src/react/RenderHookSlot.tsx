'use client'

import React from 'react'
import type { ElementMeta } from '../schema/Element.js'
import type { RenderHookMap, RenderHookName } from '../RenderHook.js'
import { SchemaRenderer } from './SchemaRenderer.js'

/**
 * Mount point for a named render-hook slot. Reads pre-resolved
 * `ElementMeta[]` from the wire payload and walks them through the
 * existing `<SchemaRenderer>` so every Element type (Heading / Alert /
 * Form / Table / …) renders the same way it does in the main schema
 * tree.
 *
 * Renders `null` when no hooks were registered for the slot — every
 * supported chrome / page-role position mounts a `<RenderHookSlot>`
 * unconditionally, so the wire payload stays sparse on panels that
 * don't use render hooks.
 *
 *   <RenderHookSlot name="panels::topbar.start" hooks={panel.renderHooks} />
 */
export function RenderHookSlot({
  name,
  hooks,
}: {
  name:  RenderHookName
  hooks: RenderHookMap | undefined
}) {
  const elements = hooks?.[name]
  if (!elements || elements.length === 0) return null
  return <SchemaRenderer elements={elements as ElementMeta[]} />
}
