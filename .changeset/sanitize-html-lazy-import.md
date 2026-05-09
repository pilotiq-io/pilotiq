---
'@pilotiq/pilotiq': patch
---

Lazy-import `sanitize-html` so the client bundle no longer pulls PostCSS and its Node-built-in shims. Eliminates the `browser-external` console warnings (`fs`, `path`, `url`, `source-map-js`) that surfaced on apps using the `Markdown` / `Html` display primes or `TextColumn` rich-display. Sanitization still runs server-side at meta-build time; the wire shape is unchanged.
