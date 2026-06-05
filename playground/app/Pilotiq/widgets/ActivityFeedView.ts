import { View } from '@pilotiq/pilotiq'
import { Post } from '../../Models/Post.js'

interface ActivityRow {
  title:  string
  status: string
  ago:    string
}

/**
 * Plan #15 demo — escape-hatch `View` widget. Pulls the eight most
 * recently created posts and ships them as `{ rows }`. The matching
 * client component is `ActivityFeed.tsx`, registered in `+Layout.tsx`
 * via `registerWidgetComponents({ ActivityFeed })`.
 *
 * `static componentName` is the registry-lookup key — it does NOT need
 * to match the JS class name (renaming the subclass is safe), only the
 * string passed to `registerWidgetComponents`.
 */
export class ActivityFeedView extends View {
  static override componentName = 'ActivityFeed'

  static override async getData(): Promise<{ rows: ActivityRow[] }> {
    // Soft-delete default scope already excludes trashed rows.
    const recent = await Post.query()
      .orderBy('createdAt', 'DESC')
      .limit(8)
      .get() as Array<{ title: string; status: string; createdAt: Date | string }>

    const now = Date.now()
    return {
      rows: recent.map(r => ({
        title:  r.title,
        status: r.status,
        ago:    formatAgo(now - new Date(r.createdAt).getTime()),
      })),
    }
  }
}

function formatAgo(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000))
  if (sec < 60)        return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60)        return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr  < 24)        return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}
