import { resolve } from 'node:path'
import type { Application, ServiceProvider } from '@rudderjs/core'
import { auth } from '@rudderjs/auth'
import { hash } from '@rudderjs/hash'
import { cache } from '@rudderjs/cache'
import { storage } from '@rudderjs/storage'
import { session } from '@rudderjs/session'
import { localization } from '@rudderjs/localization'
import { database } from '@rudderjs/orm-prisma'
import { panels } from '@pilotiq/panels'
import { adminPanel } from '../app/Panels/Admin/AdminPanel.js'
import { log }       from '@rudderjs/log'
import { AppServiceProvider } from '../app/Providers/AppServiceProvider.js'
import configs from '../config/index.js'

export default [
  // ── Infrastructure (order matters) ──────────────────────
  log(configs.log),
  database(configs.database),
  session(configs.session),
  hash(configs.hash),
  cache(configs.cache),
  auth(configs.auth),

  // ── Features ────────────────────────────────────────────
  storage(configs.storage),
  localization({
    locale:   configs.app.locale,
    fallback: configs.app.fallback,
    path:     resolve(process.cwd(), 'lang'),
  }),

  // ── Panels (open-core, free pilotiq) ───────────────────
  panels([adminPanel]),

  // ── Application ─────────────────────────────────────────
  AppServiceProvider,
] satisfies (new (app: Application) => ServiceProvider)[]
