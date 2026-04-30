import { Resource, Section, Text, type Form, type Table, type Element } from '@pilotiq/pilotiq'
import { Newspaper } from 'lucide-react'
import { Article } from '../../Models/Article.js'
import { ArticleForm }   from './Schemas/ArticleForm.js'
import { ArticlesTable } from './Tables/ArticlesTable.js'
import { ListArticles }  from './Pages/ListArticles.js'
import { CreateArticle } from './Pages/CreateArticle.js'
import { EditArticle }   from './Pages/EditArticle.js'
import { ViewArticle }   from './Pages/ViewArticle.js'

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
    const r = record as { id?: string; title?: string; slug?: string | null; status?: string } | null
    if (!r) return [Text.make('Article not found.')]
    return [
      Section.make('Overview').schema([
        Text.make(`Title: ${r.title ?? '(untitled)'}`),
        Text.make(`Slug: ${r.slug ?? '(none)'}`),
        Text.make(`Status: ${r.status ?? 'draft'}`),
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
}
