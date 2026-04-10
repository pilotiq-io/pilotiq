import app      from './app.js'
import server   from './server.js'
import database from './database.js'
import cache    from './cache.js'
import storage  from './storage.js'
import auth     from './auth.js'
import hash     from './hash.js'
import session  from './session.js'
import media    from './media.js'
import log      from './log.js'

const configs = { app, server, database, cache, storage, auth, hash, session, media, log }

export type Configs = typeof configs

export default configs
