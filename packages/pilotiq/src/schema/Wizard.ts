import { Element } from './Element.js'
import type { Action } from '../actions/Action.js'

/**
 * Customizer for the wizard's built-in nav buttons (`submitAction`,
 * `nextAction`, `previousAction`). Pass an `Action` to replace the
 * default outright, or a function that receives the framework-built
 * default and returns a customized clone.
 *
 * Only chrome carries through to the renderer (label / icon / color /
 * size / outlined / iconOnly / tooltip / disabled rules). The button's
 * click behavior stays hardwired to advance / recede / submit-form —
 * dispatch overrides (`.handler()`, `.action()`, `.href()`) are
 * intentionally ignored so the wizard chrome never breaks navigation.
 */
export type WizardActionCustomizer = Action | ((defaultAction: Action) => Action)

/**
 * Context handed to `Step.beforeValidation` / `afterValidation` hooks.
 * Mirrors the shape used by Form lifecycle hooks (record + user; values
 * are passed positionally so handlers can mutate them in place).
 */
export interface StepValidationContext {
  record?: unknown
  user?:   unknown
}

/**
 * Hook signature for `Step.beforeValidation` / `afterValidation`.
 * Throwing aborts the wizard advance with a 422 stamped under the
 * reserved `_step` error key — surface a user-facing message via the
 * thrown Error's `.message`.
 */
export type StepValidationHook = (
  values: Record<string, unknown>,
  ctx:    StepValidationContext,
) => void | Promise<void>

/**
 * Single step inside a `Wizard`. Holds a label, optional icon/description,
 * and a list of child Elements. Children resolve unconditionally on every
 * Wizard render so cross-step `$get` (Plan #5) sees values from every step,
 * but the renderer only paints the *active* step's children.
 */
export class Step extends Element {
  private _icon?: string
  private _description?: string
  private _beforeValidation?: StepValidationHook
  private _afterValidation?:  StepValidationHook

  private constructor(private _label: string) {
    super()
  }

  static make(label: string): Step {
    return new Step(label)
  }

  /** Icon shown next to the step label (registry key). */
  icon(name: string): this { this._icon = name; return this }

  /** Optional helper text rendered under the step label inside the indicator. */
  description(d: string): this { this._description = d; return this }

  /** Set the step's children. Any Element type is accepted. */
  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  /**
   * Runs on the server BEFORE the step's fields are validated when the
   * user clicks Next. Use to mutate `values` in place (e.g. stamp a
   * computed field needed by validators) or run an async availability
   * check that should block advance. Throw an Error to halt — the
   * thrown message lands under the reserved `_step` key in the 422
   * response so the renderer can show it next to the Next button.
   */
  beforeValidation(fn: StepValidationHook): this { this._beforeValidation = fn; return this }

  /**
   * Runs on the server AFTER the step's validators pass and before the
   * 200 advance response. Use for cross-field invariants, side-effects
   * that should fire only on confirmed advance, or computed-field stamps
   * that downstream steps will read. Throw to halt — same `_step` key
   * convention as `beforeValidation`.
   */
  afterValidation(fn: StepValidationHook): this { this._afterValidation = fn; return this }

  getBeforeValidation(): StepValidationHook | undefined { return this._beforeValidation }
  getAfterValidation():  StepValidationHook | undefined { return this._afterValidation }

  getType(): string { return 'step' }

  toMeta(): Record<string, unknown> {
    return {
      type:  'step' as const,
      label: this._label,
      ...(this._icon        ? { icon:        this._icon        } : {}),
      ...(this._description ? { description: this._description } : {}),
    }
  }
}

