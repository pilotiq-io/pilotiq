import type { Application, ServiceProvider } from '@rudderjs/core'
import { defaultProviders } from '@rudderjs/core'
import { panels } from '@pilotiq/panels'
import { adminPanel } from '../app/Panels/Admin/AdminPanel.js'
import { AppServiceProvider } from '../app/Providers/AppServiceProvider.js'

export default [
  ...(await defaultProviders()),

  // Pilotiq panels — parameterized one-off (takes a list of panel plugins),
  // doesn't fit the auto-discovery shape so it's registered manually.
  panels([adminPanel]),

  AppServiceProvider,
] satisfies (new (app: Application) => ServiceProvider)[]
