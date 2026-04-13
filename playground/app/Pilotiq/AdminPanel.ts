import { Pilotiq, Resource, TextField, Column } from '@pilotiq/pilotiq'

class ArticleResource extends Resource {
  static label          = 'Articles'
  static labelSingular  = 'Article'
  static icon           = 'file-text'

  table() {
    return {
      columns: [
        Column.make('title').label('Title').sortable().searchable(),
        Column.make('slug').label('Slug'),
        Column.make('createdAt').label('Created'),
      ],
    }
  }

  form() {
    return {
      fields: [
        TextField.make('title').label('Title').required().placeholder('Article title...'),
        TextField.make('slug').label('Slug').required(),
      ],
    }
  }
}

export const pilotiqAdmin = Pilotiq.make('Pilotiq Admin')
  .path('/new-admin')
  .branding({ title: 'Pilotiq' })
  .resources([new ArticleResource()])

export const pilotiqSimple = Pilotiq.make('Pilotiq simple')
  .path('/simple')
  .branding({ title: 'Simple' })
  .resources([new ArticleResource()])