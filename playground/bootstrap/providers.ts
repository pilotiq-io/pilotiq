import type { Application, ServiceProvider } from '@rudderjs/core'
import { defaultProviders } from '@rudderjs/core'
import { panels } from '@pilotiq/panels'
import { pilotiq } from '@pilotiq/pilotiq'
import { adminPanel } from '../app/Panels/Admin/AdminPanel.js'
import { pilotiqAdmin, pilotiqSimple } from '../app/Pilotiq/AdminPanel.js'
import { AppServiceProvider } from '../app/Providers/AppServiceProvider.js'

export default [
  ...(await defaultProviders()),

  // Old panels (at /admin) — will be removed once pilotiq has full parity
  panels([adminPanel]),

  // New pilotiq (at /new-admin) — view-based, auto-generates pages
  pilotiq([pilotiqAdmin, pilotiqSimple]),

  AppServiceProvider,
] satisfies (new (app: Application) => ServiceProvider)[]
