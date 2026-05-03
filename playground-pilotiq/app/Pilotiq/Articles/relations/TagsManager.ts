import {
  RelationManager,
  Action,
  Column,
  type RelationManagerContext,
  type Table,
} from '@pilotiq/pilotiq'

/**
 * M2M demo — Article ↔ Tag.
 *
 * The minimal manager: register the relationship key, lay out the
 * embedded Table, and opt in to the three M2M action factories. The
 * `mode === 'belongsToMany'` derived in `RelationManagerContext` is
 * what flips the factories into "attach / detach / bulk-detach"
 * behavior; the existing `relationCreate / Edit / Delete` factories
 * would auto-hide here, so we just don't wire them.
 *
 * `static label / labelSingular` aren't strictly required (they fall
 * through to the related Resource's labels and ultimately a sentence-
 * cased `relationship`), but pin them so the tab + button copy is
 * deterministic.
 */
export class TagsManager extends RelationManager {
  static override relationship  = 'tags'
  static override label         = 'Tags'
  static override labelSingular = 'Tag'

  static override table(table: Table, ctx: RelationManagerContext): Table {
    return table
      .columns([
        Column.make('name').sortable().searchable(),
        Column.make('color'),
      ])
      .headerActions([
        Action.relationAttach(TagsManager, ctx),
      ])
      .recordActions([
        Action.relationDetach(TagsManager, ctx),
      ])
      .bulkActions([
        Action.relationBulkDetach(TagsManager, ctx),
      ])
  }
}
