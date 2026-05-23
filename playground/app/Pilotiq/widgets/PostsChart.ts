import { Chart } from '@pilotiq/recharts'
import type { RenderContext } from '@pilotiq/pilotiq'
import { app } from '@rudderjs/core'

function prisma(): any {
  return app().make('prisma')
}

/**
 * Plan #15 Phase C demo — line chart of post counts per day, with a
 * per-chart filter dropdown switching between three time windows.
 *
 * The filter selection rides on `ctx.filter` (the polling endpoint
 * stamps it from the request body; the synchronous server-render path
 * falls back to `static defaultFilter`). Switching windows triggers a
 * re-fetch through the same `_widget/:id` polling endpoint.
 */
export class PostsChart extends Chart {
  static override label   = 'Posts per day'
  static override type    = 'line' as const
  // No explicit color — defaults to the theme chart palette (--chart-1)
  // so the chart tracks the theme editor's "Chart Color" setting.
  static override maxHeight = 280

  static override filters = {
    today: 'Today',
    week:  'Last 7 days',
    month: 'Last 30 days',
  }

  static override defaultFilter = 'month'

  static override async getData(ctx: RenderContext) {
    const days = ctx.filter === 'today' ? 1
              :  ctx.filter === 'month' ? 30
              :  7

    const since = new Date(Date.now() - days * 86_400_000)
    since.setHours(0, 0, 0, 0)

    const rows = await prisma().post.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      select: { createdAt: true },
    }) as Array<{ createdAt: Date }>

    const buckets = new Map<string, number>()
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 86_400_000)
      buckets.set(toIsoDay(d), 0)
    }
    for (const row of rows) {
      const key = toIsoDay(row.createdAt)
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }

    return {
      labels:   [...buckets.keys()],
      datasets: [{ label: 'Posts', data: [...buckets.values()] }],
    }
  }
}

function toIsoDay(d: Date): string {
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
