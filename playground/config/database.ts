import { Env } from '@rudderjs/core'

// Native engine (@rudderjs/database) — first-party query builder +
// schema migrations, no external ORM. `engine: 'native'` is the opt-in
// flag the auto-discovered NativeDatabaseProvider keys on. Migrations
// live in database/migrations/ — run `pnpm rudder migrate`.
export default {
  default: Env.get('DB_CONNECTION', 'sqlite'),

  connections: {
    sqlite: {
      engine: 'native' as const,
      driver: 'sqlite' as const,
      url:    Env.get('DATABASE_URL', 'file:./dev.db'),
    },

    // pg / mysql use the same shape — swap the driver + connection string.
    pg: {
      engine: 'native' as const,
      driver: 'pg' as const,
      url:    Env.get('DATABASE_URL', ''),
    },

    mysql: {
      engine: 'native' as const,
      driver: 'mysql' as const,
      url:    Env.get('DATABASE_URL', ''),
    },
  },
}
