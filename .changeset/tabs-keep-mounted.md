---
"@pilotiq/pilotiq": patch
---

Keep inactive `Tabs` panels mounted (hidden) so form fields inside non-active tabs retain their values and serialize into the submit body — previously every field outside the active tab was silently dropped from the save.
