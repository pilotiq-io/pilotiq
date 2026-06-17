---
"@pilotiq/media": minor
---

Media persistence: `Media` model + migration + library registry (#213)

Adds the native-engine persistence layer for `@pilotiq/media`:

- A copyable `create_media_table` migration (shipped under the package's `migrations/` dir) — folders and files in one parent-id tree, with `conversions` / `meta` JSON columns plus `width` / `height` / `focalX` / `focalY` image metadata.
- A `Media` model (`@pilotiq/media/server`) binding the generated `media` column types via `Model.for<'media'>()`, with `json` casts on `conversions` / `meta` that round-trip through the native driver. Ships a matching `SchemaRegistry['media']` augmentation so the model is typed without depending on the host's `rudder schema:types` sweep.
- A globalThis-backed library registry (`registerLibrary` / `getLibrary` / `getDefaultLibrary` / `getLibraryNames`) resolving named + default libraries at SSR time.
- `media()` now resolves its config into the registry on `register()`: the top-level fields form the `default` library, and a `libraries` map adds named ones alongside it.
