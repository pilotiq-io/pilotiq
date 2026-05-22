---
'@pilotiq/pilotiq': patch
'@pilotiq/tiptap': patch
'@pilotiq/codemirror': patch
'@pilotiq/recharts': patch
---

chore: slim published tarballs to `dist` + `boost` + `CHANGELOG.md`

All four packages now declare `"files": ["dist", "boost", "CHANGELOG.md"]` so npm pack only ships the compiled output, the `@rudderjs/boost` guidelines + skills tree, and the changelog. Previously `@pilotiq/pilotiq` shipped its full `src/`, `CLAUDE.md`, `.turbo/`, and test files; the three adapters shipped `src/` deliberately but no longer need to.

- **`@pilotiq/pilotiq`** — 2.1 MB → 1.3 MB (~38% smaller). Drops `src/**`, `CLAUDE.md`, `.turbo/` from the tarball.
- **`@pilotiq/tiptap` / `@pilotiq/codemirror` / `@pilotiq/recharts`** — drop `src/**` from the tarball.

No API impact. Consumer Tailwind `@source` rules that previously scanned `node_modules/@pilotiq/*/src` should re-point at `node_modules/@pilotiq/*/dist` (Tailwind scans `.js` just fine). Source maps in `dist/` still reference `../src/*.ts` paths that are no longer in the tarball — sourcemap navigation inside `node_modules` won't resolve to TS, but stack traces still line up.
