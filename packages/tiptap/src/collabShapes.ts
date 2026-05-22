/**
 * Minimal structural shape of `Y.Doc` for tiptap-side seed callbacks.
 *
 * `@pilotiq/pilotiq`'s `useCollabSeed` callback type is `(doc: unknown) => void`
 * by design — core stays free of any runtime dep on Yjs. This adapter
 * also doesn't add `yjs` as a peer or dependency: a consumer running the
 * collab-enabled editor will have Yjs installed transitively via
 * `@pilotiq-pro/collab` (or whichever room provider they wire), but the
 * type system shouldn't pretend that's guaranteed at the adapter boundary.
 *
 * This local interface captures exactly the Y.Doc surface this package
 * calls (`getXmlFragment`). Anything beyond should narrow against a
 * dedicated shape rather than widening this one — `as any` casts were the
 * previous workaround and obscured what we actually depend on.
 */
export interface YDocShape {
  getXmlFragment(name: string): YXmlFragmentShape
}

export interface YXmlFragmentShape {
  length: number
}
