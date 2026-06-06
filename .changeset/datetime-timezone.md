---
"@pilotiq/pilotiq": patch
---

Fix datetime UTC/local round-trip skew + `DateField.timezone(tz)`. The renderer formatted stored Dates as UTC wall time while the coerce branch parsed the submitted `YYYY-MM-DDTHH:mm` as server-local — saving 09:30 on a UTC+3 server stored 06:30Z and re-rendered shifted. Both sides now share the `dateTimeWire` helpers and default to wall-clock UTC (consistent round-trip); the new Filament-style `timezone('Asia/Jerusalem')` setter displays + parses the picker in an explicit IANA zone while the stored value stays a UTC instant. Naive strings on 422 re-renders pass through without re-parsing; date-only fields are unaffected.
