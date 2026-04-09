/** Serialised agent metadata sent to the client via the resource meta endpoint. */
export interface PanelAgentMeta {
  slug:   string
  label:  string
  icon?:  string | undefined
  fields: string[]
}

/**
 * Field types a `PanelAgent` is allowed to operate on. Validated at field
 * registration time when the agent is referenced from `Field.ai([...])`.
 *
 * Use `'*'` to mean "any field type" (default for agents that don't call
 * `.appliesTo([...])` explicitly).
 */
export type PanelAgentFieldType = '*' | string

/**
 * The public-facing surface of a `PanelAgent` — the methods used by
 * `Field.ai()`, `Resource.agents()`, `BuiltInAiActionRegistry`, and the
 * resource meta serialiser. The concrete `PanelAgent` class lives in
 * `./PanelAgent.ts` and `implements` this interface; pulling the surface
 * out as a type lets the schema layer (Field, Resource, registries) stay
 * decoupled from the AI runtime, which depends on `@rudderjs/ai` and
 * `@rudderjs/live`. The heavy class will move to `@pilotiq-pro/ai` in a
 * future phase; this seam means none of the schema-layer call sites will
 * need to change when it does.
 */
export interface PanelAgentInterface {
  getSlug():       string
  getLabel():      string
  getIcon():       string | undefined
  getAppliesTo():  PanelAgentFieldType[]
  toMeta():        PanelAgentMeta
}
