import {
  Resource, Column,
  TextField, EmailField, SelectField,
  unique,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { User } from '../../Models/User.js'
import { UserPostsManager } from './relations/PostsManager.js'
import { ListUsers } from './ListUsers.js'

export class UserResource extends Resource {
  static override label                 = 'Users'
  static override labelSingular         = 'User'
  static override icon                  = 'users'
  static override model                 = User
  static override recordTitleAttribute  = 'name'

  static override navigationGroup = 'System'
  static override navigationSort  = 10

  static override relations() {
    return [UserPostsManager]
  }

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('name').required(),
      EmailField.make('email')
        .required()
        .validate(unique({ model: User, caseInsensitive: true })),
      SelectField.make('role').default('user').options([
        { value: 'user',  label: 'User' },
        { value: 'admin', label: 'Admin' },
      ]),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('name').sortable().searchable().weight('semibold'),
        Column.make('email').searchable().color('muted'),
        Column.make('role').sortable(),
        Column.make('createdAt').sortable().since(),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
  }

  // Actions live on ListUsers — its hooks receive the requesting
  // panel's basePath, keeping the resource panel-portable.
  static override pages() {
    return { index: ListUsers }
  }
}
