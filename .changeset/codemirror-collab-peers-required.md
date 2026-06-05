---
"@pilotiq/codemirror": patch
---

Drop the `optional` peer marking on `y-codemirror.next` / `yjs`. The package's import graph reaches them unconditionally (`CodeMirrorEditor` → `CollabCodeMirrorEditor` → `y-codemirror.next`), so installs without them crashed at first import (`ERR_MODULE_NOT_FOUND` during app boot). Required peers auto-install under pnpm/npm — matching how `@pilotiq/tiptap` already declares `@rudderjs/sync`. A proper lazy/subpath split for the collab editor stays on the roadmap.
