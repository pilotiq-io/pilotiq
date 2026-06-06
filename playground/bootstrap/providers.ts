import type { Application, ServiceProvider } from '@rudderjs/core'
import { defaultProviders } from '@rudderjs/core'
import { pilotiq } from '@pilotiq/pilotiq'
import { localUpload } from '@pilotiq/pilotiq/uploads'
import { pilotiqAdmin } from '../app/Pilotiq/AdminPanel.js'
import { AppServiceProvider } from '../app/Providers/AppServiceProvider.js'
import { User } from '../app/Models/User.js'

// Server-only adapter wiring — kept out of `AdminPanel.ts` because the
// Vite plugin's auto-generated `_components.ts` manifest re-imports
// the panel module on the client to resolve component icons, and
// `localUpload` pulls in `node:fs/promises` which Vite externalizes
// in the browser bundle.
pilotiqAdmin.uploads({
  adapter: localUpload({ root: 'public/uploads', urlPrefix: '/uploads' }),
})

// Demo auth, DB-backed — re-resolve the fixed admin identity against
// the real `user` row on every request so profile edits show up in the
// user-menu chrome. Overrides the static identity AdminPanel.ts sets
// (kept there as the fresh-DB fallback before seeding). Real apps pass
// `req => Auth.user()` instead.
pilotiqAdmin.user(async () => {
  const row = await User.find('demo-admin').catch(() => null)
  return row
    ? { id: row.id, role: row.role, name: row.name, email: row.email }
    : { id: 'demo-admin', role: 'admin', name: 'Demo Admin', email: 'admin@example.com' }
})

export default [
  ...(await defaultProviders()),

  pilotiq([pilotiqAdmin]),

  AppServiceProvider,
] satisfies (new (app: Application) => ServiceProvider)[]
