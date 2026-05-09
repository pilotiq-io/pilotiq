---
"@pilotiq/pilotiq": minor
---

Add `TextField.trim(v=true)` — strips leading and trailing whitespace from the submitted value before validation runs. Mirrors Laravel's `TrimStrings` middleware: server-side authority, so a tampered client still gets trimmed values. Composes with `stripCharacters()` (trim runs first, then stripping). Empty strings remain empty; non-string values pass through. Emit-only-when-set on the meta.
