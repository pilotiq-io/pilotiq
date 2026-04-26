/**
 * Base class for everything that can appear in a schema tree.
 *
 * `Field` (form input), `Action` (handler), and the display elements
 * (Text, Heading, Card, Section, Stat, ...) all extend this class. Container
 * elements populate `_children` to nest other Elements; leaves leave it
 * undefined.
 *
 * The contract is intentionally tiny — `getType()` to identify, `toMeta()`
 * to serialize. Everything else (visibility flags, validation, persistence)
 * is layered on by specialized subclasses (Phase 1.2+).
 */
export abstract class Element {
  protected _children?: Element[]

  /** Discriminator string. Used by the resolver and the client renderer. */
  abstract getType(): string

  /**
   * Serialize this element's own state (excluding children) to a JSON-safe
   * object. Children are handled by the resolver — do NOT inline them here.
   */
  abstract toMeta(): Record<string, unknown>

  /**
   * Children of a container element, or `undefined` for leaves. The resolver
   * walks this to build the nested meta tree.
   */
  getChildren(): Element[] | undefined {
    return this._children
  }
}

/**
 * Resolved metadata — JSON-serializable, sent to the client via viewProps.
 *
 * `type` is the discriminator from `Element.getType()`. `children` (when
 * present) is the resolved meta tree of the element's children.
 */
export type ElementMeta = Record<string, unknown> & {
  type: string
  children?: ElementMeta[]
}
