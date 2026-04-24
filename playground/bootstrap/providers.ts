import type { Application, ServiceProvider } from '@rudderjs/core'
import { defaultProviders } from '@rudderjs/core'
import { panels } from '@pilotiq/panels'
import { adminPanel } from '../app/Panels/Admin/AdminPanel.js'
import { AppServiceProvider } from '../app/Providers/AppServiceProvider.js'

export default [
  ...(await defaultProviders()),

  panels([adminPanel]),

  AppServiceProvider,
] satisfies (new (app: Application) => ServiceProvider)[]
