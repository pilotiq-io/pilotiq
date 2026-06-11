import { useEffect, useMemo, useRef } from 'react'
import { useEditor, EditorContent, type Extension } from '@tiptap/react'
import type { AnyExtension } from '@tiptap/core'
import { Slice } from '@tiptap/pm/model'
import {
  useCollabRoom,
  getCollabExtensions,
  type CollabTextRendererProps,
} from '@pilotiq/pilotiq/react'
import { useCollabSeed, type CollabRoom as FrameworkCollabRoom } from '@rudderjs/sync/react'
import { createPlainTextEditor, plainTextOf, plainTextToDoc } from '../PlainTextEditor.js'
import { AiSuggestionExtension } from '../extensions/AiSuggestionExtension.js'
import { AiInlineDiffExtension } from '../extensions/AiInlineDiffExtension.js'
import { useAiSuggestionBridge } from './useAiSuggestionBridge.js'
import { useAiInlineDiff, useIsAiInlineDiffActive, readAiDiffViewMarker } from './useAiInlineDiff.js'
import { AiSuggestionBanner } from './AiSuggestionBanner.js'

/**
 * Tiptap-backed plain-text editor for pilotiq's `TextField` / `TextareaField`
 * / similar single-line / multi-line text fields when collab is on.
 *
 * Lifts the cursor-bookkeeping burden off the field renderer: y-prosemirror
 * anchors selections to `Yjs.RelativePosition` items, so concurrent and
 * mid-word remote edits translate the local cursor correctly without any
 * heuristic. Replaces the legacy `Y.Text` + `computeDelta` + `preserveCursor`
 * path documented in `docs/plans/text-fields-tiptap-backed-collab.md`.
 *
 * Mount conditions (enforced upstream by `TextLikeInput`):
 *   - A `<RecordCollabRoom>` is mounted up-tree (`useCollabRoom() !== null`).
 *   - A collab extension factory was registered (`getCollabExtensions() !== null`).
 *   - The field hasn't opted out via `.collab(false)`.
 *   - The field is not masked (`.mask(pattern)`).
 *   - The field is top-level (not a Repeater / Builder row leaf).
 *
 * If either the room or the factory disappears at runtime (e.g. the plugin
 * was never installed), we still render an editor — it's just a non-collab
 * plain Tiptap. That's a regression vs `<input>` ergonomically but never
 * crashes; in practice the upstream gate prevents this branch from mounting
 * when collab isn't wired.
 */
