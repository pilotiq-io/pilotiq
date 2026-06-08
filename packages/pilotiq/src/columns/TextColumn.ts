import { Column } from '../Column.js'

/**
 * The standard text column. Renders cell values as plain text and exposes
 * the full chain of built-in formatters (`dateTime / since / money /
 * numeric / limit`) plus typography setters (`weight / color`) inherited
 * from `Column`.
 *
 * `TextColumn.make('name')` and `Column.make('name')` are equivalent —
 * the base `Column` defaults `columnType = 'text'`, so the bare factory
 * keeps working unchanged. `TextColumn.make` exists for symmetry with
 * the other column subclasses (`BadgeColumn / IconColumn / BooleanColumn /
 * ImageColumn`) so callers reading a list page can spot the column kind
 * at a glance.
 */
export class TextColumn extends Column {
  static override make(name: string): TextColumn {
    return this.configured(new TextColumn(name))
  }
}
