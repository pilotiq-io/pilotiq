import {
  Pilotiq, Resource, Global, TextField, Column,
  Form, Table,
  Heading, Text, Alert, Divider, Card, Section,
} from '@pilotiq/pilotiq'
import { themeEditor } from '@pilotiq/pilotiq/plugins'
import { app } from '@rudderjs/core'
import { SimplePage } from './pages/SimplePage.js'
import { ElementsShowcase } from './pages/ElementsShowcase.js'

function prisma(): any {
  return app().make('prisma')
}

class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override icon          = 'file-text'

  static override form(form: Form): Form {
    return form
      .schema([
        TextField.make('title').label('Title').required().placeholder('Article title...'),
        TextField.make('slug').label('Slug').required(),
      ])
      .loadRecord(async (id) => prisma().article.findUnique({ where: { id } }))
      .save(async (data, ctx) => {
        const payload = { title: String(data['title'] ?? ''), slug: String(data['slug'] ?? '') }
        const existing = ctx.record as { id?: string } | undefined
        if (existing?.id) {
          return prisma().article.update({ where: { id: existing.id }, data: payload })
        }
        return prisma().article.create({ data: payload })
      })
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

  static override async deleteRecord(id: string): Promise<void> {
    await prisma().article.delete({ where: { id } })
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').label('Title').sortable().searchable(),
        Column.make('slug').label('Slug'),
        Column.make('createdAt').label('Created'),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .records(async (ctx) => {
        const where = ctx.search
          ? { OR: [
              { title: { contains: ctx.search } },
              { slug:  { contains: ctx.search } },
            ] }
          : undefined
        const orderBy = ctx.sort
          ? { [ctx.sort.column]: ctx.sort.direction }
          : { createdAt: 'desc' as const }
        const perPage = ctx.perPage ?? 10
        const page    = ctx.page ?? 1
        const [rows, total] = await Promise.all([
          prisma().article.findMany({ where, orderBy, take: perPage, skip: (page - 1) * perPage }),
          prisma().article.count({ where }),
        ])
        return { rows, total }
      })
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