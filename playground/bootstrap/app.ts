import 'reflect-metadata'
import 'dotenv/config'
import { Application } from '@rudderjs/core'
import { hono } from '@rudderjs/server-hono'
import { RateLimit } from '@rudderjs/middleware'
import { requestIdMiddleware } from '../app/Middleware/RequestIdMiddleware.ts'
import { AppError } from '../app/Exceptions/AppError.ts'
import configs from '../config/index.ts'
import providers from './providers.ts'

export default Application.configure({
  server:    hono(configs.server),
  config:    configs,
  providers,
})
  .withRouting({
    web:      () => import('../routes/web.ts'),
    api:      () => import('../routes/api.ts'),
    commands: () => import('../routes/console.ts'),
    // channels: broadcast not used in pilotiq playground — re-enable
    //           by exporting Broadcast.channel(...) calls from routes/channels.ts
  })
  .withMiddleware((m) => {
    // Global middlewares
    // m.use(RateLimit.perMinute(60))
    // NOTE: no sessionMiddleware here — the session() provider auto-installs
    // it on the `web` group; a second global install double-appends
    // Set-Cookie and can clobber the login cookie (rudder warns since
    // session@2.4.0).
    m.use(requestIdMiddleware)
  })
  .withExceptions((e) => {
    // AppError → JSON response using its statusCode and code fields.
    // ValidationError is handled automatically (422) — no entry needed here.
    e.render(AppError, (err) =>
      new Response(JSON.stringify(err.toJSON()), {
        status:  err.statusCode,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })
  .create()
