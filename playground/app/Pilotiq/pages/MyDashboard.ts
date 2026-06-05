import {
  Page,
  Heading, Section,
} from '@pilotiq/pilotiq'
import { SiteStats }   from '../widgets/SiteStats.js'
import { PostsChart }  from '../widgets/PostsChart.js'
import { RecentPosts } from '../widgets/RecentPosts.js'

/**
 * Panel dashboard — KPI strip, posts-per-day chart, and the five newest
 * posts. Mounted as the panel's root via `panel.dashboard(MyDashboard)`
 * in `AdminPanel.ts`, which collapses its nav URL to `${base}` so the
 * sidebar entry deep-links to `/admin`.
 *
 * Every widget is `lazy: true` by default — first paint is a skeleton,
 * data fetches on mount via `POST {base}/_widget/:id`. `PostsChart`
 * additionally polls every 30s.
 */
export class MyDashboard extends Page {
  static slug  = ''
  static label = 'Dashboard'
  static icon  = 'layout-dashboard'

  static schema() {
    return [
      Heading.make('Dashboard').description('What’s happening on your site.'),

      SiteStats.make(),

      Heading.make('Posts over time')
        .description('New posts per day — switch the window from the chart’s filter.')
        .level(2),
      PostsChart.make().poll(30),

      Section.make('Recent posts').schema([RecentPosts.make()]),
    ]
  }
}
