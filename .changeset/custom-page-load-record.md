---
"@pilotiq/pilotiq": patch
---

Custom pages now run `Form.loadRecord` on GET (values pre-fill like global edit pages) and thread the resolved panel user + loaded record onto the `FormContext` for both `loadRecord` and the save lifecycle — fixes profile-style pages rendering empty inputs and saves that couldn't see `ctx.user`.
