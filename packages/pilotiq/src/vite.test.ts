import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generatePages } from './vite.js'

/**
 * Regression test for the Vite plugin's generated Vike stubs. The
 * stubs are emitted at construction time (before Vike scans `pages/`)
 * and they are the integration boundary between RudderJS routing and
 * Vike's file-based router — getting them wrong silently breaks SPA
 * navigation. We assert the file tree + critical content invariants
 * rather than a raw text snapshot so cosmetic edits don't churn the
 * test, but functional regressions (a dropped guard, a missing route
 * dir, a non-null assertion lost on a route param) still fail loudly.
 */

let tmpRoot: string

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pilotiq-vite-test-'))
  generatePages(tmpRoot)
})

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

const outDir = (): string => path.join(tmpRoot, '(pilotiq)')
const read = (p: string): string => fs.readFileSync(path.join(outDir(), p), 'utf8')

describe('generatePages — file tree', () => {
  const expectedRouteDirs = [
    'dashboard',
    'slug',
    'resource-create',
    'resource-edit',
    'resource-view',
    'relation-list',
    'relation-create',
    'relation-view',
    'relation-edit',
    'nested-relation-list',
    'nested-relation-create',
    'nested-relation-view',
    'nested-relation-edit',
    'theme',
  ]

  it('emits the (pilotiq) directory with all expected route dirs', () => {
    assert.ok(fs.existsSync(outDir()), '(pilotiq) directory should be created')
    for (const dir of expectedRouteDirs) {
      assert.ok(
        fs.existsSync(path.join(outDir(), dir)),
        `route directory "${dir}" should exist`,
      )
    }
  })

  it('emits shared files at the (pilotiq) root', () => {
    for (const file of ['+config.ts', '+Head.tsx']) {
      assert.ok(
        fs.existsSync(path.join(outDir(), file)),
        `shared file "${file}" should exist`,
      )
    }
  })

  it('every route dir has +route.ts, +data.ts, and +Page.tsx', () => {
    // resource-create + resource-edit don't get their own +Page.tsx
    // line in the source — they share `formPage`. The file must still
    // be emitted (writeIfChanged is called for each). Same for nested.
    for (const dir of expectedRouteDirs) {
      for (const file of ['+route.ts', '+data.ts', '+Page.tsx']) {
        assert.ok(
          fs.existsSync(path.join(outDir(), dir, file)),
          `${dir}/${file} should exist`,
        )
      }
    }
  })
})

