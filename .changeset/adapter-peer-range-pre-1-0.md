---
'@pilotiq/codemirror': patch
'@pilotiq/recharts': patch
'@pilotiq/tiptap': patch
---

Widen the `@pilotiq/pilotiq` peer dependency from `workspace:^` (publishes as `^<version>`) to the literal range `>=0.6.0 <1.0.0`.

Under pre-1.0 caret semver, `^0.6.0` does not satisfy `0.7.0`, so every pilotiq minor bump was breaking the adapters' published peer range — which in turn made changesets propose a MAJOR bump on the adapters on every release, even when nothing in them changed. The literal range covers the whole `0.x` track, so the trap no longer fires.
