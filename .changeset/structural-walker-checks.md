---
"@pilotiq/pilotiq": patch
---

Fix relationship-backed multi-selects (`SelectField.multiple().relationship()`) showing empty on edit pages: `walkSelectFields` used `instanceof`, which fails under Vite SSR module-cache duplication, so the M2M fill silently found zero fields. Walkers now use structural checks (new `isSelectField` export, mirroring `isRepeaterField`/`isBuilderField`); the live-field probe and editable-column probe in pageData were hardened the same way.
