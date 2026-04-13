import type { Field } from './fields/Field.js'
import type { Column } from './Column.js'

export interface TableConfig {
  columns: Column[]
}

export interface FormConfig {
  fields: Field[]
}

export abstract class Resource {
  /** The display label (plural) */
  static label: string = 'Resources'
  /** Singular label */
  static labelSingular: string = 'Resource'
  /** URL slug — derived from label if not set */
  static slug: string = ''
  /** Navigation icon name */
  static icon: string = 'file'

  /** Define table columns */
  abstract table(): TableConfig

  /** Define form fields */
  abstract form(): FormConfig

  /** Get the URL slug */
  static getSlug(): string {
    return this.slug || this.label.toLowerCase().replace(/\s+/g, '-')
  }
}
