import type { Application, ServiceProvider } from '@rudderjs/core'
import { defaultProviders } from '@rudderjs/core'
import { pilotiq } from '@pilotiq/pilotiq'
import { localUpload } from '@pilotiq/pilotiq/uploads'
import { pilotiqAdmin, pilotiqSimple } from '../app/Pilotiq/AdminPanel.js'
import { AppServiceProvider } from '../app/Providers/AppServiceProvider.js'

// Server-only adapter wiring — kept out of `AdminPanel.ts` because the
// Vite plugin's auto-generated `_components.ts` manifest re-imports
// the panel module on the client to resolve component icons, and
// `localUpload` pulls in `node:fs/promises` which Vite externalizes
// in the browser bundle.
pilotiqAdmin.uploads({
  adapter: localUpload({ root: 'public/uploads', urlPrefix: '/uploads' }),
})

export default [
  ...(await defaultProviders()),

  pilotiq([pilotiqAdmin, pilotiqSimple]),

  AppServiceProvider,
] satisfies (new (app: Application) => ServiceProvider)[]
