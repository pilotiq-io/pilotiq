import {
  Resource, Column, BooleanColumn,
  TextField, ToggleField, SlugField,
  unique,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { RichTextField } from '@pilotiq/tiptap'
import { Page } from '../../Models/Page.js'
import { ListSitePages } from './ListSitePages.js'

/**
 * Static site pages (About, Contact, Privacy…) — title, slug, rich
 * content, and a published toggle.
 */
export class PageResource extends Resource {
  static override label                = 'Pages'
  static override labelSingular        = 'Page'
  static override icon                 = 'file-text'
  static override model                = Page
  static override recordTitleAttribute = 'title'

  static override navigationGroup = 'Content'
  static override navigationSort  = 20

  static override globalSearch = true

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').required().placeholder('About us'),
      SlugField.make('slug').from('title').required()
        .validate(unique({ model: Page })),
      RichTextField.make('content').label('Content').placeholder('Write the page…'),
      ToggleField.make('published').label('Published'),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable().weight('semibold'),
        Column.make('slug').searchable().color('muted'),
        BooleanColumn.make('published'),
        Column.make('updatedAt').label('Updated').sortable().since(),
      ])
      .defaultSort('title', 'asc')
      .paginate(15)
  }

  // Actions live on ListSitePages — its hooks receive the requesting
  // panel's basePath (this resource serves both /admin and /guest).
  static override pages() {
    return { index: ListSitePages }
  }
}
