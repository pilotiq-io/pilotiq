export type FieldType = 'text' | 'textarea' | 'email' | 'number' | 'select' | 'toggle' | 'date' | 'slug'

export abstract class Field {
  readonly name: string
  readonly fieldType: FieldType

  protected _label: string
  protected _required = false
  protected _readonly = false
  protected _placeholder?: string

  constructor(name: string, type: FieldType) {
    this.name = name
    this.fieldType = type
    this._label = name.charAt(0).toUpperCase() + name.slice(1)
  }

  label(l: string): this { this._label = l; return this }
  required(v = true): this { this._required = v; return this }
  readonly(v = true): this { this._readonly = v; return this }
  placeholder(p: string): this { this._placeholder = p; return this }

  getLabel(): string { return this._label }
  isRequired(): boolean { return this._required }
  isReadonly(): boolean { return this._readonly }
  getPlaceholder(): string | undefined { return this._placeholder }
}