describe('generatePages — route stubs', () => {
  it('+route.ts files declare RouteSync and check the registry on SSR', () => {
    for (const dir of ['dashboard', 'slug', 'resource-create', 'resource-edit', 'theme']) {
      const src = read(`${dir}/+route.ts`)
      assert.match(src, /import type { RouteSync } from 'vike\/types'/, `${dir}: RouteSync import`)
      assert.match(src, /PilotiqRegistry/, `${dir}: registry import`)
      assert.match(src, /export const route: RouteSync/, `${dir}: route export`)
    }
  })

  it('non-theme routes guard the registry lookup behind import.meta.env.SSR', () => {
    // Theme route runs the registry check unconditionally because it
    // also needs to verify the themeEditor flag — exempting it keeps
    // the rest of the assertion strict.
    for (const dir of ['dashboard', 'slug', 'resource-create', 'resource-edit']) {
      const src = read(`${dir}/+route.ts`)
      assert.match(
        src,
        /if \(import\.meta\.env\.SSR && !PilotiqRegistry\.findByPath/,
        `${dir}: SSR-guarded registry check`,
      )
    }
  })

  it('routeParams use non-null assertion on parts[0] (basePath)', () => {
    // Regression guard for f18898f / 229f290 — without the `!`,
    // noUncheckedIndexedAccess flags `string | undefined` in user
    // typecheck and the playground fails to compile.
    for (const dir of ['dashboard', 'slug', 'resource-create', 'resource-edit', 'theme']) {
      const src = read(`${dir}/+route.ts`)
      assert.match(src, /basePath:\s*parts\[0\]!/, `${dir}: parts[0]! basePath`)
    }
  })

  it('slug route rejects the "theme" segment to avoid clobbering the theme editor', () => {
    const src = read('slug/+route.ts')
    assert.match(src, /parts\[1 \+ off\] === 'theme'/)
  })

  it('resource-view yields to create + theme on the same depth', () => {
    const src = read('resource-view/+route.ts')
    assert.match(src, /parts\[2 \+ off\] === 'create'/)
    assert.match(src, /parts\[1 \+ off\] === 'theme'/)
  })

  it('all non-dashboard routes import clusterOffset for cluster-prefix support', () => {
    // dashboard is single-segment — no cluster prefix possible.
    // theme is exactly 2 segments under the panel base — also unprefixed.
    for (const dir of ['slug', 'resource-create', 'resource-edit', 'resource-view', 'relation-list']) {
      const src = read(`${dir}/+route.ts`)
      assert.match(src, /import { clusterOffset, isPanelBase } from '\.\.\/_clusterOffset\.js'/, `${dir}: clusterOffset import`)
    }
  })

  it('every route stub gates on isPanelBase in BOTH passes', () => {
    // The registry gate is SSR-only (the registry is empty in the browser),
    // and Vike route FUNCTIONS outrank route strings — without a universal
    // base-path gate the client tentatively matches ANY url of the same
    // segment count and steals app pages (blank render of e.g.
    // /articles/:slug on SPA nav; caught by pilotiq-demo's blog).
    for (const dir of ['dashboard', 'slug', 'resource-create', 'resource-edit', 'resource-view', 'relation-list', 'theme']) {
      const src = read(`${dir}/+route.ts`)
      assert.match(src, /if \(!isPanelBase\(parts\[0\]\)\) return false/, `${dir}: isPanelBase gate`)
    }
  })
})

describe('generatePages — page stubs', () => {
  it('+Page.tsx renders via SchemaRenderer with passToClient props', () => {
    for (const dir of ['slug', 'resource-create', 'resource-edit', 'resource-view', 'relation-list']) {
      const src = read(`${dir}/+Page.tsx`)
      assert.match(src, /import { SchemaRenderer } from '@pilotiq\/pilotiq\/react'/, `${dir}: SchemaRenderer import`)
      assert.match(src, /usePageContext/, `${dir}: usePageContext import`)
      assert.match(src, /ctx\.data \?\? ctx\.viewProps/, `${dir}: data/viewProps fallback`)
    }
  })

  it('+config.ts forwards viewProps + data to the client', () => {
    const src = read('+config.ts')
    assert.match(src, /passToClient:\s*\['viewProps',\s*'data'\]/)
  })

  it('+data.ts (shared stub) prefers server-set viewProps over running dispatchPageData', () => {
    // The data stub is identical across every route dir — sample one.
    const src = read('slug/+data.ts')
    assert.match(src, /if \(viewProps !== undefined\) return viewProps/)
    assert.match(src, /import { dispatchPageData } from '@pilotiq\/pilotiq'/)
  })
})

describe('generatePages — Head + theme', () => {
  it('+Head.tsx injects the FOUC-prevention script before React hydrates', () => {
    const src = read('+Head.tsx')
    assert.match(src, /pilotiq-theme/, 'localStorage key for theme persistence')
    assert.match(src, /prefers-color-scheme:dark/, 'system-preference fallback')
    assert.match(src, /classList\.add\('dark'\)/, 'dark class application')
  })

  it('theme route checks the themeEditor config flag', () => {
    const src = read('theme/+route.ts')
    assert.match(src, /panel\.getConfig\(\)\.themeEditor/)
  })
})

describe('generatePages — idempotency', () => {
  it('re-running on the same dir does not throw and keeps file contents stable', () => {
    const before = read('dashboard/+route.ts')
    generatePages(tmpRoot)
    const after = read('dashboard/+route.ts')
    assert.equal(before, after)
  })
})
