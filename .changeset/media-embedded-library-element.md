---
"@pilotiq/media": minor
---

`Media` schema element — embed the library browser in any page schema (#217)

The second of the package's two mount modes. Where `media()` mounts the browser at a global `/media` route, the new `Media` element drops the same browser into **any page or resource schema**:

```ts
// Page.schema()
Media.make('Assets')
  .library('photos')     // scope uploads to a named library
  .directory(folderId)   // root the browser at a folder
  .height(640)
  .columnSpan(2)
```

Built on `View`, so it inherits the full server-data pipeline plus layout chrome (`columnSpan()`, `visible()`, `poll()`) and renders through the registered `MediaLibrary` component (`registerWidgetComponents({ MediaLibrary })` — same as the route page). The `_media` API base is resolved from the render context, so the element works in any page location (not just the `/media` slug). The `MediaLibraryPage` route now uses `Media.make('library')` itself, so both mount modes share one path.

`library()` routes uploads to the named library; `directory()` roots the browser at a folder. Filtering the listing by library is a follow-up (the `_media` list is one parent-id tree across libraries).
