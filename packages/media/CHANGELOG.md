# @pilotiq/media

## 0.2.0

### Minor Changes

- d36f4c7: New package: `@pilotiq/media` (scaffold)

  Introduces the open-source media / file library package. This scaffold ships the workspace package, build/test config, the core runtime-agnostic types (`MediaRecord`, `ConversionInfo`, `MediaConversion`, `MediaConfig`, `categorize()`), the client-safe `@pilotiq/media` barrel and the Node-only `@pilotiq/media/server` subpath seam, and the `media()` plugin factory (wired into a panel via `.plugins([media()])`, inert for now). It declares `@rudderjs/storage` + `@rudderjs/image` (`^1.2.1`) and the `@pilotiq/pilotiq` peer range per the adapter convention.

  Library registry + persistence, the `_media` routes + upload pipeline, the browser UI, and the field follow in subsequent slices.
