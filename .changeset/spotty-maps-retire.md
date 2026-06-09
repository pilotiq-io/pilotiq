---
"@pilotiq/pilotiq": patch
"@pilotiq/codemirror": patch
"@pilotiq/recharts": patch
"@pilotiq/tiptap": patch
---

Stop shipping sourcemaps in the published tarballs. The maps referenced `../src/*.ts`, which the slimmed tarballs don't include (and `sourcesContent` isn't embedded), so consumers running Vite dev got a "Sourcemap points to missing source files" warning for every dist module — hundreds of lines per cold start when the package is in `optimizeDeps.exclude`. Maps are still generated for workspace/local development where `src/` exists; they're only excluded from the npm artifact.
