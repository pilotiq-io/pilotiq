---
"@pilotiq/pilotiq": patch
"@pilotiq/codemirror": patch
"@pilotiq/recharts": patch
"@pilotiq/tiptap": patch
---

Stop emitting JS sourcemaps in the build (`sourceMap` removed from tsconfig.base.json). The previous release excluded `dist/*.js.map` from the tarball but left the trailing `//# sourceMappingURL=` comment in every `.js` file, so Vite dev in consumer apps chased the pointer and logged an ENOENT stack trace per module — louder than the warning it replaced. `declarationMap` stays on (editors silently skip missing `.d.ts.map`; Vite never reads `.d.ts`).
