import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { Page } from './Page.js'
import { Heading } from './schema/Heading.js'
import { Alert } from './schema/Alert.js'
import { Form } from './elements/Form.js'
import {
  resolveRenderHooks,
  CHROME_HOOK_NAMES,
  type RenderHookContext,
} from './RenderHook.js'
import { panelInfo } from './pageData.js'

class ArticleResource extends Resource {
  static override label = 'Articles'
  static override slug  = 'articles'
  static override form() { return Form.make().schema([]) }
}

class OtherResource extends Resource {
  static override label = 'Other'
  static override slug  = 'other'
  static override form() { return Form.make().schema([]) }
}

class HelpPage extends Page {
  static override slug   = 'help'
  static override label  = 'Help'
  static override schema() { return [] }
}

const baseCtx: RenderHookContext = {
  user:     null,
  basePath: '/admin',
  url:      '/admin',
}

describe('Pilotiq.renderHook()', () => {
  it('appends entries in registration order', () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::topbar.start', () => [Heading.make('A')])
      .renderHook('panels::topbar.start', () => [Heading.make('B')])

    const cfg = panel.getConfig()
    assert.equal(cfg.renderHooks?.length, 2)
    assert.equal(cfg.renderHooks?.[0]?.name, 'panels::topbar.start')
    assert.equal(cfg.renderHooks?.[1]?.name, 'panels::topbar.start')
  })

  it('stores optional scope on the entry', () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::topbar.start', () => [Heading.make('Scoped')], { resource: ArticleResource })

    const cfg = panel.getConfig()
    assert.equal(cfg.renderHooks?.[0]?.scope?.resource, ArticleResource)
  })
})

describe('resolveRenderHooks()', () => {
  it('returns an empty map when no entries match', async () => {
    const panel = Pilotiq.make('admin')
    const out = await resolveRenderHooks(
      panel.getConfig().renderHooks ?? [],
      ['panels::topbar.start'],
      baseCtx,
    )
    assert.deepEqual(out, {})
  })

  it('returns ElementMeta[] keyed by hook name', async () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::topbar.start', () => [Heading.make('Hello')])

    const out = await resolveRenderHooks(
      panel.getConfig().renderHooks!,
      ['panels::topbar.start'],
      baseCtx,
    )

    const slot = out['panels::topbar.start']
    assert.ok(slot, 'slot present')
    assert.equal(slot.length, 1)
    assert.equal(slot[0]?.['type'], 'heading')
  })

  it('concats multiple hooks at the same slot in registration order', async () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::body.start', () => [Heading.make('A')])
      .renderHook('panels::body.start', () => [Heading.make('B')])

    const out = await resolveRenderHooks(
      panel.getConfig().renderHooks!,
      ['panels::body.start'],
      baseCtx,
    )
    const slot = out['panels::body.start']
    assert.equal(slot?.length, 2)
    assert.equal(slot?.[0]?.['content'], 'A')
    assert.equal(slot?.[1]?.['content'], 'B')
  })

  it('drops entries whose function throws (fail closed) and keeps siblings', async () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::body.start', () => { throw new Error('boom') })
      .renderHook('panels::body.start', () => [Heading.make('Survivor')])

    const out = await resolveRenderHooks(
      panel.getConfig().renderHooks!,
      ['panels::body.start'],
      baseCtx,
    )
    assert.equal(out['panels::body.start']?.length, 1)
    assert.equal(out['panels::body.start']?.[0]?.['content'], 'Survivor')
  })

  it('respects scope.resource — fires only when ctx.resource matches', async () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::topbar.start', () => [Heading.make('ArticlesOnly')], { resource: ArticleResource })
      .renderHook('panels::topbar.start', () => [Heading.make('Always')])

    const onArticles = await resolveRenderHooks(
      panel.getConfig().renderHooks!,
      ['panels::topbar.start'],
      { ...baseCtx, resource: ArticleResource },
    )
    assert.equal(onArticles['panels::topbar.start']?.length, 2)

    const onOther = await resolveRenderHooks(
      panel.getConfig().renderHooks!,
      ['panels::topbar.start'],
      { ...baseCtx, resource: OtherResource },
    )
    assert.equal(onOther['panels::topbar.start']?.length, 1)
    assert.equal(onOther['panels::topbar.start']?.[0]?.['content'], 'Always')
  })

  it('respects scope.page', async () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::page.start', () => [Heading.make('HelpOnly')], { page: HelpPage })

    const onHelp = await resolveRenderHooks(
      panel.getConfig().renderHooks!,
      ['panels::page.start'],
      { ...baseCtx, page: HelpPage },
    )
    assert.equal(onHelp['panels::page.start']?.length, 1)

    const offHelp = await resolveRenderHooks(
      panel.getConfig().renderHooks!,
      ['panels::page.start'],
      baseCtx,
    )
    assert.deepEqual(offHelp, {})
  })

  it('passes the resolved user into the hook callback', async () => {
    const calls: unknown[] = []
    const panel = Pilotiq.make('admin')
      .renderHook('panels::topbar.start', (ctx) => {
        calls.push(ctx.user)
        return [Heading.make('seen')]
      })

    await resolveRenderHooks(
      panel.getConfig().renderHooks!,
      ['panels::topbar.start'],
      { ...baseCtx, user: { name: 'Bob' } },
    )
    assert.deepEqual(calls, [{ name: 'Bob' }])
  })

  it('only resolves slots in the requested name list', async () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::topbar.start', () => [Heading.make('top')])
      .renderHook('panels::body.start',   () => [Heading.make('body')])

    const out = await resolveRenderHooks(
      panel.getConfig().renderHooks!,
      ['panels::topbar.start'],
      baseCtx,
    )
    assert.ok(out['panels::topbar.start'])
    assert.equal(out['panels::body.start'], undefined)
  })

  it('CHROME_HOOK_NAMES covers every chrome slot expected by the layouts', () => {
    // Snapshot test — if a layout starts mounting a new slot, this list
    // must extend OR the slot must move into PAGE_HOOK_NAMES.
    assert.ok(CHROME_HOOK_NAMES.includes('panels::body.start'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::body.end'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::topbar.start'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::topbar.end'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::sidebar.start'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::sidebar.nav.start'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::sidebar.nav.end'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::sidebar.footer'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::user-menu.before'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::user-menu.after'))
    assert.ok(CHROME_HOOK_NAMES.includes('panels::footer'))
  })
})

