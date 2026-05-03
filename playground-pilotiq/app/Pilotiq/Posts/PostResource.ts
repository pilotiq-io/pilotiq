import {
  Resource, Column, Action,
  TextInputColumn, SelectColumn,
  TextField, MarkdownField, SelectField,
  TernaryFilter, DateRangeFilter,
  minLength,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { Post } from '../../Models/Post.js'

const ADMIN = '/new-admin'

/**
 * Plan #11 demo — top-level Posts resource. The `User → Posts` manager
 * defaults its row links to this resource's view URL
 * (`/new-admin/posts/:id`), so registering it lets the click-through
 * "drill into the full record context" pattern work end-to-end.
 *
 * Plan #13 demo — `softDeletes = true` opts in the TrashedFilter,
 * Restore + ForceDelete actions, and "moved to trash" delete framing.
 * Row actions wire all four explicitly (Filament-style); per-row
 * visibility shows Edit + Delete on live rows and Restore +
 * ForceDelete on trashed rows.
 */
export class PostResource extends Resource {
  static override label                = 'Posts'
  static override labelSingular        = 'Post'
  static override icon                 = 'newspaper'
  static override model                = Post
  static override recordTitleAttribute = 'title'
  static override softDeletes          = true

  static override navigationGroup = 'Content'
  static override navigationSort  = 20

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').required(),
      TextField.make('authorId').required().helperText('User id'),
      MarkdownField.make('body')
        .placeholder('Write the post body in markdown…')
        .minHeight('240px')
        .helperText('Markdown formatting supported. Use the toolbar or ⌘B / ⌘I / ⌘K.'),
      SelectField.make('status').default('draft').options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ]),
    ])
  }

  static override table(table: Table): Table {
    return table
      .reorderable('sort')
      .columns([
        // Inline-edit demo: typing in the title saves on blur (or after the
        // 500 ms debounce). Validator runs server-side; failure shows a toast
        // and rolls the input back to the persisted value.
        TextInputColumn.make('title')
          .sortable().searchable()
          .validate(minLength(3))
          .placeholder('Untitled')
          .width('30%'),
        // Inline-edit demo: pick a status from the dropdown — saves on each
        // change with no debounce. Replaces the previous BadgeColumn since
        // the cell IS the affordance.
        SelectColumn.make('status')
          .options({ draft: 'Draft', published: 'Published' })
          .width('140px'),
        Column.make('authorId').label('Author').color('muted'),
        Column.make('createdAt').sortable().since(),
      ])
      .filters([
        TernaryFilter.make('publishState')
          .label('Publish state')
          .trueLabel('Published')
          .falseLabel('Unpublished')
          .nullable(false)
          .query((q, value) => {
            if (value === 'yes') return q.where('publishedAt', '!=', null)
            if (value === 'no')  return q.where('publishedAt', '=',  null)
            return q
          }),
        DateRangeFilter.make('createdAt').label('Created'),
      ])
      .headerActions([
        Action.create(PostResource, ADMIN),
      ])
      .recordActions([
        Action.edit       (PostResource, ADMIN),
        Action.delete     (PostResource, ADMIN),
        Action.restore    (PostResource, ADMIN),
        Action.forceDelete(PostResource, ADMIN),
      ])
      .bulkActions([
        Action.bulkDelete     (PostResource, ADMIN),
        Action.bulkRestore    (PostResource, ADMIN),
        Action.bulkForceDelete(PostResource, ADMIN),
      ])
      // No `defaultSort()` — `reorderable('sort')` falls back to
      // `(sort, asc)` so the visible order matches the persisted column
      // and drag is enabled out of the box.
      .paginate(10)
  }
}
