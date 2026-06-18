import {
  Resource, Action, Notification,
  Column, TextColumn, BadgeColumn, ImageColumn,
  TextField, TextareaField, SelectField, SlugField, MarkdownField,
  DateTimePicker, FileUpload,
  MultiSelectFilter,
  Section, Grid, Group, Split, Tabs, Tab,
  TextEntry, BadgeEntry, ImageEntry, ComponentEntry,
  unique,
  type Form, type Table, type Element,
} from '@pilotiq/pilotiq'
import { RichTextField, Block } from '@pilotiq/tiptap'
import { MediaField } from '@pilotiq/media'
import { Post } from '../../Models/Post.js'
import { User } from '../../Models/User.js'
import { Category } from '../../Models/Category.js'
import { ListPosts } from './ListPosts.js'
import { PostAnalyticsPage } from './AnalyticsPage.js'
import { CommentsManager } from './relations/CommentsManager.js'
import { tiptapText } from './tiptapText.js'

/**
 * The CMS flagship — posts with co-authors, categories, related posts
 * (all M2M multi-selects synced through pivots), a Tiptap body with a
 * custom block, SEO meta fields, soft-deletes, and a comments tab.
 */
export class PostResource extends Resource {
  static override label                = 'Posts'
  static override labelSingular        = 'Post'
  static override icon                 = 'newspaper'
  static override model                = Post
  static override recordTitleAttribute = 'title'
  static override softDeletes          = true
  // Drop the View/Edit/Analytics/Comments strip — the tabbed form is
  // the page's own sub-navigation. Routes stay reachable by URL.
  static override recordSubNavigation  = false

  static override navigationGroup = 'Content'
  static override navigationSort  = 10
  static override navigationBadge = async () => {
    const n = await Post.where('status', 'draft').count()
    return n > 0 ? n : undefined
  }
  static override navigationBadgeColor = 'warning' as const

  static override globalSearch = true
  static override getGlobalSearchResultSubtitle(record: unknown): string | undefined {
    const status = (record as { status?: string })?.status
    return status ? status[0]!.toUpperCase() + status.slice(1) : undefined
  }

  // Only admins can delete (and force-delete inherits this).
  static override async canDelete(user: unknown, _record: unknown): Promise<boolean> {
    return (user as { role?: string })?.role === 'admin'
  }

