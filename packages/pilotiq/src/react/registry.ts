import type { ComponentType } from 'react'
import type { ElementMeta } from '../schema/Element.js'

/**
 * Props every registered field renderer receives. The renderer owns how it
 * wires the input value into form POST — typically via a hidden `<input>`.
 *
 * Kept narrow on purpose: the renderer reads everything else (rules, options,
 * etc.) off `el` directly. Adding more discrete props here forces every
 * registered renderer to accept them whether it cares or not.
 */
export interface FieldRendererProps {
  el:            ElementMeta
  name:          string
  defaultValue:  unknown
  required:      boolean
  disabled:      boolean
  placeholder:   string | undefined
}

const renderers = new Map<string, ComponentType<FieldRendererProps>>()

/**
 * Register a custom React component to render a `fieldType`. Used by external
 * packages (e.g. `@pilotiq/tiptap`) to plug in input UIs without forcing
 * pilotiq core to import their dependencies.
 *
 * Built-in field types (`text`, `textarea`, `select`, `toggle`, `date`, …)
 * are handled by SchemaRenderer's internal switch and don't need to register.
 * Calling `registerFieldRenderer` for a built-in fieldType wins — the registry
 * is checked first.
 *
 * Call once at app boot (client-side). Re-calling with the same fieldType
 * overwrites the previous registration, which is convenient for HMR.
 */
export function registerFieldRenderer(
  fieldType: string,
  Component: ComponentType<FieldRendererProps>,
): void {
  renderers.set(fieldType, Component)
}

/** Look up a registered renderer. Returns undefined for unregistered types. */
export function getFieldRenderer(
  fieldType: string,
): ComponentType<FieldRendererProps> | undefined {
  return renderers.get(fieldType)
}
