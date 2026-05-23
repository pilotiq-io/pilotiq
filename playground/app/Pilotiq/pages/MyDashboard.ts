import {
  Page,
  Heading, Section, Grid, Card, Alert, Divider,
} from '@pilotiq/pilotiq'
import { UsersStats }       from '../widgets/UsersStats.js'
import { PostsChart }       from '../widgets/PostsChart.js'
import { RecentPosts }      from '../widgets/RecentPosts.js'
import { ActivityFeedView } from '../widgets/ActivityFeedView.js'

/**
 * Plan #15 demo — panel dashboard composed of four widgets:
 *
 *   - `UsersStats`        — `StatsOverview` row of three KPI cards
 *   - `PostsChart`        — `Chart` with a per-chart filter dropdown
 *   - `RecentPosts`       — `TableWidget` slim list backed by the Post model
 *   - `ActivityFeedView`  — `View` escape-hatch using a custom React component
 *
 * Mounted as the panel's root via `panel.dashboard(MyDashboard)` in
 * `AdminPanel.ts` — that registers it under `cfg.dashboardPage`, auto-
 * adds it to `cfg.pages`, and collapses its nav URL to `${base}` (no
 * trailing slug segment) so the sidebar entry deep-links to `/new-admin`.
 *
 * Every widget is `lazy: true` by default — first paint is a skeleton,
 * data fetches on mount via `POST {base}/_widget/:id`. `PostsChart`
 * additionally polls every 30s so the chart stays current as posts
 * arrive.
 */
export class MyDashboard extends Page {
  static slug  = ''
  static label = 'Dashboard'
  static icon  = 'layout-dashboard'

  static schema() {
    return [
      Heading.make('Dashboard').description('Plan #15 widgets demo — Stat / Chart / TableWidget / View.'),

      // KPI strip across the top.
      UsersStats.make(),

      // Chart with filter dropdown + auto-refresh.
      // Card.make('Posts over time')
      //   .description('Filter changes re-fetch through the same widget polling endpoint.')
      //   .schema([
      //     PostsChart.make().poll(30),
      //   ]),

      Heading.make('Posts over time')
        .description('Filter changes re-fetch through the same widget polling endpoint.')
        .level(2),
        
      PostsChart.make().poll(30),

      // Divider.make(),

      // Slim TableWidget + custom-component View widget side-by-side.
      Grid.make().columns(2).schema([
        Section.make('Recent posts').schema([RecentPosts.make()]),
        Section.make('Activity feed').schema([ActivityFeedView.make()]),
      ]),

      Alert.make('Each widget paints a skeleton on first render and fetches its data lazily.')
        .info()
        .title('Lazy loading'),
    ]
  }
}