export function CollabTextRenderer({
  name,
  fragmentKey,
  multiline,
  defaultValue,
  placeholder,
  disabled,
  onChange,
  onBlur,
  onSubmit,
  className,
  editorAttributes,
}: CollabTextRendererProps): React.ReactElement {
  const room    = useCollabRoom()
  const factory = getCollabExtensions()
  const collabActive = !!(room && factory)

  // Capture the initial non-empty `defaultValue` on mount + keep it stable.
  // The seedFn (below) needs to re-seed the empty fragment with the
  // SSR-loaded value even if the host's `defaultValue` prop has been
  // clobbered to '' by a sync-triggered empty `onChange` round-trip
  // (handleChange → setText('') → setValue('') → ctx.values.title=''  →
  // FormBody re-renders the field with the new empty value). Closing
  // over the live prop in seedFn means seed-on-resync silently fails;
  // the ref preserves the seed source. Once the user types into the
  // editor the seedFn will no longer fire — the fragment won't be
  // empty — so this ref is read-only after the first non-empty seed.
  const initialDefaultValueRef = useRef<string>(defaultValue)
  if (defaultValue && !initialDefaultValueRef.current) {
    initialDefaultValueRef.current = defaultValue
  }

  // Collab-stable identifier — `name` on top-level fields, but the
  // row-id-anchored composite (`items.<rowId>.title`) on Repeater /
  // Builder row leaves so the Y.XmlFragment survives reorders. Routes
  // ONLY into the collab branches (factory + first-load seed); AI
  // suggestion bridge + onChange + hidden FormData input stay on
  // `name` (the positional FormData path) so AI tool calls referencing
  // the field by its FormData name still reach the editor.
  const collabName = fragmentKey ?? name

  // Built once per editor mount. The factory closes over the room's `ydoc`
  // + `provider` and the field name to produce a `Collaboration` (and
  // optional `CollaborationCursor`) extension targeting the field's
  // `Y.XmlFragment`. Re-running on every render would tear down the editor.
  const collabExtensions = useMemo<AnyExtension[]>(() => {
    if (!collabActive || !room || !factory) return []
    return factory({
      ydoc:      room.ydoc,
      provider:  room.provider,
      fieldName: collabName,
      ...(room.user ? { user: room.user } : {}),
    }) as Extension[]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabActive])

  const editor = useEditor(
    {
      // Tiptap v3 SSR guard. With `immediatelyRender: true` (default)
      // `useEditor` touches the DOM during construction; under Vike's
      // `onRenderHtml` that throws "SSR has been detected, please set
      // `immediatelyRender` explicitly to `false` to avoid hydration
      // mismatches." Deferring until the first React effect lets SSR
      // produce an empty shell + hydration mount the live editor.
      //
      // Load-bearing for the AI-attached auto-upgrade path: with rule
      // #2, AI fields render the Tiptap surface during SSR (where
      // `useCollabRoom()` is null but `aiActions.length > 0` flips the
      // host's gate). Without this flag the dev server would crash on
      // the first SSR pass of any record-edit page touching AI fields.
      immediatelyRender: false,
      ...createPlainTextEditor({
        multiline,
        ...(placeholder !== undefined ? { placeholder } : {}),
        editable: !disabled,
        // When Collaboration owns the doc, omit `content` so the editor
        // doesn't race the y-prosemirror sync. The post-`synced` effect below
        // seeds the fragment on first connect when it's still empty. When
        // collab is off, seed from defaultValue directly.
        content: collabActive ? '' : defaultValue,
        // AI suggestions — chip extension (producer-supplied range
        // suggestions) + inline-diff extension (whole-field suggestions:
        // red strikethrough on removed runs, green on inserted, with the
        // `<AiSuggestionBanner>` Accept / Reject below). Both idle until
        // a suggestion arrives via the bridges below. Matches the
        // `TiptapEditor` wiring so the review surface reads identically
        // across RichTextField / MarkdownField / TextField+TextareaField.
        extensions: [...collabExtensions, AiSuggestionExtension, AiInlineDiffExtension],
        onUpdate: (text) => onChange(text),
        ...(onSubmit ? { onSubmit: () => { onSubmit(); return false } } : {}),
        ...(className || editorAttributes
          ? {
              editorAttributes: {
                ...(editorAttributes ?? {}),
                ...(className ? { class: className } : {}),
              },
            }
          : {}),
      }),
    },
    // Re-mount when collab toggles. Other props (multiline, name, etc) are
    // stable per mount under the upstream gate.
    [collabActive],
  )

  // Mirror the editor's editable state with the prop. `useEditor` snapshots
  // `editable` at first call, so we update it imperatively on changes.
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  // Cross-package suggestion bridge — sync the host's
  // `<PendingSuggestionsContext>` queue with the editor's `AiSuggestion`
  // extension. No-op when no provider is mounted (default no-op context).
  //
  // Whole-field suggestions do NOT synthesize a chip range anymore —
  // they render through `useAiInlineDiff` below (same red/green inline
  // diff + banner as `TiptapEditor`), replacing the old green-pill chip
  // that read differently from the rich-text surface. The bridge stays
  // mounted for producer-supplied `meta.editorRange` suggestions (precise
  // anchors worth visualizing in place) and as the `onApplyWholeField`
  // fallback when the diff path can't parse a suggestion.
  const applyWholeField = (value: string): void => {
    if (!editor || editor.isDestroyed) return
    editor.commands.setContent(plainTextToDoc(value, !!multiline))
  }
  useAiSuggestionBridge(editor ?? null, name, {
    onApplyWholeField: applyWholeField,
  })

  // Inline diff for whole-field suggestions — plain-text shape: each
  // line wraps in a `paragraph` node, mirroring `plainTextToDoc`.
  useAiInlineDiff(editor ?? null, name, {
    parseSuggestion: (ed, value) => {
      try {
        const node = ed.schema.nodeFromJSON(plainTextToDoc(value, !!multiline))
        return new Slice(node.content, 0, 0)
      } catch { return null }
    },
    resolveDisplayMode: () => readAiDiffViewMarker(name),
  })
  const isDiffActive = useIsAiInlineDiffActive(editor ?? null)

  // First-load seed when collab is active. Collaboration starts the editor
  // empty regardless of `defaultValue`; once the room's first sync
  // resolves, `useCollabSeed` runs the callback inside `ydoc.transact`.
  // Empty fragment + we have an initial value = first session for this
  // record — push the SSR-rendered default into the editor once.
  //
  // Race caveat: two peers simultaneously mounting against a brand-new
  // record (both seeing `fragment.length === 0`) can both seed and produce
  // duplicated text. Same window as `TiptapEditor`'s rich-text seed path.
  // Acceptable for now; can be tightened later via a deterministic
  // first-writer election or a server-side seed handoff.
  //
  // Subscribe-after-sync mirror: after the seed branch (or no-op when the
  // fragment already has content from a remote peer), replay the editor's
  // current text into `onChange`. The mount-time safety-net effect below
  // fires once when the editor instance materializes, but in the cold-mount
  // case (fresh peer joining a populated doc) y-prosemirror's `ySyncPlugin`
  // view hook may run _forceRerender before the React owner has installed
  // the `update` listener that drives `onUpdate` — leaving the hidden
  // FormData input empty. Mirroring after `room.synced` resolves closes the
  // gap. Idempotent — when `onUpdate` already propagated the value, this is
  // a no-op `setText(sameValue)`. Same shape as the catch-up replay in
  // `@pilotiq-pro/collab`'s `rowArrayBinding.subscribeRows`.
  useCollabSeed(
    editor && collabActive && room ? (room as unknown as FrameworkCollabRoom) : null,
    collabName,
    (_doc, fragment) => {
      const seedValue = initialDefaultValueRef.current
      if (fragment.length === 0 && seedValue && editor) {
        editor.commands.setContent(plainTextToDoc(seedValue, multiline))
      }
      if (editor) onChange(plainTextOf(editor))
    },
  )

  // Bubble the editor's blur event up to the host. Tiptap exposes this via
  // `editor.on('blur', ...)`. The simpler `onBlur` prop on `EditorContent`
  // fires on the DOM node, but selection inside contenteditable can land on
  // child nodes; the Tiptap event is the canonical "editor lost focus".
  useEffect(() => {
    if (!editor) return
    const handler = (): void => onBlur()
    editor.on('blur', handler)
    return () => { editor.off('blur', handler) }
  }, [editor, onBlur])

  // Best-effort getText safety net — onUpdate should fire on every
  // y-prosemirror sync, but if a remote update somehow doesn't trigger
  // `onUpdate`, the wrapper's hidden input goes stale. Re-emit on every
  // editor render tick. No-op when text matches the last emit.
  useEffect(() => {
    if (!editor) return
    onChange(plainTextOf(editor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Banner mounts below the editor exactly like `TiptapEditor`'s — it
  // renders nothing while no suggestion is pending for this field, so
  // the single-line text surface keeps its normal footprint.
  return (
    <>
      <EditorContent editor={editor} />
      <AiSuggestionBanner
        fieldName={name}
        onApplyWholeField={applyWholeField}
        {...(isDiffActive && editor
          ? {
              onAcceptViaEditor: () => editor.commands.acceptAiInlineDiff(),
              onRejectViaEditor: () => editor.commands.rejectAiInlineDiff(),
            }
          : {})}
      />
    </>
  )
}