  static override form(form: Form): Form {
    return form.schema([
      Split.make().schema([
        // ── Main column: Title + Content | Meta | Seo ────
        Group.make().schema([
          TextField.make('title').required().placeholder('Post title…'),
          Tabs.make().variant('underline').tabs([
            Tab.make('Content').schema([
              FileUpload.make('image')
                .label('Image (inline meta)')
                .accept(['image/*'])
                .maxSize(2_000_000)
                .directory('covers')
                // Inline storage: the whole { url, alt } object lives in one json column.
                .metaFields([
                  TextField.make('alt').label('Alt text').placeholder('Describe the image…'),
                ]),
              FileUpload.make('thumbnail')
                .label('Thumbnail (split meta column)')
                .accept(['image/*'])
                .maxSize(2_000_000)
                .directory('covers')
                // Split storage: URL lives in `thumbnail` (plain string),
                // meta lives in `thumbnail_meta` (json column).
                // Model: casts = { thumbnail_meta: 'json' }
                .metaFields([
                  TextField.make('alt').label('Alt text').placeholder('Describe the image…'),
                  TextField.make('credit').label('Photo credit'),
                ])
                .metaColumn('thumbnail_meta'),
              FileUpload.make('gallery')
                .label('Gallery')
                .multiple()
                .reorderable()
                .accept(['image/*'])
                .maxSize(5_000_000)
                .directory('gallery')
                // Multi-file + per-file alt + caption.
                .metaFields([
                  TextField.make('alt').label('Alt text'),
                  TextField.make('caption').label('Caption'),
                ]),
              // @pilotiq/media library field — upload new files OR pick
              // existing ones from the library browser. Stores stable
              // MediaRef(s) (id + url + conversions), not raw URLs.
              MediaField.make('coverMedia')
                .label('Cover media (library)')
                .multiple()
                .accept(['image/*']),
              RichTextField.make('content')
                .label('Content')
                .placeholder('Start writing…')
                .enableToolbarButtons(['attachFiles', 'table'])
                .resizableImages()
                .fileAttachmentsAcceptedFileTypes(['image/*'])
                .fileAttachmentsMaxSize(2_000_000)
                .fileAttachmentsDirectory('posts')
                .blocks([
                  Block.make('callout').label('Callout').icon('💡').schema([
                    TextField.make('title').label('Title').placeholder('Callout title'),
                    TextareaField.make('content').label('Content').required(),
                    SelectField.make('tone').label('Tone').options([
                      { value: 'info',    label: 'Info' },
                      { value: 'warning', label: 'Warning' },
                      { value: 'success', label: 'Success' },
                    ]),
                  ]),
                ]),
              // Markdown editor demo — type a `:::alert{type=warning}` block
              // (or any of info/success/tip) and it round-trips through the
              // markdown source via the content-block directive.
              MarkdownField.make('excerpt')
                .label('Excerpt (markdown)')
                .placeholder('Write in markdown… try :::alert{type=warning}'),
            ]),
            Tab.make('Meta').schema([
              SelectField.make('relatedPosts')
                .label('Related posts')
                .multiple()
                .relationship('relatedPosts')
                .options(async (ctx) => {
                  const selfId = (ctx?.record as { id?: string } | undefined)?.id
                  const rows = await Post.query().paginate(1, 200)
                  return rows.data
                    .filter((p) => p.id !== selfId)
                    .map((p) => ({ value: p.id, label: p.title }))
                }),
              SelectField.make('categories')
                .label('Categories')
                .multiple()
                .relationship('categories')
                .options(async () => {
                  const rows = await Category.query().paginate(1, 200)
                  return rows.data.map((c) => ({ value: c.id, label: c.name }))
                }),
            ]),
            Tab.make('Seo').schema([
              TextField.make('metaTitle').label('Title'),
              TextareaField.make('metaDescription').label('Description').rows(2),
              FileUpload.make('metaImage')
                .label('Meta image')
                .accept(['image/*'])
                .maxSize(2_000_000)
                .directory('seo'),
            ]),
          ]),
        ]),

        // ── Aside ────────────────────────────────────────
        Section.make('Publishing').aside().schema([
          SelectField.make('status').required().default('draft').options([
            { value: 'draft',     label: 'Draft' },
            { value: 'published', label: 'Published' },
            { value: 'archived',  label: 'Archived' },
          ]),
          DateTimePicker.make('publishedAt').label('Published at'),
          SelectField.make('authors')
            .label('Authors')
            .multiple()
            .relationship('authors')
            .options(async () => {
              const users = await User.query().paginate(1, 200)
              return users.data.map((u) => ({ value: u.id, label: u.name }))
            }),
          SlugField.make('slug')
            .from('title')
            .required()
            .validate(unique({ model: Post }))
            .helperText('Auto-fills from the title; edit to override.'),
        ]),
      ]),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        ImageColumn.make('image').label('').size(36),
        TextColumn.make('title').sortable().searchable().weight('semibold').width('35%'),
        BadgeColumn.make('status').colors({
          draft:     'gray',
          published: 'success',
          archived:  'warning',
        }),
        Column.make('publishedAt').label('Published').sortable().since(),
        Column.make('createdAt').label('Created').sortable().since().toggleable({ initiallyHidden: true }),
      ])
      .filters([
        MultiSelectFilter.make('status').options([
          { value: 'draft',     label: 'Draft' },
          { value: 'published', label: 'Published' },
          { value: 'archived',  label: 'Archived' },
        ]),
      ])
      // Create / Edit / Delete / restore + bulk variants live in
      // `ListPosts` — the page hooks receive the requesting panel's
      // basePath (this resource serves both /admin and /guest). Publish
      // stays here: handler actions carry no URL, so they're panel-safe.
      .recordActions([
        Action.make('publish')
          .label('Publish')
          .icon('send')
          .color('success')
          .visible(({ record }) => (record as { status?: string })?.status !== 'published')
          .confirm('Publish this post? It becomes visible to readers.')
          .handler(async (ctx) => {
            const r = ctx.record as { id?: string; title?: string } | undefined
            if (!r?.id) return
            // A real Date is fine here — the model's `datetime` cast
            // serializes it to an ISO string at write time.
            await Post.update(r.id, { status: 'published', publishedAt: new Date() })
            const user = ctx.user as { id?: string | number } | undefined
            if (user?.id !== undefined) {
              // Lands in the bell dropdown (database notification).
              await Notification.make('Post published')
                .body(`“${r.title ?? 'Untitled'}” is now live.`)
                .success()
                .sendToDatabase({ id: user.id })
            }
            return { notify: Notification.make('Post published').success() }
          }),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
  }

  static override detail(_record: unknown): Element[] {
    return [
      Section.make('Overview').schema([
        Grid.make().columns(2).schema([
          TextEntry.make('title').size('lg').weight('semibold'),
          BadgeEntry.make('status').colors({ draft: 'gray', published: 'success', archived: 'warning' }),
          TextEntry.make('slug').inlineLabel().copyable('Copy slug'),
          TextEntry.make('publishedAt').label('Published').since().default('Unpublished'),
        ]),
        ImageEntry.make('image').label('Cover').width(320).rounded(),
      ]),
      Section.make('SEO').schema([
        Grid.make().columns(2).schema([
          TextEntry.make('metaTitle').label('Meta title').default('(falls back to title)'),
          TextEntry.make('metaDescription').label('Meta description').default('(none)'),
        ]),
      ]),
      Section.make('Content').schema([
        ComponentEntry.make('readingStats')
          .label('Reading stats')
          .component('ReadingStats')
          .state((rec) => tiptapText((rec as { content?: unknown }).content)),
      ]),
    ]
  }

  static override relations() { return [CommentsManager] }

  static override pages() {
    return {
      index: ListPosts,
      record: {
        analytics: PostAnalyticsPage,
      },
    }
  }
}
