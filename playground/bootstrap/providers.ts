import type { Application, ServiceProvider } from '@rudderjs/core'
import { defaultProviders } from '@rudderjs/core'
import { StorageProvider } from '@rudderjs/storage'
import { ModelRegistry } from '@rudderjs/orm'
import { pilotiq } from '@pilotiq/pilotiq'
import { localUpload } from '@pilotiq/pilotiq/uploads'
import { Media } from '@pilotiq/media/server'
import { pilotiqAdmin } from '../app/Pilotiq/AdminPanel.js'
import { pilotiqGuest } from '../app/Pilotiq/GuestPanel.js'
import { AppServiceProvider } from '../app/Providers/AppServiceProvider.js'
import { User } from '../app/Models/User.js'

// @pilotiq/media's model lives outside `app/Models/**`, so register it
// explicitly (server-only) for `rudder schema:types` + eager observers. The
// `public` storage disk (config/storage.ts) backs its upload pipeline.
ModelRegistry.register(Media)

// Server-only adapter wiring — kept out of the panel modules because the
// Vite plugin's auto-generated `_components.ts` manifest re-imports
// them on the client to resolve component icons, and `localUpload`
// pulls in `node:fs/promises` which Vite externalizes in the browser
// bundle.
const uploads = { adapter: localUpload({ root: 'public/uploads', urlPrefix: '/uploads' }) }
pilotiqAdmin.uploads(uploads)
pilotiqGuest.uploads(uploads)

// Demo auth, session-backed — POST /login (routes/web.ts) stashes the
// user id under `userId`; resolve it against the `user` row on every
// request so profile edits show up in the user-menu chrome. Signed-out
// requests resolve null and AdminPanel's `.guard()` bounces them to
// /login. Real apps pass `req => Auth.user()` instead. The guest panel
// deliberately has NO resolver — everyone is a guest there.
pilotiqAdmin.user(async (req) => {
  const id = (req as { session?: { get?: (key: string) => unknown } })?.session?.get?.('userId')
  if (typeof id !== 'string' || id === '') return null
  const row = await User.find(id).catch(() => null)
  return row ? { id: row.id, role: row.role, name: row.name, email: row.email } : null
})

export default [
  ...(await defaultProviders()),

  // Storage disks (`config/storage.ts`) — boots the `public` disk that
  // @pilotiq/media writes uploads + conversions to.
  StorageProvider,

  pilotiq([pilotiqAdmin, pilotiqGuest]),

  AppServiceProvider,
] satisfies (new (app: Application) => ServiceProvider)[]
