import { StatsOverview, Stat } from '@pilotiq/pilotiq'
import { Post } from '../../Models/Post.js'
import { Comment } from '../../Models/Comment.js'

/**
 * Dashboard KPI strip — posts, comments, posts published this week.
 * Lazy by default: first paint is a skeleton; data fetches on mount
 * via `POST {base}/_widget/:id`.
 */
export class SiteStats extends StatsOverview {
  static override columns = 3

  static override async getStats(): Promise<Stat[]> {
    // ISO string, not a Date — better-sqlite3 can't bind Date objects.
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

    // Post.softDeletes = true → the default scope already excludes
    // trashed rows.
    const [posts, comments, recent] = await Promise.all([
      Post.count(),
      Comment.count(),
      Post.query().where('publishedAt', '>=', weekAgo).count(),
    ])

    return [
      Stat.make('Posts')
        .value(posts)
        .description('not in trash')
        .icon('newspaper')
        .url('/admin/posts'),

      Stat.make('Comments')
        .value(comments)
        .description('across all posts')
        .icon('message-square')
        .url('/admin/comments'),

      Stat.make('Published this week')
        .value(recent)
        .description('last 7 days')
        .descriptionIcon('trending-up')
        .icon('trending-up')
        .chart([3, 5, 4, 7, 8, 6, recent]),
    ]
  }
}
