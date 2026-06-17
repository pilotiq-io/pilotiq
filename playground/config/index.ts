import app          from './app.js'
import server       from './server.js'
import database     from './database.js'
import cache        from './cache.js'
import session      from './session.js'
import log          from './log.js'
import localization from './localization.js'
import storage      from './storage.js'

const configs = { app, server, database, cache, session, log, localization, storage }

export type Configs = typeof configs

export default configs
