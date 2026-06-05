import { StatsOverview, Stat } from '@pilotiq/pilotiq'
import { User } from '../../Models/User.js'
import { Post } from '../../Models/Post.js'

/**
 * Plan #15 Phase B demo — KPI cards row. Three stats: total users,
 * total posts, posts published this week. Lazy by default — first paint
 * is a skeleton; data fetches on mount via `POST {base}/_widget/:id`.
 */
export class UsersStats extends StatsOverview {
  static override columns = 3

  static override async getStats(): Promise<Stat[]> {
    // ISO string, not a Date — better-sqlite3 can't bind Date objects,
    // and the ORM stores ISO-8601/UTC timestamps.
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

    // Post.softDeletes = true → the default scope already excludes
    // trashed rows; no explicit deletedAt filter needed.
    const [users, posts, recent] = await Promise.all([
      User.count(),
      Post.count(),
      Post.query().where('publishedAt', '>=', weekAgo).count(),
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
