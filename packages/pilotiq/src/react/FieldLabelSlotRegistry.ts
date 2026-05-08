import type { ComponentType } from 'react'

/**
 * Props the field label slot component receives from `SchemaRenderer`.
 * For AI actions this carries the field name, action list, and the
 * pre-composed agent-run base URL stamped by `tagFieldAiUrls`.
 */
export interface FieldLabelSlotProps {
  fieldName:    string
  actions:      Array<{ slug: string; label: string; icon?: string }>
  agentRunBase: string
}

let _component: ComponentType<FieldLabelSlotProps> | null = null

/**
 * Register a component to render inline next to every field label that
 * has `aiActions` stamped on its meta. Called once at boot by a plugin's
 * `register(panel)` step (e.g. `@pilotiq-pro/ai`). No-op when no plugin
 * registers — `getFieldLabelSlot()` returns `null` and `SchemaRenderer`
 * skips the slot.
 */
export function registerFieldLabelSlot(C: ComponentType<FieldLabelSlotProps>): void {
  _component = C
}

/** Returns the registered field label slot component, or `null`. */
export function getFieldLabelSlot(): ComponentType<FieldLabelSlotProps> | null {
  return _component
}
