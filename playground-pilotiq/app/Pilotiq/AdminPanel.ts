import {
  Pilotiq, Resource, Global, TextField, Column, Action,
  Form, Table,
  Heading, Text, Alert, Divider, Card, Section,
} from '@pilotiq/pilotiq'
import { themeEditor } from '@pilotiq/pilotiq/plugins'
import { app } from '@rudderjs/core'
import { Article } from '../Models/Article.js'
import { SimplePage } from './pages/SimplePage.js'
import { ElementsShowcase } from './pages/ElementsShowcase.js'

function prisma(): any {
  return app().make('prisma')
}

class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override icon          = 'file-text'
  static override model         = Article

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').label('Title').required().placeholder('Article title...'),
      TextField.make('slug').label('Slug').required(),
    ])
  }

  static override detail(record: unknown) {
    const r = record as { id?: string; title?: string; slug?: string | null; status?: string; createdAt?: Date | string } | null
    if (!r) return [Text.make('Article not found.')]
    return [
      Section.make('Overview').schema([
        Text.make(`Title: ${r.title ?? '(untitled)'}`),
        Text.make(`Slug: ${r.slug ?? '(none)'}`),
        Text.make(`Status: ${r.status ?? 'draft'}`),
      ]),
    ]
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').label('Title').sortable().searchable(),
        Column.make('slug').label('Slug').searchable(),
        Column.make('createdAt').label('Created').sortable(),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .actions([
        Action.make('markFeatured')
          .label('Mark featured')
          .bulk()
          .confirm('Mark these articles as featured?')
          .handler(async (ctx) => {
            const ids = (ctx.records as { id?: string }[] | undefined)?.map(r => r.id).filter(Boolean) ?? []
            if (ids.length === 0) return
            await prisma().article.updateMany({
              where: { id: { in: ids } },
              data:  { featured: true },
            })
          }),
      ])
  }
}

class SiteSettings extends Global {
  static override label         = 'Site Settings'
  static override labelSingular = 'Site Settings'
  static override slug          = 'site-settings'
  static override icon          = 'settings'

  static override form(form: Form): Form {
    return form
      .schema([
        TextField.make('siteName').label('Site name').required().placeholder('Pilotiq Demo'),
        TextField.make('tagline').label('Tagline').placeholder('Optional…'),
      ])
      .loadRecord(async () => {
        const row = await prisma().panelGlobal.findUnique({ where: { slug: 'pilotiq-admin__site' } })
        return row?.data ? JSON.parse(row.data) : {}
      })
      .save(async (data) => {
        await prisma().panelGlobal.upsert({
          where:  { slug: 'pilotiq-admin__site' },
          update: { data: JSON.stringify(data) },
          create: { slug: 'pilotiq-admin__site', data: JSON.stringify(data) },
        })
        return data
      })
  }
}

export const pilotiqAdmin = Pilotiq.make('Pilotiq Admin')
  .path('/new-admin')
  .branding({ title: 'Pilotiq' })
  // No .theme() → inherits the Pilotiq brand default (terracotta on cream,
  // Satoshi via Fontshare). Override per-panel if you want a custom palette.
  .use(themeEditor())
  .resources([ArticleResource])
  .globals([SiteSettings])
  .pages([SimplePage, ElementsShowcase])
  .schema(async () => [
    Heading.make('Welcome to Pilotiq').description('Here\'s a quick overview of your content.'),
    Alert.make('This is a demo of the new schema system.').info().title('Schema Demo'),
    Divider.make('Content'),
    Card.make('Getting Started').description('Quick links to help you get started.').schema([
      Text.make('Create your first article to get started.'),
      Alert.make('The schema system supports nested elements inside cards.').success(),
    ]),
    Divider.make(),
    Alert.make('Stats, charts, and tables will be added in the next phase.').warning().title('Coming Soon'),
  ])

export const pilotiqSimple = Pilotiq.make('Pilotiq simple')
  .path('/simple')
  .layout('topbar')
  .branding({ title: 'Simple' })
  .resources([ArticleResource])