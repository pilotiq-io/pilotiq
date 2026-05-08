---
"@pilotiq/pilotiq": minor
---

Add `Action.modalContentFooter([Element…])` — auxiliary Elements rendered between the modal body and the Cancel/Submit footer. Useful for an inline `Alert` summarising the consequence of the action, supplemental `Text` / `Heading`, or a secondary `Action` (e.g. a "Learn more" link) that sits alongside the primary submit. Mirrors `Section.afterHeader([Action…])`'s parallel-slot pattern; resolves through the standard schema walker so inner Action `.visible() / .disabled()` rules evaluate the same way as anywhere else. In sticky-footer mode the slot scrolls with the body; only the action row stays pinned. Closes the carved-off remainder of the Action modal chrome audit gap (every sibling setter in that group already shipped).
