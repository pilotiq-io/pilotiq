# @pilotiq/recharts

## 3.1.3

### Patch Changes

- 0d346bd: Stop emitting JS sourcemaps in the build (`sourceMap` removed from tsconfig.base.json). The previous release excluded `dist/*.js.map` from the tarball but left the trailing `//# sourceMappingURL=` comment in every `.js` file, so Vite dev in consumer apps chased the pointer and logged an ENOENT stack trace per module — louder than the warning it replaced. `declarationMap` stays on (editors silently skip missing `.d.ts.map`; Vite never reads `.d.ts`).

## 3.1.2

### Patch Changes

- 4f5515e: Stop shipping sourcemaps in the published tarballs. The maps referenced `../src/*.ts`, which the slimmed tarballs don't include (and `sourcesContent` isn't embedded), so consumers running Vite dev got a "Sourcemap points to missing source files" warning for every dist module — hundreds of lines per cold start when the package is in `optimizeDeps.exclude`. Maps are still generated for workspace/local development where `src/` exists; they're only excluded from the npm artifact.

## 3.1.1

### Patch Changes

- 3625b85: fix(recharts): X-axis ticks + tooltip never rendered (axes were hidden behind a wrapper component)

  The shared `XAxis` / `YAxis` / `Tooltip` were returned from a custom `MinimalAxes`
  component. Recharts detects axes/tooltip by scanning the chart's **direct** children
  by type, so anything behind a component (or Fragment) boundary is silently ignored —
  the `<Area>` rendered (it's a direct child) but the X-axis date ticks and the hover
  tooltip never did. `minimalAxes()` now returns an **array** of elements spread directly
  into the chart (`{minimalAxes()}`), so recharts sees them.

  Also: line/area charts use `type="monotone"` (was `natural`, which overshoots below the
  baseline on sparse/spiky series and clipped at the bottom), the chart title renders at
  `font-semibold text-foreground` (was muted), the X-axis matches the clean shadcn style
  (no axis/tick lines, `minTickGap`, `preserveStartEnd`), and the plot has edge margins so
  the first/last tick aren't clipped.

- c1432ef: feat(recharts): `Chart.description()` — muted subtitle under the chart title

  Adds a `description` to the chart card header, rendered under the title as a
  muted subtitle (shadcn `CardDescription` style). Set fluently
  (`Chart.make().description('…')`) or as a `static description` on a `Chart`
  subclass; resolves instance-over-static like `label`.

- 7cfa9da: feat(recharts): responsive chart filter — segmented toggle on desktop, select on mobile

  The chart's time-range filter now renders as a segmented toggle (shadcn `ToggleGroup`
  `outline` style — a bordered track with the active window highlighted) at `md` and up,
  and falls back to the existing compact `<select>` below `md` where the toggle would be
  too wide. Both drive the same `onChange`/refetch.

  Consumer note: the adapter ships Tailwind class names (no precompiled CSS), so your
  Tailwind content/`@source` config must include `@pilotiq/recharts` (e.g. the package's
  `dist`) for the chart's utility classes — including the responsive `md:` variants — to
  be generated.

## 3.1.0

### Minor Changes

- e9e7dbb: feat(recharts): theme-palette chart colors + minimal chrome

  The `--chart-1..5` theme variables now drive chart series by default, so the theme editor's "Chart Color" control affects real charts (previously it only styled the static preview mock in `theme-preview/build-html.ts`). Visual defaults: lines render as soft area-fills, bars are rounded, the `CartesianGrid` is dropped in favor of a hairline X baseline, and the tooltip is themed.

## 3.0.3

### Patch Changes

