---
'@pilotiq/pilotiq': minor
---

feat(core): `@pilotiq/pilotiq/styles/file-upload.css` subpath

`FileUploadField`'s image-cropping UI ships its own stylesheet via the
`react-image-crop` package — a declared dep of `@pilotiq/pilotiq`.
Consumers no longer need to declare `react-image-crop` themselves;
import the new subpath from your app's Tailwind / global stylesheet:

```css
@import "@pilotiq/pilotiq/styles/file-upload.css";
```

The CSS file re-imports `react-image-crop/dist/ReactCrop.css`; the
@import resolves through pilotiq's own `node_modules`, so the consumer
side doesn't need a direct dep declaration. Mirrors the same pattern
as other UI peer deps that pilotiq ships through subpaths.

**Build side:** `pnpm build` now copies `src/styles/*.css` to
`dist/styles/` via a new `copy-assets` script. Watch-mode (`pnpm dev`)
runs the copy once at startup; per-CSS-edit re-copies aren't wired
(unusual in dev — the CSS file is essentially static).
