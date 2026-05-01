import {
  Resource, Column, TextField, EmailField, SelectField,
  type Form, type Table,
} from '@pilotiq/pilotiq'
import { User } from '../../Models/User.js'
import { PostsManager } from './relations/PostsManager.js'

/**
 * Plan #11 demo — UserResource hosts a `Posts` relation manager that
 * mounts as an extra tab on the user's Edit/View page. Visit
 * `/new-admin/users/:id/edit` and switch to the Posts tab.
 */
export class UserResource extends Resource {
  static override label                 = 'Users'
  static override labelSingular         = 'User'
  static override icon                  = 'users'
  static override model                 = User
  static override recordTitleAttribute  = 'name'

  static override navigationGroup = 'People'
  static override navigationSort  = 10

  static override relations() {
    return [PostsManager]
  }

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('name').required(),
      EmailField.make('email').required(),
      SelectField.make('role').default('user').options([
        { value: 'user',  label: 'User' },
        { value: 'admin', label: 'Admin' },
      ]),
    ])
  }

  static override table(table: Table): Table {
    return table
      .heading('Users')
      .columns([
        Column.make('name').sortable().searchable().weight('semibold'),
        Column.make('email').searchable().color('muted'),
        Column.make('role').sortable(),
        Column.make('createdAt').sortable().since(),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .recordUrl(r => {
        const id = (r as { id?: string })?.id
        return id ? `/new-admin/users/${id}/edit` : undefined
      })
  }
}
