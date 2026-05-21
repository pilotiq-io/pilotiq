import { useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent, type Extension } from '@tiptap/react'
import type { AnyExtension } from '@tiptap/core'
import {
  useCollabRoom,
  getCollabExtensions,
  onProviderSynced,
  type CollabTextRendererProps,
} from '@pilotiq/pilotiq/react'
import { createPlainTextEditor, plainTextOf, plainTextToDoc } from '../PlainTextEditor.js'
import { AiSuggestionExtension } from '../extensions/AiSuggestionExtension.js'
import { useAiSuggestionBridge } from './useAiSuggestionBridge.js'

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
        // AI suggestions — always-on extension that tracks suggested edits as
        // inline strikethrough + Approve/Reject chip widgets. Idle until the
        // host calls `editor.commands.addAiSuggestion(...)` via the bridge below.
        // Matches the `TiptapEditor` wiring so suggestion mode works uniformly
        // across RichTextField / MarkdownField / TextField+TextareaField.
        extensions: [...collabExtensions, AiSuggestionExtension],
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
  // Whole-field fallback: chat-driven suggestions (e.g. `update_form_state`)
  // arrive without `meta.editorRange`. Plain-text editors opt into a
  // synthesized full-doc range so the inline-diff chip (red strikethrough on
  // the current value + green chip with the suggested text + ✓/✕ buttons)
  // renders BEFORE the user approves. The extension's `applyApprove` is
  // text-node-based which fits the plain-text schema exactly. The
  // `onApplyWholeField` callback stays as a fallback for cases that don't
  // synthesize (e.g. an empty doc — `from === to` skips the chip but the
  // applier still needs to swap content).
  useAiSuggestionBridge(editor ?? null, name, {
    synthesizeWholeFieldRange: (ed) => ({
      from: 0,
      to:   ed.state.doc.content.size,
    }),
    onApplyWholeField: (value) => {
      if (!editor || editor.isDestroyed) return
      editor.commands.setContent(plainTextToDoc(value, !!multiline))
    },
  })

  // First-load seed when collab is active. Collaboration starts the editor
  // empty regardless of `defaultValue`; once the provider syncs the room
  // state from the server we check whether the field's `Y.XmlFragment`
  // was ever written. Empty + we have an initial value = first session for
  // this record — push the SSR-rendered default into the editor once.
  //
  // Race caveat: two peers simultaneously mounting against a brand-new
  // record (both seeing `fragment.length === 0`) can both seed and produce
  // duplicated text. Same window as `TiptapEditor`'s rich-text seed path.
  // Acceptable for now; can be tightened later via a deterministic
  // first-writer election or a server-side seed handoff.
  const [hasSeeded, setHasSeeded] = useState(false)
  useEffect(() => {
    if (!editor || !collabActive || !room || hasSeeded) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ydoc     = room.ydoc as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = room.provider as any
    if (!ydoc || !provider) return

    const trySeed = (): void => {
      try {
        const fragment = ydoc.getXmlFragment(collabName)
        if (fragment && fragment.length === 0 && defaultValue) {
          editor.commands.setContent(plainTextToDoc(defaultValue, multiline))
        }
        setHasSeeded(true)
      } catch {
        setHasSeeded(true)
      }
    }

    return onProviderSynced(provider, trySeed)
    // Seed once per editor instance — keyed remount above resets `hasSeeded`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, collabActive, room])

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

  return <EditorContent editor={editor} />
}