/**
 * Multi-step form layout. Wraps a list of `Step` containers with an
 * indicator strip + Back / Next chrome. Submit semantics are unchanged
 * — the surrounding `Form`'s Save fires only when the user is on the
 * final step (the Next button mutates to "Save" or the page-level
 * action becomes visible — see SchemaRenderer's WizardRenderer).
 *
 * Validation: on Next click, the client POSTs `{ step, values }` to the
 * Form's `wizardUrl` (when set — Plan #8 step 7 wires the endpoint).
 * 200 → advance; 422 → stamp inline errors. When `wizardUrl` is absent
 * (e.g. forms without per-step validation), Next advances immediately.
 *
 * Cross-step `$get`: every Step's children are resolved on each
 * RenderContext, so a step-2 `Section.visible(({ $get }) => $get('emailFromStep0'))`
 * works. Inactive steps are hidden client-side via `display: none`,
 * which keeps controlled inputs in the DOM and preserves their values.
 */
export class Wizard extends Element {
  private _skippable = false
  private _startOnStep = 0
  private _persist = true
  private _persistStepInQueryString: string | undefined = undefined
  private _submitAction?:   WizardActionCustomizer
  private _nextAction?:     WizardActionCustomizer
  private _previousAction?: WizardActionCustomizer

  private constructor() { super() }

  static make(): Wizard {
    return new Wizard()
  }

  /** Set the step list. Each entry is a `Step` instance with its own schema. */
  steps(steps: Step[]): this {
    this._children = steps
    return this
  }

  /**
   * Allow the user to click any step indicator to jump there. When `true`,
   * jumping forward still validates intermediate steps in order. When
   * `false` (default), step indicators ahead of the current step are
   * disabled.
   */
  skippable(v = true): this { this._skippable = v; return this }

  /** Initial step index. Default 0. */
  startOnStep(n: number): this { this._startOnStep = n; return this }

  /**
   * Persist the active step to localStorage so refresh / SPA-nav keeps
   * the user on the same step. Default `true`. Disable for ephemeral
   * Wizards (e.g. inline modal flows) where you'd rather always start
   * fresh.
   */
  persist(v: boolean): this { this._persist = v; return this }

  /**
   * Sync the active step index to the URL as `?<key>=N` (1-based for
   * human-friendly URLs). When set, the URL value wins over localStorage
   * on initial mount, so deep-linking to a specific step works. Bare
   * `persistStepInQueryString()` uses the default key `'step'`; pass a
   * string to override (multi-wizard pages should use distinct keys to
   * avoid collisions). Pass `false` to disable.
   */
  persistStepInQueryString(key: string | boolean = true): this {
    if (key === false) { this._persistStepInQueryString = undefined; return this }
    this._persistStepInQueryString = key === true ? 'step' : key
    return this
  }

  /**
   * Customize the chrome of the built-in Submit button shown on the
   * wizard's final step. By default the wizard renders a hint pointing
   * at the surrounding form's Save button — calling this method instead
   * mounts a real `<button type="submit">` inside the wizard chrome so
   * the wizard becomes self-contained. Pair with `CreatePage.getFormActions(R)`
   * returning `[]` to suppress the page-level Save when you don't want
   * two submits on the same page.
   */
  submitAction(action: WizardActionCustomizer): this {
    this._submitAction = action
    return this
  }

  /** Customize the chrome of the built-in Next button. */
  nextAction(action: WizardActionCustomizer): this {
    this._nextAction = action
    return this
  }

  /** Customize the chrome of the built-in Back / Previous button. */
  previousAction(action: WizardActionCustomizer): this {
    this._previousAction = action
    return this
  }

  getPersistStepInQueryString(): string | undefined { return this._persistStepInQueryString }
  getSubmitAction():             WizardActionCustomizer | undefined { return this._submitAction }
  getNextAction():               WizardActionCustomizer | undefined { return this._nextAction }
  getPreviousAction():           WizardActionCustomizer | undefined { return this._previousAction }

  getType(): string { return 'wizard' }

  toMeta(): Record<string, unknown> {
    return {
      type:        'wizard' as const,
      skippable:   this._skippable,
      startOnStep: this._startOnStep,
      persist:     this._persist,
      ...(this._persistStepInQueryString
        ? { persistStepInQueryString: this._persistStepInQueryString }
        : {}),
    }
  }
}
