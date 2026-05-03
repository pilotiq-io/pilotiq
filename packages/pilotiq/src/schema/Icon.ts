import { Element } from './Element.js'

export type IconColor =
  | 'default'
  | 'muted'
  | 'primary'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'info'

/**
 * Display prime — renders an icon inline in a schema. Resolves through
 * the user-extensible icon registry (`registerIcons({ name: Component })`),
 * so the value is a kebab-case string. For component-typed icons used
 * by Resource/Page/Global statics, see `IconValue` in `@pilotiq/pilotiq/icons`.
 *
 * @example
 * Icon.make('check-circle').size(20).color('success')
 */
export class Icon extends Element {
  private _size:  number    = 16
  private _color: IconColor = 'default'
  private _label?: string

  private constructor(private name: string) {
    super()
  }

  static make(name: string): Icon {
    return new Icon(name)
  }

  /** Pixel size — drives both width and height. Default 16. */
  size(px: number): this { this._size = px; return this }

  color(c: IconColor): this { this._color = c; return this }

  /** Accessible label. When set, the rendered icon gets `aria-label`;
   *  otherwise it's `aria-hidden`. */
  label(text: string): this { this._label = text; return this }

  getType(): string { return 'icon' }

  toMeta() {
    return {
      type:  'icon' as const,
      name:  this.name,
      size:  this._size,
      color: this._color,
      ...(this._label ? { label: this._label } : {}),
    }
  }
}
