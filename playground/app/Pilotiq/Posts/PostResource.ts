import {
  Resource, Column, Action,
  TextInputColumn, SelectColumn,
  TextField, MarkdownField, SelectField, EmailField,
  TernaryFilter, DateRangeFilter,
  TableGroup, orderByKeys,
  TextEntry, BadgeEntry, IconEntry, ComponentEntry,
  Section, Grid,
  email, minLength,
  type Form, type Table, type Element,
} from '@pilotiq/pilotiq'
import { Post } from '../../Models/Post.js'
import { User } from '../../Models/User.js'
import { PostsCommentsManager } from './relations/CommentsManager.js'
import { PostsTagsManager }     from './relations/TagsManager.js'
import { ContentCluster }       from '../Content/ContentCluster.js'
import { PostAnalyticsPage }    from './AnalyticsPage.js'

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
  // Cluster demo — Posts lives under `/new-admin/content/posts`.
  static override cluster              = ContentCluster

  static override navigationSort  = 20

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').required(),
      // Inline-create-from-select demo: pick an author, or click "+" to
      // spawn a new User on the fly without leaving the post form. The
      // sub-form runs the same validators (`required`, `email`, `unique`)
      // as a regular User.create() route.
      SelectField.make('authorId')
        .label('Author')
        .required()
        .options(async () => {
          const users = await User.query().paginate(1, 100)
          return users.data.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))
        })
        .createOptionForm([
          TextField.make('name').required().validate(minLength(2)),
          EmailField.make('email').required().validate(email()),
        ])
        .createOptionUsing(async ({ name, email: emailVal }) => {
          const user = await User.create({
            name:  String(name),
            email: String(emailVal),
          })
          return { value: user.id, label: `${user.name} (${user.email})` }
        }),
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
      // scopeQueryByKey demo — pick "Group by: Status" from the toolbar
      // and rows band by status (draft/published). Click a heading
      // ("Status: Draft") to drill into that bucket; banded layout
      // collapses, a "Drilled into Status: Draft" chip mounts above
      // the table, × to clear. The default scoper is exact-match
      // `where('status', '=', key)` since we didn't override
      // `.scopeQueryByKey(fn)`. `orderByKeys` pins Draft first.
      .groups([
        TableGroup.make('status')
          .label('Status')
          .collapsible()
          .scopable()
          .orderUsing(orderByKeys(['draft', 'published'])),
      ])
      .headerActions([
        Action.create(PostResource, ADMIN),
        // Import / Export demo. Export streams the table query (with
        // current filters / search / sort applied) as CSV. Import opens
        // a modal with a FileUpload; rows are upserted by `slug` so the
        // same CSV can be re-uploaded without duplicates.
        Action.export(PostResource, ADMIN, {
          columns:  ['id', 'title', 'status', 'authorId', 'createdAt'],
          filename: () => `posts-${new Date().toISOString().slice(0, 10)}.csv`,
        }),
        Action.import(PostResource, ADMIN, {
          columns:  { Title: 'title', Status: 'status', Author: 'authorId' },
          // No `upsertBy` — Post has no naturally-unique business key
          // beyond `id` (which the user wouldn't typically supply on a
          // CSV import). Toggling to create-only matches the demo's intent
          // (drag a CSV in → new posts appear).
        }),
      ])
      .recordActions([
        Action.edit       (PostResource, ADMIN),
        Action.delete     (PostResource, ADMIN),
        Action.restore    (PostResource, ADMIN),
        Action.forceDelete(PostResource, ADMIN),
      ])
      .bulkActions([
        Action.bulkExport     (PostResource, ADMIN, {
          columns: ['id', 'title', 'status'],
        }),
        Action.bulkDelete     (PostResource, ADMIN),
        Action.bulkRestore    (PostResource, ADMIN),
        Action.bulkForceDelete(PostResource, ADMIN),
      ])
      // No `defaultSort()` — `reorderable('sort')` falls back to
      // `(sort, asc)` so the visible order matches the persisted column
      // and drag is enabled out of the box.
      .paginate(10)
  }

  /** Plan #16 demo — read-only infolist entries on the ViewPage. Sibling
   *  hierarchy to fields: each entry resolves its value from the loaded
   *  record at meta-build time, runs through built-in formatters
   *  (`since / dateTime / money / numeric / limit`) or a custom
   *  `formatStateUsing`, and renders inside the same layout primitives
   *  forms use (`Section`, `Grid`). Distinct from a "disabled form" — no
   *  inputs, no submit, no validators. */
  static override detail(_record: unknown): Element[] {
    return [
      Section.make('Overview').schema([
        Grid.make().columns(2).schema([
          TextEntry.make('title').size('lg').weight('semibold'),
          BadgeEntry.make('status').colors({ draft: 'gray', published: 'success' }),
        ]),
      ]),
      Section.make('Details').schema([
        Grid.make().columns(2).schema([
          TextEntry.make('authorId').label('Author').inlineLabel().copyable('Copy author id'),
          // Function accessor — derives a value from the record without
          // touching `record.authorIdShort`. String dotted-path also
          // supported for joined fields (e.g. `.state('author.name')`).
          TextEntry.make('authorIdShort')
            .label('Author (short)')
            .inlineLabel()
            .state((r) => {
              const id = (r as { authorId?: string }).authorId
              return id ? `${id.slice(0, 6)}…` : '—'
            }),
          TextEntry.make('createdAt').label('Created').since().tooltip('Server timestamp'),
          TextEntry.make('updatedAt').label('Updated').dateTime(),
          IconEntry.make('status').label('Live?').options({
            published: { icon: 'check-circle', color: 'success', label: 'Live'  },
            draft:     { icon: 'x-circle',     color: 'warning', label: 'Draft' },
          }),
        ]),
      ]),
      Section.make('Body').schema([
        TextEntry.make('body').wrap().lineClamp(8).default('No body yet.'),
        // Escape-hatch entry — hands rendering off to the registered
        // `ReadingStats` React component. The `state(r => r.body ?? '')`
        // accessor pre-resolves the body text so the component receives
        // a plain string in `value`.
        ComponentEntry.make('readingStats')
          .label('Reading stats')
          .component('ReadingStats')
          .state((r) => (r as { body?: string }).body ?? ''),
      ]),
    ]
  }

  /** Polymorphic follow-up — Comments tab on the post's edit/view page,
   *  scoped via the `commentable` morph. Mode auto-detects as
   *  `'morphMany'`; create POST auto-fills the morph columns.
   *
   *  Polymorphic M2M follow-up — Tags tab via the shared `taggable`
   *  pivot. Mode auto-detects as `'morphToMany'`; the M2M factories
   *  (`relationAttach / Detach / BulkDetach`) work identically to the
   *  `belongsToMany` Article ↔ Tag manager — the only difference is the
   *  ORM stamps + filters `taggableType = 'Post'` on the shared pivot
   *  so the same Tag rows can attach to either a Post or a Video. */
  static override relations() { return [PostsCommentsManager, PostsTagsManager] }

  /** Record sub-pages demo — `Analytics` mounts at
   *  `/new-admin/content/posts/:id/analytics` and surfaces as a tab
   *  on the post's sub-nav strip (between Edit and the Comments /
   *  Tags managers). Receives the loaded post on `ctx.record`. */
  static override pages() {
    return {
      record: {
        analytics: PostAnalyticsPage,
      },
    }
  }
}
