import { StatsOverview, Stat } from '@pilotiq/pilotiq'
import { app } from '@rudderjs/core/client'

function prisma(): any {
  return app().make('prisma')
}

/**
 * Plan #15 Phase B demo — KPI cards row. Three stats: total users,
 * total posts, posts published this week. Lazy by default — first paint
 * is a skeleton; data fetches on mount via `POST {base}/_widget/:id`.
 */
export class UsersStats extends StatsOverview {
  static override columns = 3

  static override async getStats(): Promise<Stat[]> {
    const db = prisma()
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)

    const [users, posts, recent] = await Promise.all([
      db.user.count(),
      db.post.count({ where: { deletedAt: null } }),
      db.post.count({
        where: { deletedAt: null, publishedAt: { gte: weekAgo } },
      }),
    ])

    return [
      Stat.make('Users')
        .value(users)
        .description('total registered')
        .icon('users')
        .url('/new-admin/users'),

      Stat.make('Posts')
        .value(posts)
        .description('not in trash')
        .icon('file-text')
        .url('/new-admin/posts'),

      Stat.make('Published this week')
        .value(recent)
        .description('+ vs last week')
        .descriptionIcon('trending-up')
        .icon('trending-up')
        .chart([3, 5, 4, 7, 8, 6, recent]),
    ]
  }
}
