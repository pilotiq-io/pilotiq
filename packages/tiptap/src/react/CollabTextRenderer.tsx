import { useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent, type Extension } from '@tiptap/react'
import type { AnyExtension } from '@tiptap/core'
import {
  useCollabRoom,
  getCollabExtensions,
  type CollabTextRendererProps,
} from '@pilotiq/pilotiq/react'
import { createPlainTextEditor, plainTextOf, plainTextToDoc } from '../PlainTextEditor.js'

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

  // Field-name versioning to dodge Yjs's "same name, different constructor"
  // crash. The legacy `@pilotiq-pro/collab` `formCollabBinding` calls
  // `ydoc.getText(name)` for text-shaped fields (allocating a `Y.Text`);
  // our `Collaboration` extension would then call `ydoc.getXmlFragment(name)`
  // on the same key and Yjs throws because one key can't be both types.
  // Prefixing with `_pt:` (plain-text) keeps the XmlFragment on a separate
  // top-level key. Trade-off: any pre-existing `Y.Text(name)` collab state
  // is orphaned (harmless — the record's persisted value still round-trips
  // through pilotiq's form submission path). Cleanup is Phase D's job —
  // once the legacy `Y.Text` allocation is gone we can drop the prefix.
  const fragmentName = `_pt:${name}`

  // Built once per editor mount. The factory closes over the room's `ydoc`
  // + `provider` and the field name to produce a `Collaboration` (and
  // optional `CollaborationCursor`) extension targeting the field's
  // `Y.XmlFragment`. Re-running on every render would tear down the editor.
  const collabExtensions = useMemo<AnyExtension[]>(() => {
    if (!collabActive || !room || !factory) return []
    return factory({
      ydoc:      room.ydoc,
      provider:  room.provider,
      fieldName: fragmentName,
      ...(room.user ? { user: room.user } : {}),
    }) as Extension[]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabActive])

  const editor = useEditor(
    createPlainTextEditor({
      multiline,
      ...(placeholder !== undefined ? { placeholder } : {}),
      editable: !disabled,
      // When Collaboration owns the doc, omit `content` so the editor
      // doesn't race the y-prosemirror sync. The post-`synced` effect below
      // seeds the fragment on first connect when it's still empty. When
      // collab is off, seed from defaultValue directly.
      content: collabActive ? '' : defaultValue,
      extensions: collabExtensions,
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
        const fragment = ydoc.getXmlFragment(fragmentName)
        if (fragment && fragment.length === 0 && defaultValue) {
          editor.commands.setContent(plainTextToDoc(defaultValue, multiline))
        }
        setHasSeeded(true)
      } catch {
        setHasSeeded(true)
      }
    }

    if (provider.synced) {
      trySeed()
      return
    }
    provider.once('synced', trySeed)
    return () => {
      try { provider.off?.('synced', trySeed) } catch { /* ignore */ }
    }
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
