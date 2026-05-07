import { Page, Form, Heading, TextField, EmailField, Section } from '@pilotiq/pilotiq'

/**
 * Profile page demo. Wired to the panel via `Pilotiq.profile(ProfilePage)`
 * in `AdminPanel.ts` — that auto-prepends an "Edit profile" entry on
 * the top-right user menu pointing here, and registers the page route.
 *
 * `loadRecord(ctx)` reads from the resolved user. Real apps would
 * persist the changes against their auth model in `save()` (we no-op
 * the playground demo since there's no real user store to write back).
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
          .loadRecord(async (ctx) => {
            const user = (ctx as any).user as { name?: string; email?: string } | null
            return user ?? {}
          })
          .save(async (data) => {
            // Demo: no-op. In a real app, persist via Auth.user().update(data) or similar.
            return data
          }),
      ]),
    ]
  }
}
