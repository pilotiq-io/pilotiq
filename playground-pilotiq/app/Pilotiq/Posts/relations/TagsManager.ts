import {
  RelationManager,
  Action,
  Column,
  type RelationManagerContext,
  type Table,
} from '@pilotiq/pilotiq'

/**
 * Polymorphic M2M demo — Post ↔ Tag via the shared `taggable` pivot
 * (`morphToMany` on the owning side). Mirrors the Article ↔ Tag manager
 * shape exactly — the only difference is the parent's relations-map type
 * (`morphToMany` vs `belongsToMany`), which `getRelationType` picks up
 * and `normalizeRelationMode` flips into `mode === 'morphToMany'`. From
 * the manager's point of view, the three M2M factories
 * (`relationAttach / Detach / BulkDetach`) work identically — both modes
 * share the `attach / detach / sync` accessor surface; the rudder ORM
 * stamps + filters `taggableType = 'Post'` automatically on every pivot
 * write and read so the same Tag table can be linked to either a Post
 * or a Video.
 *
 * Class is named `PostsTagsManager` to avoid clashing with the
 * `TagsManager` in `app/Pilotiq/Articles/relations/`. Both end up
 * mounted under the same panel; pilotiq distinguishes managers by class
 * identity, not by name, so a same-named symbol would still work — but
 * the explicit name keeps the demo readable.
 */
export class PostsTagsManager extends RelationManager {
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
        Action.relationAttach(PostsTagsManager, ctx),
      ])
      .recordActions([
        Action.relationDetach(PostsTagsManager, ctx),
      ])
      .bulkActions([
        Action.relationBulkDetach(PostsTagsManager, ctx),
      ])
  }
}
