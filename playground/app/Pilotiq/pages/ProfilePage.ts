import { Page, Form, Heading, TextField, EmailField, Section } from '@pilotiq/pilotiq'
import { User } from '../../Models/User.js'

/**
 * Profile page. Wired via `Pilotiq.profile(ProfilePage)` in
 * `AdminPanel.ts` — that auto-prepends an "Edit profile" entry on the
 * user menu pointing here.
 *
 * The resolved panel user's id matches the seeded `demo-admin` row, so
 * the form loads from and saves to a real user record. Falls back to
 * the resolved user when the row is missing (fresh DB before seeding).
 */
export class ProfilePage extends Page {
  static override slug  = 'profile'
  static override label = 'My profile'
  static override icon  = 'user-circle'

  // Hide from the sidebar — the user menu owns the entry.
  static override navigationGroup = undefined
  static override navigationLabel = undefined

  static override schema() {
    return [
      Heading.make('My profile').description('Update your account details.'),
      Section.make('Identity').schema([
        Form.make()
          .schema([
            TextField.make('name').label('Name').required(),
            EmailField.make('email').label('Email').required(),
          ])
          .loadRecord(async (_id, ctx) => {
            const user = (ctx as { user?: { id?: string; name?: string; email?: string } | null }).user
            if (user?.id) {
              const row = await User.find(user.id)
              if (row) return { name: row.name, email: row.email }
            }
            return user ?? {}
          })
          .save(async (data, ctx) => {
            const user = (ctx as { user?: { id?: string } | null }).user
            if (user?.id && await User.find(user.id)) {
              await User.update(user.id, {
                name:  String(data['name'] ?? ''),
                email: String(data['email'] ?? ''),
              })
            }
            return data
          }),
      ]),
    ]
  }
}
