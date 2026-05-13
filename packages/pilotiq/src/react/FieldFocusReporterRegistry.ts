/**
 * Module-level slot for focus / blur callbacks dispatched by pilotiq's
 * `FieldShell`. A collab plugin (e.g. `@pilotiq-pro/collab`) registers
 * a reporter at boot; on every controlled-field focus / blur event,
 * `FieldShell` calls the matching method with `{ fieldName, formId }`
 * so the plugin can mirror the local user's focus state into Yjs
 * awareness.
 *
 * `FieldShell` skips dispatching for fields opted out via
 * `Field.collab(false)` AND for dotted-path names (Repeater rows stay
 * out of F4 presence in v1) — so the reporter never sees those events.
 */
export interface FieldFocusEvent {
  fieldName: string
  formId:    string
}

export interface FieldFocusReporter {
  onFocus(event: FieldFocusEvent): void
  onBlur(event: FieldFocusEvent):  void
}

let _reporter: FieldFocusReporter | null = null

/**
 * Register the reporter. Called once at boot by the collab plugin.
 * No-op when no plugin registers — `FieldShell` doesn't wire focus
 * listeners.
 */
export function registerFieldFocusReporter(reporter: FieldFocusReporter): void {
  _reporter = reporter
}

/** Returns the registered reporter, or `null`. */
export function getFieldFocusReporter(): FieldFocusReporter | null {
  return _reporter
}
