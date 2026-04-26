import {
  Pilotiq, Resource, TextField, Column,
  Form, Table,
  Heading, Text, Alert, Divider, Card,
} from '@pilotiq/pilotiq'
import { themeEditor } from '@pilotiq/pilotiq/plugins'
import { SimplePage } from './pages/SimplePage.js'
import { ElementsShowcase } from './pages/ElementsShowcase.js'

class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override icon          = 'file-text'

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').label('Title').required().placeholder('Article title...'),
      TextField.make('slug').label('Slug').required(),
    ])
  }

  static override table(table: Table): Table {
    return table.columns([
      Column.make('title').label('Title').sortable().searchable(),
      Column.make('slug').label('Slug'),
      Column.make('createdAt').label('Created'),
    ])
  }
}

export const pilotiqAdmin = Pilotiq.make('Pilotiq Admin')
  .path('/new-admin')
  .branding({ title: 'Pilotiq' })
  // No .theme() → inherits the Pilotiq brand default (terracotta on cream,
  // Satoshi via Fontshare). Override per-panel if you want a custom palette.
  .use(themeEditor())
  .resources([ArticleResource])
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