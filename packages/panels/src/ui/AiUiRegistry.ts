import { createContext, useContext } from 'react'
import type { ComponentType } from 'react'

/**
 * React-side seam for AI UI slots contributed by `@pilotiq-pro/ai`.
 *
 * Free `@pilotiq/panels` ships only the contract: an `AiUi` interface,
 * the `AiUiContext` whose default value is an empty object (no slots),
 * and the `useAiUi()` hook that free pages call to read it.
 *
 * The commercial `@pilotiq-pro/ai` package provides an `<AiUiProvider>`
 * that fills the slot bag with concrete components and hooks
 * (`AiChatPanel`, `AiDropdown`, `useAgentRun`, `useAiChat`, …). Pro's
 * provider is auto-wrapped in `pages/@panel/+Layout.tsx` via a dynamic
 * import — see the Phase 4 plan (`docs/plans/phase-4-ai-extraction.md`
 * D1) for the full rationale.
 *
 * Open-core rationale: keeping the seam here means free pages can
 * render AI affordances *if* pro is installed, and silently skip them
 * *if* it isn't — no "install @pilotiq-pro/ai" crashes at render time.
 *
 * This is the React-side counterpart to:
 *   - `CollabHookContext` in `@pilotiq/lexical` (Phase 5 seam for Yjs)
 *   - `ClientToolRegistry` in `@pilotiq/panels/src/registries`
 *     (runtime-side seam for boot-time client tool registration)
 *
 * **Typing policy:** every slot is optional. Free call sites must use
 * optional chaining (`ui.AiChatPanel && <ui.AiChatPanel … />`). The
 * component/hook prop shapes are intentionally loose at this seam —
 * `ComponentType<any>` and `(...args: any[]) => any` — because the
 * concrete signatures live in pro. Tightening them here would force
 * free to re-declare pro's full type surface, defeating the seam.
 */
export interface AiUi {
  /** Floating chat panel mounted by `AdminLayout`. */
  AiChatPanel?:      ComponentType<any>
  /** Trigger button that opens the chat panel. */
  AiChatTrigger?:    ComponentType<any>
  /** Per-field AI action dropdown rendered beside supported inputs. */
  AiDropdown?:       ComponentType<any>
  /** Progress indicator for in-flight AI actions. */
  AiActionProgress?: ComponentType<any>
  /** Hook used by `FormActions` to run a PanelAgent invocation. */
  useAgentRun?:      (...args: any[]) => any
  /** Hook used by field inputs to obtain the current chat session. */
  useAiChat?:        (...args: any[]) => any
}

/**
 * Default value is an empty slot bag — no pro package installed, no AI.
 * Pro's `<AiUiProvider>` overrides this at the tree root.
 */
export const AiUiContext = createContext<AiUi>({})

/** Read the current AI UI slot bag. Returns `{}` when pro is not wired up. */
export function useAiUi(): AiUi {
  return useContext(AiUiContext)
}