describe('panelInfo() chrome render-hook resolution', () => {
  it('omits panel.renderHooks when no entries match', async () => {
    const panel = Pilotiq.make('admin')
    const info = await panelInfo(panel)
    assert.equal((info as { renderHooks?: unknown }).renderHooks, undefined)
  })

  it('attaches resolved chrome slots to panel.renderHooks', async () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::topbar.start', () => [Alert.make('warn').warning()])

    const info = await panelInfo(panel)
    const hooks = (info as { renderHooks?: Record<string, unknown[]> }).renderHooks
    assert.ok(hooks)
    assert.ok(hooks['panels::topbar.start'])
    assert.equal(hooks['panels::topbar.start']!.length, 1)
  })

  it('skips page-role hooks during chrome resolution', async () => {
    const panel = Pilotiq.make('admin')
      .renderHook('panels::resource.pages.list-records.table.before', () => [Heading.make('list')])
      .renderHook('panels::topbar.start', () => [Heading.make('chrome')])

    const info = await panelInfo(panel)
    const hooks = (info as { renderHooks?: Record<string, unknown[]> }).renderHooks
    assert.ok(hooks)
    assert.ok(hooks['panels::topbar.start'])
    assert.equal(hooks['panels::resource.pages.list-records.table.before'], undefined)
  })

  it('threads route.resource into the hook context for scoping', async () => {
    const seen: Array<{ name: string }> = []
    const panel = Pilotiq.make('admin')
      .renderHook('panels::topbar.start', (ctx) => {
        if (ctx.resource) seen.push({ name: ctx.resource.name })
        return [Heading.make('x')]
      }, { resource: ArticleResource })

    await panelInfo(panel, undefined, { resource: ArticleResource })
    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.name, 'ArticleResource')

    seen.length = 0
    await panelInfo(panel, undefined, { resource: OtherResource })
    assert.equal(seen.length, 0)
  })
})
