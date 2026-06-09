import { Element } from './Element.js'
import type { BadgeColor } from '../columns/BadgeColumn.js'

export type TextColor =
  | 'default'
  | 'muted'
  | 'primary'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'info'

export type TextSize   = 'xs' | 'sm' | 'base' | 'lg' | 'xl'
export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold'

export class Text extends Element {
  private _color?:  TextColor
  private _size?:   TextSize
  private _weight?: TextWeight
  private _badge        = false
  private _badgeColor?: BadgeColor

  private constructor(private content: string) {
    super()
  }

  static make(content: string): Text {
    return this.configured(new Text(content))
  }

  color(c: TextColor): this   { this._color = c; return this }
  size(s: TextSize): this     { this._size = s; return this }
  weight(w: TextWeight): this { this._weight = w; return this }

  /** Render the content as a pill/badge instead of plain text.
   *  Pair with `.badgeColor()` for tinted variants. */
  badge(v = true): this { this._badge = v; return this }

  badgeColor(c: BadgeColor): this {
    this._badgeColor = c
    this._badge = true
    return this
  }

  getType(): string { return 'text' }

  toMeta() {
    return {
      type:    'text' as const,
      content: this.content,
      ...(this._color       ? { color:      this._color }       : {}),
      ...(this._size        ? { size:       this._size }        : {}),
      ...(this._weight      ? { weight:     this._weight }      : {}),
      ...(this._badge       ? { badge:      true }              : {}),
      ...(this._badgeColor  ? { badgeColor: this._badgeColor }  : {}),
    }
  }
}
