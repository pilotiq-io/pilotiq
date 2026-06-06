---
"@pilotiq/pilotiq": minor
---

`DateTimePicker` now renders a shadcn popover calendar with a time input instead of the bare native `datetime-local` input — same `YYYY-MM-DDTHH:mm` wire format, so coercion and model `datetime` casts are unaffected. `DateField.withTime()` is now wired in the renderer (was documented but rendered date-only). Both date pickers pin display formatting to `en-US` (locale-dependent `toLocaleDateString` failed hydration when server and browser locales differ) and register pending-suggestion appliers so AI suggestions update the visible trigger, not just the hidden input.
