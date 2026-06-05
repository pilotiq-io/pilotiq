import { TableWidget, Column, type ModelQuery } from '@pilotiq/pilotiq'
import { Post } from '../../Models/Post.js'

/**
 * Plan #15 Phase D demo — slim "5 newest posts" list. Uses `static
 * model + static query` for the model-driven path; the columns reuse
 * the same `Column` shape as a Resource list page.
 */
export class RecentPosts extends TableWidget {
  static override label      = 'Recent posts'
  static override viewAllUrl = '/admin/posts'
  static override model      = Post

  static override async query(q: ModelQuery) {
    return q.orderBy('createdAt', 'DESC').paginate(1, 5)
  }

  static override columns() {
    return [
      Column.make('title').label('Title').limit(40),
      Column.make('status').label('Status'),
      Column.make('createdAt').label('Created').since(),
    ]
  }
}
