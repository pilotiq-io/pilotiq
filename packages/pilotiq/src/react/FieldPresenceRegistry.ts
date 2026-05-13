import type { ComponentType } from 'react'

/**
 * Props the per-field presence chip receives from `FieldShell` when a
 * `@pilotiq-pro/collab`-style plugin has registered a component.
 *
 * The chip subscribes to the active collab room's awareness state and
 * renders colored avatars / dots for every remote user currently
 * focused on this field. Pilotiq core renders it alongside the field's
 * label; the component owns the awareness lookup so pilotiq stays
 * Yjs-free.
 *
 * Mounted only when:
 *
 *   - A collab plugin has registered a component via
 *     `registerFieldPresenceComponent(...)`,
 *   - The field hasn't opted out via `Field.collab(false)`, and
 *   - The field has a stable `name` (dotted-path Repeater rows skip
 *     presence in v1 — Phase F.5 work).
 */
export interface FieldPresenceProps {
  /** Top-level field name. Dotted-path names are skipped by `FieldShell`. */
  fieldName: string
  /**
   * Stable form identifier — same value the form's `FormStateProvider`
   * uses. Lets the chip scope presence by form when multiple forms
   * render on the same record (action modals, etc.).
   */
  formId:    string
}

let _component: ComponentType<FieldPresenceProps> | null = null

/**
 * Register a component that renders inside `FieldShell`'s label area
 * for every controlled field. Called once at boot by a collab plugin.
 * No-op when no plugin registers — `FieldShell` skips the slot.
 */
export function registerFieldPresenceComponent(C: ComponentType<FieldPresenceProps>): void {
  _component = C
}

/** Returns the registered presence component, or `null`. */
export function getFieldPresenceComponent(): ComponentType<FieldPresenceProps> | null {
  return _component
}
