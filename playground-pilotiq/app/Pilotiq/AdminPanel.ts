import {
  Pilotiq, Global, TextField,
  Form,
  Heading, Text, Alert, Divider, Card,
} from '@pilotiq/pilotiq'
import { themeEditor } from '@pilotiq/pilotiq/plugins'
import { app } from '@rudderjs/core'
import { ArticleResource } from './Articles/ArticleResource.js'
import { SimplePage } from './pages/SimplePage.js'
import { ElementsShowcase } from './pages/ElementsShowcase.js'

function prisma(): any {
  return app().make('prisma')
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
