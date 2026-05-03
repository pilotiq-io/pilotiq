import {
  Pilotiq, Global, TextField,
  Form,
} from '@pilotiq/pilotiq'
import { themeEditor } from '@pilotiq/pilotiq/plugins'
import { registerIcons } from '@pilotiq/pilotiq/icons'
import { lucideIcons } from '@pilotiq/pilotiq/icons/lucide'
import { app } from '@rudderjs/core'
import { ArticleResource } from './Articles/ArticleResource.js'
import { UserResource }    from './Users/UserResource.js'
import { PostResource }    from './Posts/PostResource.js'
import { TagResource }     from './Tags/TagResource.js'
import { VideoResource }   from './Videos/VideoResource.js'
import { CommentResource } from './Comments/CommentResource.js'
import { SimplePage } from './pages/SimplePage.js'
import { ElementsShowcase } from './pages/ElementsShowcase.js'
import { ReactiveDemo } from './pages/ReactiveDemo.js'
import { FieldTypesDemo } from './pages/FieldTypesDemo.js'
import { LayoutsDemo } from './pages/LayoutsDemo.js'
import { RepeaterDemo } from './pages/RepeaterDemo.js'
import { BuilderDemo } from './pages/BuilderDemo.js'
import { MyDashboard } from './pages/MyDashboard.js'

// Register the curated lucide baseline so string-typed icons
// (Action.icon('check'), Column.icon('star'), etc.) resolve at render time.
// Runs at module load — both server (provider boot) and client (auto-gen
// _components.ts re-imports this file).
registerIcons(lucideIcons)

function prisma(): any {
  return app().make('prisma')
}

class SiteSettings extends Global {
  static override label         = 'Site Settings'
  static override labelSingular = 'Site Settings'
  static override slug          = 'site-settings'
  static override icon          = 'settings'

  static override form(form: Form): Form {
    return form
      .schema([
        TextField.make('siteName').label('Site name').required().placeholder('Pilotiq Demo'),
        TextField.make('tagline').label('Tagline').placeholder('Optional…'),
      ])
      .loadRecord(async () => {
        const row = await prisma().panelGlobal.findUnique({ where: { slug: 'pilotiq-admin__site' } })
        return row?.data ? JSON.parse(row.data) : {}
      })
      .save(async (data) => {
        await prisma().panelGlobal.upsert({
          where:  { slug: 'pilotiq-admin__site' },
          update: { data: JSON.stringify(data) },
          create: { slug: 'pilotiq-admin__site', data: JSON.stringify(data) },
        })
        return data
      })
  }
}

export const pilotiqAdmin = Pilotiq.make('Pilotiq Admin')
  .path('/new-admin')
  .branding({ title: 'Pilotiq' })
  .use(themeEditor())
  // Plan #10 demo — pretend everyone is an admin so the canDelete()
  // check on `ArticleResource` shows the Delete row action. Real apps
  // would pass `req => Auth.user()` (from `@rudderjs/auth`).
  .user(() => ({ role: 'admin', name: 'Demo Admin' }))
  // Note: `.uploads(...)` is wired in `bootstrap/providers.ts` (server-only)
  // because `localUpload` imports `node:fs/promises` and the panel module
  // is read on the client through the auto-gen `_components.ts` manifest.
  .resources([ArticleResource, UserResource, PostResource, TagResource, VideoResource, CommentResource])
  .globals([SiteSettings])
  .pages([MyDashboard, SimplePage, ElementsShowcase, ReactiveDemo, FieldTypesDemo, LayoutsDemo, RepeaterDemo, BuilderDemo])
  // Plan #15 — mark MyDashboard as the panel's root page. The custom
  // root replaces the previous `.schema(async () => [...])` placeholder;
  // panel.dashboard() registers MyDashboard, collapses its nav URL to
  // `${base}`, and routes `${base}` to its schema.
  .dashboard(MyDashboard)

export const pilotiqSimple = Pilotiq.make('Pilotiq simple')
  .path('/simple')
  .layout('topbar')
  .branding({ title: 'Simple' })
  .resources([ArticleResource])
