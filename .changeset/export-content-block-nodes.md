---
"@pilotiq/tiptap": minor
---

Export the default content-block node specs (`contentBlockNodes`, plus `Faq` / `FaqItem` / `FaqQuestion` / `FaqAnswer` / `Alert` / `AlertTitle` / `AlertBody` / `Summary` / `KeyTakeaways` / `ProsCons` / `ProsColumn` / `ConsColumn` / `ContentBlockKeymap` and the `AlertType` helpers) from the package entry. `contentBlockNodes` is the exact array `TiptapEditor` registers, so consumers can build a headless editor whose schema matches the live one — e.g. to parse content-block HTML or drive the surgical-op planners (`planInsertBlockBefore` & co.) in a test — without mounting React. Additive; no behavior change.
