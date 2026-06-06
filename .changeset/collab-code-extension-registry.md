---
"@pilotiq/pilotiq": minor
---

`registerCollabCodeExtensions(factory)` / `getCollabCodeExtensions()` — CodeMirror sibling of the Tiptap `registerCollabExtensions` registry slot. A collab plugin registers a factory `({ ytext, awareness }) => extensions[]` once at boot; `@pilotiq/codemirror`'s editor reads it at mount to decide local vs collab branch, so the adapter never carries `y-codemirror.next` / `yjs` peers itself.
