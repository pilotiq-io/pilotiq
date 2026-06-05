---
"@pilotiq/pilotiq": patch
---

Follow-up to the SPA 403 fix: read `x-rudder-original-url` from `req.headers` (the real `AppRequest` shape — a plain lowercased Record; the previous `header()` accessor probe never matched at runtime) and stamp `Content-Type: text/html` on the styled 403 page (it served as text/plain).