- 1c6a067: feat(adapters): ship `boost/guidelines.md` for `@rudderjs/boost` discovery

  Phase C of the boost-producer rollout. Each adapter now ships its own `boost/guidelines.md` so consumer Rudder apps with `@rudderjs/boost` installed pick them up automatically via `rudder boost:install`. Per-agent config files (`CLAUDE.md` / `.cursorrules` / `AGENTS.md` / etc.) include all installed adapter guidelines in the concatenated body.

  - **`@pilotiq/tiptap`** — RichTextField + Block (custom-block side panel), toolbar customization, mentions (static + async) + merge tags, file attachments, JSON vs HTML storage, server-side rendering via `renderRichTextToHtml`.
  - **`@pilotiq/codemirror`** — CodeEditorField + Code alias, language registry (`registerCodeLanguage` / `codeEditor({ languages })`), theming (auto / light / dark), reactive integration, validation, common language packs.
  - **`@pilotiq/recharts`** — Chart class + fluent form, chart types (line / bar / pie / doughnut), Chart.js-shaped data normalized to Recharts internally, per-chart filter dropdown, polling, resource header/footer placement, escape hatch via `static options`.

  Each guideline closes with a "Common Pitfalls" section distilled from project memory + a "Key Imports" reference. No skills shipped in this phase — adapter usage is single-surface enough that the always-loaded `guidelines.md` covers it; skill modules can follow if a consumer asks.

- 6d2ac13: chore: slim published tarballs to `dist` + `boost` + `CHANGELOG.md`

  All four packages now declare `"files": ["dist", "boost", "CHANGELOG.md"]` so npm pack only ships the compiled output, the `@rudderjs/boost` guidelines + skills tree, and the changelog. Previously `@pilotiq/pilotiq` shipped its full `src/`, `CLAUDE.md`, `.turbo/`, and test files; the three adapters shipped `src/` deliberately but no longer need to.

  - **`@pilotiq/pilotiq`** — 2.1 MB → 1.3 MB (~38% smaller). Drops `src/**`, `CLAUDE.md`, `.turbo/` from the tarball.
  - **`@pilotiq/tiptap` / `@pilotiq/codemirror` / `@pilotiq/recharts`** — drop `src/**` from the tarball.

  No API impact. Consumer Tailwind `@source` rules that previously scanned `node_modules/@pilotiq/*/src` should re-point at `node_modules/@pilotiq/*/dist` (Tailwind scans `.js` just fine). Source maps in `dist/` still reference `../src/*.ts` paths that are no longer in the tarball — sourcemap navigation inside `node_modules` won't resolve to TS, but stack traces still line up.

## 3.0.2

### Patch Changes

- b232826: fix(recharts): hook-order crash in `PieChartView` on empty datasets + widen peer to `^2 || ^3`

  `PieChartView` called `useMemo` after an early `return <ChartEmpty />`, violating Rules-of-Hooks. When a chart's dataset became empty across renders (e.g. a filter narrowed to a no-data range), React threw "Rendered fewer hooks than expected". Hoisted the `useMemo` above the early return — slices fall back to `[]` when the dataset is missing.

  Also widens the `recharts` peer range from `^2` to `^2 || ^3` so consumers can install recharts v3.x (shipped Sep 2024). No source change required for v3; the component API used here is compatible across both majors.

## 3.0.1

### Patch Changes

- b14119e: Widen the `@pilotiq/pilotiq` peer dependency from `workspace:^` (publishes as `^<version>`) to the literal range `>=0.6.0 <1.0.0`.

  Under pre-1.0 caret semver, `^0.6.0` does not satisfy `0.7.0`, so every pilotiq minor bump was breaking the adapters' published peer range — which in turn made changesets propose a MAJOR bump on the adapters on every release, even when nothing in them changed. The literal range covers the whole `0.x` track, so the trap no longer fires.

## 3.0.0

### Patch Changes

- Updated dependencies [3b9d69c]
- Updated dependencies [e7f46a3]
- Updated dependencies [546b7bb]
- Updated dependencies [badb132]
- Updated dependencies [4440ec4]
  - @pilotiq/pilotiq@0.6.0

## 2.0.1

### Patch Changes

- 863505c: Use caret peer dep for `@pilotiq/pilotiq` so adapter packages stay compatible across minor bumps.

## 2.0.0

### Patch Changes

- Updated dependencies [a1c3e40]
  - @pilotiq/pilotiq@0.4.0

## 1.0.0

### Patch Changes

- Updated dependencies [58232be]
- Updated dependencies [58232be]
- Updated dependencies [43428d6]
  - @pilotiq/pilotiq@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [2dedc56]
  - @pilotiq/pilotiq@0.2.0

## 0.1.0

### Patch Changes

- Updated dependencies [8cea72c]
- Updated dependencies [786da6b]
- Updated dependencies [2f4c948]
- Updated dependencies [4bdae5d]
- Updated dependencies [e5cd3f1]
  - @pilotiq/pilotiq@0.1.0
