import { Resource, Form, TextField, Table, Column } from '@pilotiq/pilotiq'
import { Tag as TagIcon } from 'lucide-react'
import { Tag } from '../../Models/Tag.js'
import { ContentCluster } from '../Content/ContentCluster.js'

/**
 * Tag Resource — backs the M2M demo on the Article side. Registered
 * primarily so `TagsManager`'s candidate picker can resolve a record
 * title via `recordTitleAttribute = 'name'`. The standalone CRUD
 * surface (list / create / edit) is also genuinely useful — users
 * manage their tag library here, then attach via the Article relation.
 */
export class TagResource extends Resource {
  static override label         = 'Tags'
  static override labelSingular = 'Tag'
  static override icon          = TagIcon
  static override model         = Tag

  static override cluster             = ContentCluster
  static override navigationSort      = 30
  static override recordTitleAttribute = 'name'

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('name').required().placeholder('Engineering'),
      TextField.make('slug').required().placeholder('engineering'),
      TextField.make('color').placeholder('#10b981'),
    ])
  }

  static override table(table: Table): Table {
    return table.columns([
      Column.make('name').sortable().searchable(),
      Column.make('slug').searchable(),
      Column.make('color'),
    ])
  }
}
