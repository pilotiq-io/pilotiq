import { Element } from './Element.js'

/**
 * Single step inside a `Wizard`. Holds a label, optional icon/description,
 * and a list of child Elements. Children resolve unconditionally on every
 * Wizard render so cross-step `$get` (Plan #5) sees values from every step,
 * but the renderer only paints the *active* step's children.
 */
export class Step extends Element {
  private _icon?: string
  private _description?: string

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

  getType(): string { return 'wizard' }

  toMeta(): Record<string, unknown> {
    return {
      type:        'wizard' as const,
      skippable:   this._skippable,
      startOnStep: this._startOnStep,
      persist:     this._persist,
    }
  }
}
