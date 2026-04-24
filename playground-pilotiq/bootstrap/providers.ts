import type { Application, ServiceProvider } from '@rudderjs/core'
import { defaultProviders } from '@rudderjs/core'
import { pilotiq } from '@pilotiq/pilotiq'
import { pilotiqAdmin, pilotiqSimple } from '../app/Pilotiq/AdminPanel.js'
import { AppServiceProvider } from '../app/Providers/AppServiceProvider.js'

export default [
  ...(await defaultProviders()),

  pilotiq([pilotiqAdmin, pilotiqSimple]),

  AppServiceProvider,
] satisfies (new (app: Application) => ServiceProvider)[]
