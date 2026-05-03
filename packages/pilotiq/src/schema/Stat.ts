/**
 * Plan #15 Phase B — `Stat` is the fluent value object emitted by
 * `StatsOverview.getStats(ctx)`. It does NOT extend Element — it has no
 * place in the schema tree on its own. `StatsOverview.resolveServerData`
 * collects the array of Stats and ships them as JSON-clean
 * `StatMeta[]` payloads under `_widgetData[id]`.
 *
 *   Stat.make('Users')
 *     .value(await User.query().count())
 *     .description('+12% this month')
 *     .descriptionIcon('trending-up', 'before')
 *     .icon('users')
 *     .color('success')
 *     .chart([12, 4, 8, 15, 22, 18, 30])      // sparkline
 *     .url('/admin/users').openUrlInNewTab()
 *
 * Surface mirrors Filament v5's `Stat` 1:1, modulo TS naming
 * (`openUrlInNewTab(true)` not `->openUrlInNewTab()`).
 */

/** Color preset. Mirrors `TabBadgeColor` so a "Users · 5,234" stat can
 *  be tinted with the same palette as the rest of the panel chrome. */
export type StatColor =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'

/** Position for the optional `descriptionIcon`. Matches Filament's
 *  `IconPosition::Before / After` enum values. */
export type StatDescriptionIconPosition = 'before' | 'after'

export interface StatDescriptionIcon {
  name:     string
  position: StatDescriptionIconPosition
}

/**
 * JSON-clean payload shape — what `StatsOverview.resolveServerData`
 * emits and the renderer consumes. Optional keys are omitted when the
 * fluent setter wasn't called (smaller wire, simpler renderer
 * branching).
 */
export interface StatMeta {
  label: string
  value?: string | number | null
  description?: string
  descriptionIcon?: StatDescriptionIcon
  icon?: string
  color?: StatColor
  chart?: number[]
  url?: string
  openInNewTab?: boolean
  extraAttributes?: Record<string, unknown>
}

export class Stat {
  protected _value?:           string | number | null
  protected _description?:     string
  protected _descriptionIcon?: StatDescriptionIcon
  protected _icon?:            string
  protected _color?:           StatColor
  protected _chart?:           number[]
  protected _url?:             string
  protected _openInNewTab?:    boolean
  protected _extraAttributes?: Record<string, unknown>

  protected constructor(protected _label: string) {}

  /** Factory. The single positional arg is the stat's *label*
   *  (e.g. 'Users') — the value is set fluently via `.value(...)`. */
  static make(label: string): Stat {
    return new Stat(label)
  }

  /** Main number / string. `null` and `undefined` round-trip as `null`
   *  so the renderer can show a placeholder ("—") for "not yet
   *  computed" / "not applicable" without an extra sentinel. */
  value(v: string | number | null | undefined): this {
    this._value = v ?? null
    return this
  }

  /** Supplementary line below the value (e.g. '+12% this month'). */
  description(t: string): this {
    this._description = t
    return this
  }

  /** Tiny icon glued to the description. Position defaults to `'after'`
   *  (matches Filament v5's `IconPosition::After`). */
  descriptionIcon(name: string, position: StatDescriptionIconPosition = 'after'): this {
    this._descriptionIcon = { name, position }
    return this
  }

  /** Main icon shown in the card chrome. String key into the panel's
   *  icon registry — same lookup as `Resource.icon`. */
  icon(name: string): this {
    this._icon = name
    return this
  }

  /** Color tint for the value + icon. */
  color(c: StatColor): this {
    this._color = c
    return this
  }

  /** Inline-SVG sparkline data. Array of raw numbers — the renderer
   *  draws a path scaled to the card. No chart-lib dep. */
  chart(values: number[]): this {
    this._chart = [...values]
    return this
  }

  /** Wrap the card in an `<a href>`. */
  url(href: string): this {
    this._url = href
    return this
  }

  /** When `.url()` is set, open it in a new tab. */
  openUrlInNewTab(value: boolean = true): this {
    this._openInNewTab = value
    return this
  }

  /** Extra HTML attributes spread onto the card root. JSON-clean only —
   *  values must serialize. */
  extraAttributes(attrs: Record<string, unknown>): this {
    this._extraAttributes = { ...attrs }
    return this
  }

  /** Serialize to the wire shape. Stats are ferried through
   *  `_widgetData` so this is a plain JSON object — no children, no
   *  `type` discriminator (the parent `StatsOverview` carries that). */
  toMeta(): StatMeta {
    const out: StatMeta = { label: this._label }
    if (this._value           !== undefined) out.value           = this._value
    if (this._description     !== undefined) out.description     = this._description
    if (this._descriptionIcon !== undefined) out.descriptionIcon = this._descriptionIcon
    if (this._icon            !== undefined) out.icon            = this._icon
    if (this._color           !== undefined) out.color           = this._color
    if (this._chart           !== undefined) out.chart           = this._chart
    if (this._url             !== undefined) out.url             = this._url
    if (this._openInNewTab    !== undefined) out.openInNewTab    = this._openInNewTab
    if (this._extraAttributes !== undefined) out.extraAttributes = this._extraAttributes
    return out
  }
}
