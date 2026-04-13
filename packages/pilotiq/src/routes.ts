import type { Router } from '@rudderjs/router'
import { view } from '@rudderjs/view'
import type { Pilotiq } from './Pilotiq.js'
import type { Resource } from './Resource.js'
import type { Page } from './Page.js'
import { resolveSchema } from './schema/resolveSchema.js'

function panelInfo(cfg: ReturnType<Pilotiq['getConfig']>) {
  return {
    name: cfg.name,
    branding: cfg.branding,
    resources: cfg.resources.map(R => {
      const Ctor = R.constructor as typeof Resource
      return { label: Ctor.label, slug: Ctor.getSlug(), icon: Ctor.icon }
    }),
    pages: cfg.pages.map(P => ({
      label: P.getLabel(), slug: P.getSlug(), icon: P.icon,
    })),
  }
}

export function registerPilotiqRoutes(
  router: Router,
  panel: Pilotiq,
): void {
  const cfg = panel.getConfig()
  const base = cfg.path

  // Dashboard
  router.get(base, async () => {
    const schemaData = await resolveSchema(cfg.schema, {})
    return view('pilotiq.dashboard', {
      panel: panelInfo(cfg),
      basePath: base,
      layout: cfg.layout,
      schemaData,
    })
  })

  // Resource routes
  for (const R of cfg.resources) {
    const Ctor = R.constructor as typeof Resource
    const slug = Ctor.getSlug()

    // Index
    router.get(`${base}/${slug}`, async () => {
      const tableConfig = R.table()
      return view('pilotiq.resources.index', {
        panel:    panelInfo(cfg),
        resource: { label: Ctor.label, labelSingular: Ctor.labelSingular, slug, icon: Ctor.icon },
        columns:  tableConfig.columns.map(col => ({
          name: col.name,
          label: col.getLabel(),
          sortable: col.isSortable(),
          searchable: col.isSearchable(),
        })),
        basePath: base,
        layout: cfg.layout,
      })
    })

    // Create
    router.get(`${base}/${slug}/create`, async () => {
      const formConfig = R.form()
      return view('pilotiq.resources.form', {
        panel:    panelInfo(cfg),
        resource: { label: Ctor.labelSingular, slug, icon: Ctor.icon },
        fields:   formConfig.fields.map(f => ({
          name: f.name,
          fieldType: f.fieldType,
          label: f.getLabel(),
          required: f.isRequired(),
          readonly: f.isReadonly(),
          placeholder: f.getPlaceholder(),
        })),
        mode:     'create' as const,
        basePath: base,
        layout: cfg.layout,
      })
    })

    // Edit
    router.get(`${base}/${slug}/:id/edit`, async (req) => {
      const formConfig = R.form()
      return view('pilotiq.resources.form', {
        panel:    panelInfo(cfg),
        resource: { label: Ctor.labelSingular, slug, icon: Ctor.icon },
        fields:   formConfig.fields.map(f => ({
          name: f.name,
          fieldType: f.fieldType,
          label: f.getLabel(),
          required: f.isRequired(),
          readonly: f.isReadonly(),
          placeholder: f.getPlaceholder(),
        })),
        mode:     'edit' as const,
        recordId: req.params['id'],
        basePath: base,
        layout: cfg.layout,
      })
    })
  }

  // Custom page routes
  for (const PageClass of cfg.pages) {
    const pageSlug = PageClass.getSlug()

    router.get(`${base}/${pageSlug}`, async () => {
      const schemaData = await resolveSchema(
        (ctx) => PageClass.schema(ctx),
        {},
      )
      return view('pilotiq.page', {
        panel:      panelInfo(cfg),
        page:       PageClass.toMeta(),
        schemaData,
        basePath:   base,
        layout:     cfg.layout,
      })
    })
  }
}
