import { Env } from '@rudderjs/core'
import { PrismaClient } from '@prisma/client'

export default {
  default: Env.get('DB_CONNECTION', 'sqlite'),

  // Pass the app's PrismaClient so orm-prisma uses this playground's
  // generated client, not the one from the linked rudderjs repo.
  PrismaClient: PrismaClient as any,

  connections: {
    sqlite: {
      driver: 'sqlite' as const,
      url:    Env.get('DATABASE_URL', 'file:./dev.db'),
    },

    postgresql: {
      driver: 'postgresql' as const,
      url:    Env.get('DATABASE_URL', ''),
    },

    mysql: {
      driver: 'mysql' as const,
      url:    Env.get('DATABASE_URL', ''),
    },
  },
}
