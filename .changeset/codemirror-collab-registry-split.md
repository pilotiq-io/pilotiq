---
"@pilotiq/codemirror": minor
---

Collab split — the adapter no longer imports `y-codemirror.next` / `yjs` (dropped from peerDependencies entirely; they were required since 3.2.8 as a stopgap for the barrel hard-import). The `yCollab` binding now arrives via pilotiq's new `registerCollabCodeExtensions` registry, mirroring how `@pilotiq/tiptap` receives its `Collaboration` extensions: `@pilotiq-pro/collab` (>= 0.2) registers the factory at boot and `CodeMirrorEditor` reads it at mount — no registered factory means code fields stay on the local branch even inside a collab room. `CollabCodeMirrorEditorProps` gains a required `collabExtensions` factory prop. Requires `@pilotiq/pilotiq` >= 0.33.
