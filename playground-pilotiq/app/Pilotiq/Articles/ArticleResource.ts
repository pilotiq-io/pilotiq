import {
  Resource, Section, Grid, Text,
  TextEntry, BadgeEntry, KeyValueEntry, ColorEntry,
  type Form, type Table, type Element,
} from '@pilotiq/pilotiq'
import { Newspaper } from 'lucide-react'
import { Article } from '../../Models/Article.js'
import { ArticleForm }   from './Schemas/ArticleForm.js'
import { ArticlesTable } from './Tables/ArticlesTable.js'
import { ListArticles }  from './Pages/ListArticles.js'
import { CreateArticle } from './Pages/CreateArticle.js'
import { EditArticle }   from './Pages/EditArticle.js'
import { ViewArticle }   from './Pages/ViewArticle.js'
import { TagsManager }   from './relations/TagsManager.js'

export class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override icon          = Newspaper
  static override model         = Article

  // ── Navigation metadata (Plan #9) ─────────────────────────
  static override navigationGroup       = 'Content'
  static override navigationSort        = 10
  static override navigationBadge       = async () => {
    const n = await Article.where('status', 'draft').count()
    return n > 0 ? n : undefined
  }
  static override navigationBadgeColor  = 'warning' as const
  static override recordTitleAttribute  = 'title'

  // ── Global search (Plan #12) ──────────────────────────────
  static override globalSearch = true
  static override getGlobalSearchResultSubtitle(record: unknown): string | undefined {
    const r = record as { status?: string; slug?: string }
    if (r?.status === 'published') return 'Published'
    if (r?.status === 'draft')     return 'Draft'
    return undefined
  }

  // ── Authorization (Plan #10) ──────────────────────────────
  // Demo only — real apps would derive the role from the resolved user
  // (see `AdminPanel.ts`, `Pilotiq.user(...)`). Here we hard-gate
  // delete on a `role === 'admin'` shape.
  static override async canDelete(user: unknown, _record: unknown): Promise<boolean> {
    return (user as { role?: string })?.role === 'admin'
  }

  static override form(form: Form): Form {
    return ArticleForm.configure(form)
  }

  static override table(table: Table): Table {
    return ArticlesTable.configure(table)
  }

  static override detail(record: unknown): Element[] {
    if (!record) return [Text.make('Article not found.')]
    return [
      Section.make('Overview').schema([
        Grid.make().columns(2).schema([
          TextEntry.make('title').size('lg').weight('semibold'),
          BadgeEntry.make('status').colors({ draft: 'gray', published: 'success' }),
          TextEntry.make('slug').default('(none)').inlineLabel().copyable('Copy slug'),
          TextEntry.make('createdAt').label('Created').since(),
        ]),
      ]),
      // Plan #16 follow-up — KeyValueEntry / ColorEntry demos.
      // `accentColor` is a hex string column; `metadata` is a JSON-blob
      // string column. KeyValueEntry's renderer parses JSON strings,
      // and ColorEntry renders the hex as a swatch with the value beside.
      Section.make('Branding').schema([
        Grid.make().columns(2).schema([
          ColorEntry.make('accentColor').dimensions(28).circle()
            .tooltip('Hero accent on the public site').default('No accent set'),
          TextEntry.make('publishedAt').label('Published').since().default('Unpublished'),
        ]),
      ]),
      Section.make('Metadata').schema([
        KeyValueEntry.make('metadata')
          .keyLabel('Property')
          .valueLabel('Value')
          .helperText('Stored as a JSON blob; admins edit raw.')
          .default('No metadata set.'),
      ]),
    ]
  }

  static override pages() {
    return {
      index:  ListArticles,
      create: CreateArticle,
      edit:   EditArticle,
      view:   ViewArticle,
    }
  }

  static override relations() {
    return [TagsManager]
  }
}
