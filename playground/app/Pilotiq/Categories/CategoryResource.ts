import {
  Resource, Column, Action,
  TextField, TextareaField, SlugField,
  unique,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { Category } from '../../Models/Category.js'
import { CategoryPostsManager } from './relations/PostsManager.js'

const ADMIN = '/admin'

export class CategoryResource extends Resource {
  static override label                = 'Categories'
  static override labelSingular        = 'Category'
  static override icon                 = 'folder'
  static override model                = Category
  static override recordTitleAttribute = 'name'

  static override navigationGroup = 'Content'
  static override navigationSort  = 30

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('name').required().placeholder('Engineering')
        .validate(unique({ model: Category, caseInsensitive: true })),
      SlugField.make('slug').from('name').required()
        .validate(unique({ model: Category })),
      TextareaField.make('description').rows(3).placeholder('Optional description…'),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('name').sortable().searchable().weight('semibold'),
        Column.make('slug').searchable().color('muted'),
        Column.make('createdAt').sortable().since(),
      ])
      .headerActions([
        Action.create(CategoryResource, ADMIN),
      ])
      .recordActions([
        Action.edit  (CategoryResource, ADMIN),
        Action.delete(CategoryResource, ADMIN),
      ])
      .defaultSort('name', 'asc')
      .paginate(15)
  }

  static override relations() { return [CategoryPostsManager] }
}
