# Phase 4 — AI Extraction Plan

Carve `@pilotiq/panels`'s AI runtime out into `@pilotiq-pro/ai` (private, commercial): the `PanelAgent` class + chat handlers + chat tools + built-in AI action catalogue + conversation store + the entire `pages/_components/agents/` UI subtree. Free `@pilotiq/panels` keeps the **interface** side (`PanelAgentInterface`, `BuiltInAiActionRegistry` shape, `PanelAgentMeta` types) so `Field.ai(...)`, `Resource.agents()`, and schema serialization still compile and render without pro installed — the actual chat sidebar, field AI dropdown, and agent runtime all become pro.

**Status:** DRAFT 2026-04-10.

**Packages affected:**
- `@pilotiq/panels` — drops `agents/PanelAgent.ts`, `ai-actions/`, `conversation/`, `handlers/chat/**`, `handlers/agentRun*`, `handlers/agentStream/`, the `pages/_components/agents/**` subtree, 5 AI test files, and the `@rudderjs/ai` runtime import surface. Retains `agents/types.ts`, the `BuiltInAiActionRegistry` shape, `CollabSupportRegistry`-style seams, and the 8 free pages that *call into* AI (as stubs).
- `@pilotiq-pro/ai` — new package containing the real runtime + UI. Ships a `<AiUiProvider>` that injects component implementations into free's `AiUiRegistry` React context, an `AiServiceProvider` that registers built-in actions + mounts chat routes + binds the conversation store, and a `pilotiq-ai-pages` vendor:publish tag for any UI that needs to land in the app's vendored pages tree.

**Depends on:** Phase 3 (the `PanelAgentInterface` + `BuiltInAiActionRegistry` seam) and Phase 5 (the open-core mechanism rehearsal — Phase 4 reuses the same React Context + dynamic auto-wrap pattern).

**Related memory:** `project_pilotiq_rebrand.md`, `project_ai_system_identity.md`, `project_product_identity.md`, `project_ai_loop_parity.md`, `feedback_authoring_streaming_tools.md`, `feedback_mixed_tool_continuation_validation.md`, `feedback_standalone_field_actions_vs_chat.md`, `feedback_validate_agent_inputs.md`, `reference_panels_ai_surfaces.md`.

---

## Goal

After this plan:

1. **`@pilotiq/panels/src/` has zero runtime imports of `@rudderjs/ai`.** The chat handlers, tool impls, conversation store, and agent stream mappings all move to pro. `@rudderjs/ai` drops from `@pilotiq/panels/package.json` dependencies (stays as an optional peer on the pro side only).
2. **`Field.ai(['rewrite'])` without pro installed** throws the existing Phase 3 error ("unknown AI action 'rewrite'. Install `@pilotiq-pro/ai` to enable built-in actions.") with zero changes to call sites.
3. **`Resource.agents()` without pro installed** returns an empty array. Schemas serialize, forms render, but no agent dropdown appears. No runtime crash.
4. **Chat sidebar, field `✦` dropdown, inline AI actions are all invisible** in free mode. The free `pages/_components/fields/TextInput.tsx`, `TextareaInput.tsx`, `RichContentInput.tsx`, `edit/SchemaRenderer.tsx`, `edit/FormActions.tsx`, `SchemaForm.tsx`, `AdminLayout.tsx` continue to compile and render — AI slots render `null`.
5. **With pro installed + `AiServiceProvider` registered + `<AiUiProvider>` mounted**, everything works end-to-end: chat sidebar opens, `✦` dropdown on text fields runs built-in actions, agent streaming works, conversation persistence works, sub-agent dispatch works, client tools (`update_form_state`, `read_form_state`) work. Identical UX to today.
6. **`@pilotiq-pro/ai` is the first real commercial surface.** Customers install it and register it — same 2-step UX as `@pilotiq-pro/collab` (install, add service provider to bootstrap). No manual `<Provider>` wrapping: the panels layout auto-wraps via dynamic import, exactly like Phase 5.

---

## Non-Goals

- **Rewriting the AI runtime.** Move existing code as-is. Bug fixes, refactors, and API improvements are out of scope — the goal is extraction, not improvement. Phase 4 lands in its own atomic commits so any regressions bisect cleanly.
- **`@rudderjs/ai` changes.** The framework-level AI package stays where it is in rudderjs and keeps its current public API. Phase 4 is about moving the *panels-specific* AI glue, not the underlying agent loop.
- **Replacing the standalone-client-tools architecture.** The control-chunk pause + `runStore` + `/continue` dispatch (shipped 2026-04-09 via `subagent-client-tools-plan`) moves intact. Phase 4 is extraction, not redesign. If anything breaks, fix it in-place and capture the root cause in memory.
- **Mixed-tool continuation validator changes.** The fix from 2026-04-08 (distinguishing "required pending client tools" from "allowed server-side tools") moves intact. Same rationale.
- **Conversation schema migration.** The `AiConversation` Prisma table stays in `@pilotiq/panels/schema/panels.prisma` (see D3 below). Pro writes to the free schema's table. This decouples the schema migration question from the code extraction.
- **Localization of pro strings.** `@pilotiq/localization` already has the `pilotiq` namespace pattern from Phase 2. Pro's AI strings get their own namespace (`pilotiq-ai`) in a follow-up — out of scope for Phase 4, which ships with inline strings matching today's behavior.
- **Multi-panel / multi-agent UI overhauls.** Phase 4 moves what's there. "VS Code for content" north star work (`project_product_identity.md`) is a separate track.
- **Phase 5.2 Suggestions system.** Still deferred. Don't touch `project_panels_ai_suggestions_plan_prework.md` territory.

---

## Constraints

1. **React Rules of Hooks must be respected.** Free pages call `useAiChatSafe()`, `useAgentRun(...)`, `useContext(AiUiRegistry)` etc. The stub must call the same hooks in the same order on every render regardless of whether pro is mounted. No conditional hook calls.
2. **No hard import from free → pro.** `@pilotiq/panels` cannot `import` from `@pilotiq-pro/ai` directly — that breaks free installs. All pro → free wiring flows via runtime registration (React Context for UI, `BuiltInAiActionRegistry` for server-side actions, runtime-dispatched router mounting for chat handlers).
3. **Cross-repo dev still works.** `pnpm install && pnpm build && pnpm test` from both `~/Projects/pilotiq` and `~/Projects/pilotiq-pro` must succeed, linked via the existing `pnpm.overrides` recipe.
4. **TypeScript stays strict.** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` all on. No new `as any` shortcuts beyond what already exists (the dynamic import pattern in `agents/PanelAgent.ts`, `handlers/chat/lazyImports.ts`, and Phase 5's `+Layout.tsx` auto-wrap is the precedent).
5. **Test suite stays green.** Before: 620 panels + 21 lexical + 28 workspaces. After Phase 4: ~615 panels (free) + 5 AI tests in `@pilotiq-pro/ai` + 21 lexical + 28 workspaces. Total count is unchanged; the split shifts.
6. **Vendor:publish tag discipline.** Pro publishes `pages/_components/agents/` under the tag `pilotiq-ai-pages` (locked decision #3 in `project_pilotiq_rebrand.md`). Free continues publishing its own pages under `pilotiq-pages`. Apps run both publish commands during install; each tag is idempotent.
7. **No breaking changes to consumer code.** Apps that register `CollabServiceProvider` today (from Phase 5) should be able to register `AiServiceProvider` next to it with zero other changes. `Panel.make('admin').resources([...])` and `Field.ai(['rewrite'])` call sites stay byte-identical.
8. **Preserve the mixed-tool continuation invariants.** The `chat-mixed-tools` + `subagent-runStore` tests move to pro intact; their invariants (see memory `feedback_mixed_tool_continuation_validation.md`) must still hold after extraction.

---

## File inventory

### SRC — moves to `@pilotiq-pro/ai`

| Path | LOC | Notes |
|---|---|---|
| `src/agents/PanelAgent.ts` | ~520 | The concrete class. Consumes `@rudderjs/ai` via dynamic import. |
| `src/ai-actions/builtin.ts` | ~200 | The 8 built-in action definitions (rewrite/expand/shorten/translate/etc.). |
| `src/ai-actions/index.ts` | ~10 | Re-export barrel — moves with the rest. |
| `src/ai-actions/registry.ts` | — | **STAYS IN FREE.** This is the registry shape/seam. Moved by reference in Phase 3. Free's Field.ts reads from it. Pro populates it at boot. |
| `src/conversation/PrismaConversationStore.ts` | ~180 | Implements `ConversationStore` from `@rudderjs/ai`. Reads/writes the `AiConversation` table. |
| `src/handlers/agentRun.ts` | ~220 | Standalone agent endpoint (`POST /panels/.../agent/run`). Consumed by the free `useAgentRun` hook — moves with the hook. |
| `src/handlers/agentStream/index.ts` | ~300 | Maps `@rudderjs/ai` StreamChunk → panels SSE events. |
| `src/handlers/agentStream/runStore.ts` | ~260 | Server-side run state for sub-agent client-tool pauses (shipped 2026-04-09). |
| `src/handlers/chat/index.ts` | ~50 | `mountPanelChat(router, panel, mw)` entry. Moves with everything it mounts. |
| `src/handlers/chat/chatHandler.ts` | ~600 | Main `/chat` POST handler — loop, persistence, continuation validation. |
| `src/handlers/chat/blockCatalog.ts` | ~180 | Builder-field block catalog surfaced to the agent. |
| `src/handlers/chat/continuation.ts` | ~220 | Prefix-check continuation validator (mixed-tool fix). |
| `src/handlers/chat/conversationManager.ts` | ~150 | Conversation ID + title mgmt. |
| `src/handlers/chat/lazyImports.ts` | ~40 | Lazy `@rudderjs/ai` imports (kept, but becomes a direct import since pro hard-depends on `@rudderjs/ai`). |
| `src/handlers/chat/persistence.ts` | ~130 | Persistence glue calling `ConversationStore`. |
| `src/handlers/chat/selectionInstructions.ts` | ~80 | Selection-mode system prompt preamble. |
| `src/handlers/chat/subAgentResume.ts` | ~180 | Sub-agent continuation dispatch (2026-04-09 fix). |
| `src/handlers/chat/types.ts` | ~60 | Chat request/response types. |
| `src/handlers/chat/contexts/GlobalChatContext.ts` | ~60 | Global context builder. |
| `src/handlers/chat/contexts/PageChatContext.ts` | ~70 | Page context builder. |
| `src/handlers/chat/contexts/ResourceChatContext.ts` | ~130 | Resource context builder — has a `PanelAgent` type import to resolve. |
| `src/handlers/chat/contexts/resolveContext.ts` | ~80 | Dispatcher. |
| `src/handlers/chat/contexts/types.ts` | ~50 | Chat context shape. |
| `src/handlers/chat/tools/deleteRecordTool.ts` | ~120 | Server tool with approval flow. |
| `src/handlers/chat/tools/editTextTool.ts` | ~200 | Server tool (headless authoring). |
| `src/handlers/chat/tools/readFormStateTool.ts` | ~100 | Client-tool echo. |
| `src/handlers/chat/tools/runAgentTool.ts` | ~250 | Sub-agent dispatch tool (streaming generator, `.modelOutput()`). |
| `src/handlers/chat/tools/updateFormStateTool.ts` | ~130 | Client tool for form mutations. |

**Total SRC moving:** ~27 files, ~4200 LOC (matches the wc total above).

### SRC — stays in `@pilotiq/panels` with minor edits

| Path | Edit |
|---|---|
| `src/agents/types.ts` | **Keep.** Interface (`PanelAgentInterface`, `PanelAgentMeta`, `PanelAgentFieldType`, `PanelAgentContext`) stays in free. Pro implements. |
| `src/ai-actions/registry.ts` | **Keep.** Registry shape stays in free (so `Field.ai()` can check registrations without pro). |
| `src/schema/Field.ts` | Already interface-only post-Phase-3. No change needed. |
| `src/Resource.ts` | Change `PanelAgent` import from concrete class to `PanelAgentInterface as PanelAgent`. Resource doesn't call `.run()` / `.stream()` — it only serializes. **Audit:** verify the handlers that *do* call `.run()` have moved to pro along with the concrete class. |
| `src/PanelServiceProvider.ts` | Drop imports of `BuiltInAiActionRegistry`, `builtInActions`, `mountPanelChat`, `PrismaConversationStore`. Drop the register-loop (`for (const action of builtInActions)`), drop the `mountPanelChat(...)` call in `boot()`, drop the `PrismaConversationStore` lazy-import. Keep the dynamic `app.instance('ai.conversations', ...)` hook but make it read from a `ConversationStoreRegistry` that pro populates. |
| `src/index.ts` | Drop re-exports of `PanelAgent` (concrete), `PanelAgentContext`, `BuiltInAiActionRegistry`, `builtInActions`. Keep re-exports of interfaces (`PanelAgentInterface`, `PanelAgentMeta`, `PanelAgentFieldType`). Add exports of the new UI registry context (see D1) and `ConversationStoreRegistry`. |

### TESTS — moves to `@pilotiq-pro/ai`

| Path | LOC |
|---|---|
| `src/__tests__/chat-contexts.test.ts` | 99 |
| `src/__tests__/chat-mixed-tools.test.ts` | 217 |
| `src/__tests__/chat-persistence.test.ts` | 132 |
| `src/__tests__/subagent-runStore.test.ts` | 97 |
| `src/__tests__/blockCatalog.test.ts` | 230 |
| **Total** | **775** |

### PAGES — moves to `@pilotiq-pro/ai` (published via `pilotiq-ai-pages` tag)

| Path | LOC | Purpose |
|---|---|---|
| `pages/_components/agents/AiChatContext.tsx` | ~600 | The `<AiChatProvider>` + `useAiChat` / `useAiChatSafe` hooks. |
| `pages/_components/agents/AiChatPanel.tsx` | ~900 | The chat sidebar UI: message list, composer, tool-call renderers, approval gates. |
| `pages/_components/agents/AiDropdown.tsx` | ~380 | The shared `✦` dropdown — selection prompt, built-in actions, fetch. |
| `pages/_components/agents/AiActionProgress.tsx` | ~180 | Inline per-field progress UI during a standalone action run. |
| `pages/_components/agents/agentRunRenderer.tsx` | ~300 | Sub-agent run card renderer (inline, collapsible). |
| `pages/_components/agents/standaloneAgentApiContext.tsx` | ~150 | `PanelAgentApiProvider` context for `useAgentRun`'s API base. |
| `pages/_components/agents/useAgentRun.ts` | ~260 | The hook driving standalone agent runs over SSE. |
| `pages/_components/agents/clientTools.ts` | ~200 | `registerClientTool` + `dispatchClientTool` — the client tool registry. |
| `pages/_components/agents/updateFormStateHandler.ts` | ~140 | Client-side handler for `update_form_state`. |
| `pages/_components/agents/readFieldSelection.ts` | ~80 | Helper to read current field selection for selection-mode prompts. |
| `pages/_components/agents/toolRenderers.ts` | ~100 | Map of tool-name → React renderer for the chat panel. |
| `pages/_components/agents/lexicalRegistry.ts` | ~38 | Lexical-specific tool renderer bridge. |
| **Total** | **~3328** | |

### PAGES — stays in `@pilotiq/panels`, edited to use `AiUiRegistry`

| Path | Edit |
|---|---|
| `pages/@panel/+Layout.tsx` | Replace `import { AiChatProvider } from '.../AiChatContext.js'` with dynamic-import auto-wrap of `@pilotiq-pro/ai`'s `<AiUiProvider>` (same pattern as Phase 5's `CollabProvider`). When pro is absent, render the tree without any chat provider. |
| `pages/_components/AdminLayout.tsx` | Replace `import { AiChatPanel, AiChatTrigger } from '.../agents/AiChatPanel.js'` with `const { AiChatPanel, AiChatTrigger } = useAiUi() ?? {}` from the `AiUiRegistry` context. When pro absent, renders `null` for both slots. |
| `pages/_components/fields/TextInput.tsx` | Replace `useAiChatSafe` + `AiDropdown` imports with `useAiUi()` context reads. Same for `TextareaInput.tsx` and `RichContentInput.tsx`. |
| `pages/_components/edit/SchemaRenderer.tsx` | Replace `AiDropdown` + `PanelAgentApiProvider` imports with context reads. |
| `pages/_components/edit/FormActions.tsx` | Replace `useAgentRun` import with `useAiUi()?.useAgentRun?.(...) ?? { run: noop, status: 'idle', entries: [] }`. |
| `pages/_components/SchemaForm.tsx` | Replace `registerClientTool` import with `useAiUi()?.registerClientTool?.(...)` — but this is called in a non-hook context (at module scope during component render). May need to accept a conditional no-op. |
| `pages/@panel/resources/@resource/@id/edit/+Page.tsx` | Audit — may or may not need changes depending on what it imports from `agents/`. |

**Total pages edited in free:** ~8 files. Small edits each, but the design of `AiUiRegistry` (see D1) determines the ergonomics.

### Other

- `@pilotiq/panels/package.json` — drop `@rudderjs/ai` from `dependencies` (if present) or `peerDependencies`. Keep it nowhere.
- `@pilotiq-pro/ai/package.json` — add `@rudderjs/ai` as a runtime dep (not peer — pro owns the runtime), `@pilotiq/panels` + `@pilotiq/lexical` + `react` + `@rudderjs/core` + `@rudderjs/router` as peers.

---

## Mechanism — the hard decisions

### D1 — How do free React components obtain pro UI implementations?

This is the core design question. Free pages today import concrete React components (`AiDropdown`, `AiChatPanel`, `AiChatTrigger`, `AiActionProgress`), React hooks (`useAiChatSafe`, `useAgentRun`), and module-scope functions (`registerClientTool`). After extraction, the free components must still compile and render, but the concrete implementations live in pro.

#### Option A — `AiUiRegistry` React Context with an `AiUi` slot bag

Free defines a single context holding a bag of optional slots:

```ts
// @pilotiq/panels/src/ui/AiUiRegistry.ts
interface AiUi {
  AiChatPanel?:         ComponentType
  AiChatTrigger?:       ComponentType
  AiDropdown?:          ComponentType<AiDropdownProps>
  AiActionProgress?:    ComponentType<AiActionProgressProps>
  useAgentRun?:         (apiBase: string, slug: string) => UseAgentRunReturn
  useAiChat?:           () => AiChatValue | null
  registerClientTool?:  (name: string, handler: ClientToolHandler) => void
}
const defaultAiUi: AiUi = {}
export const AiUiContext = createContext<AiUi>(defaultAiUi)
export const useAiUi = () => useContext(AiUiContext)
```

Pro's `<AiUiProvider>` populates every slot:
```tsx
<AiUiContext.Provider value={{
  AiChatPanel, AiChatTrigger, AiDropdown, AiActionProgress,
  useAgentRun, useAiChat, registerClientTool,
}}>
  {children}
</AiUiContext.Provider>
```

Free pages consume slots:
```tsx
// AdminLayout.tsx
const { AiChatPanel } = useAiUi()
return <>{AiChatPanel ? <AiChatPanel /> : null}{/* ... */}</>
```

**Pros:**
- Pure React, no rules-of-hooks violation (context value is a bag of stable references for the lifetime of the Provider).
- Same pattern as Phase 5's `CollabHookContext` — proven, discoverable, tears down automatically on unmount.
- One context to wire, one Provider to mount, all slots coherent.
- Pro gets to decide the complete UI surface; adding new slots doesn't require free changes (as long as the default stays empty).
- Type-safe: the `AiUi` interface is the contract; pro must satisfy it.

**Cons:**
- `registerClientTool` is module-scope in today's `SchemaForm.tsx` — it's called during render in a non-hook way. Moving to context access means either calling it inside a `useEffect` (safe but changes timing) or accepting that `SchemaForm` reads the registry once on mount. Workable but needs care.
- A component-bag context looks unusual. Reader unfamiliar with Phase 5 might not immediately understand it.
- `useAiChat` as a hook-in-a-bag is the same trick as `CollabHookContext`. Works, but means every consumer calls `const hook = useAiUi()?.useAiChat; const chat = hook?.() ?? null`. Awkward at call sites.

#### Option B — Separate contexts per slot

One context per component/hook:
```ts
export const AiChatPanelContext = createContext<ComponentType | null>(null)
export const AiDropdownContext  = createContext<ComponentType<AiDropdownProps> | null>(null)
export const UseAgentRunContext = createContext<UseAgentRunFn | null>(null)
// ... 5+ more contexts
```

**Pros:**
- Each consumer only re-renders when its specific slot changes. (In practice, the slots are set once on boot and never change, so this is no perf win.)
- Reader sees a named context per feature — more discoverable.

**Cons:**
- Pro must wrap children in 7+ nested providers. Ugly, error-prone (forgetting one slot silently breaks just that feature).
- Free has to export 7+ context handles. API surface bloat.
- More code for worse ergonomics.

#### Option C — Stub components at the same import paths, overwritten by vendor:publish

Free ships `pages/_components/agents/AiDropdown.tsx` etc. as **no-op stubs** — same file paths, same exported symbols, but rendering `null` or throwing "install `@pilotiq-pro/ai`". Pro publishes its real versions under `pilotiq-ai-pages` tag, which overwrites the stub files in the app's vendored `pages/_components/agents/` dir.

**Pros:**
- Zero changes to free page imports. `TextInput.tsx` keeps `import { AiDropdown } from '../agents/AiDropdown.js'`. The file that gets loaded depends on whether pro was published.
- Matches the Laravel-vendor-publish mental model: apps own their vendored pages, pro packages can ship updates.
- No React Context indirection.

**Cons:**
- **Stubs must live in free `@pilotiq/panels/pages/_components/agents/`.** That means free ships a 12-file stub tree that's entirely scaffolding. Noise in the free source.
- **Vendor:publish only runs on install.** If pro is installed later without re-running vendor:publish, stubs stay in place and the app silently lacks AI. This is a footgun: "I installed pro and nothing happened." Mitigation: auto-run pro's vendor:publish during its service provider boot — possible but ugly.
- **The stub files have to match the pro API exactly.** Every slot added to pro requires a corresponding stub in free. Keeping them in sync is tedious and error-prone across PRs.
- **Tests can't easily exercise pro's real components from pilotiq-pro repo** without also running the publish command in test setup.

#### Option D — Everything moves; free doesn't render chat/AI UI at all

Move `AdminLayout.tsx`, `SchemaForm.tsx`, every field input, `SchemaRenderer.tsx`, etc. into pro too, and have pro ship its own layout that wraps the free resources/forms with AI-capable versions.

**Pros:**
- Clean separation. Free panels has zero AI-adjacent code.
- Pro can diverge its layout freely.

**Cons:**
- **Free panels stop rendering.** Without pro, there's no layout, no field inputs, no form. That's a non-starter — Phase 2's whole point was that free panels is a complete admin/CMS on its own.

#### Option E — HOC wrapping

Pro exports `withAi(AdminLayout)` / `withAi(SchemaForm)` / etc. that wrap free components and inject AI. Apps import from pro instead of free.

**Pros:**
- No runtime indirection; composition at the component level.

**Cons:**
- Apps have to rewrite imports. `import { AdminLayout } from '@pilotiq/panels'` → `import { AdminLayout } from '@pilotiq-pro/ai'`. **Breaking change to the consumer API.**
- Two parallel import trees to maintain; easy to drift.
- The `+Layout.tsx` auto-wrap pattern from Phase 5 (apps don't wrap anything) gets lost.

---

### Recommendation — Option A (`AiUiRegistry` Context with a slot bag)

**Primary: Option A.** Reasons:

1. **Direct analog of Phase 5's `CollabHookContext`.** Phase 5 validated the pattern; Phase 4 reuses it. The mechanism is already on the other side of a smoke test. Bugs in one are bugs in both, which is fine — shared hardening.
2. **One context, one Provider, one auto-wrap point** (`+Layout.tsx` already has the pro auto-wrap infrastructure from Phase 5 — it just needs a second dynamic import for `@pilotiq-pro/ai`'s `AiUiProvider`).
3. **Pro is discoverable.** Reader of `AdminLayout.tsx` sees `useAiUi()` and follows it to the `AiUiContext`, and from there sees the default empty bag. "Where does this come from? A pro package registers it."
4. **Type-safe contract.** The `AiUi` interface in free defines exactly what pro must implement. Additions require a coordinated edit to both sides, which is actually a feature (prevents drift).
5. **Stubs are zero LOC in free.** Just `createContext<AiUi>({})`. No stub files, no 12-file scaffolding tree like Option C.
6. **Hooks-in-a-bag ergonomics** are acceptable. The current `useAiChatSafe()` is already a "maybe-null" hook; the migration is `const chat = useAiChatSafe()` → `const chat = useAiUi().useAiChat?.() ?? null`. Marginal at worst.

**The `SchemaForm.registerClientTool` wrinkle (Option A's one sharp edge):** `registerClientTool` today is called at module scope — e.g. `registerClientTool('update_form_state', handler)` at the top of a file or inside a component body outside any hook. The migration path: move the call inside a `useEffect(() => { registerClientTool?.('update_form_state', handler) }, [registerClientTool])` inside `SchemaForm`. Client tools register on first render after mount, unregister on unmount if pro provides a teardown. This is a timing change (registration is now after mount instead of at module load), so **audit every call site** and verify that no agent run starts before the `useEffect` has fired. If this is a problem, we add an alternative: pro's `AiServiceProvider` registers the tools at boot via a non-React registry, and the React context exposes only the components/hooks.

**Actually — let's split it:** there are two kinds of things in the slot bag: **React components/hooks** (need to be in the React context) and **module-scope registries** (don't need to be — they can live in a classic runtime registry mirroring `CollabSupportRegistry`).

**Refined Option A:** two seams.
- **React-side (`AiUiContext`):** components + hooks that free pages consume during render. `AiChatPanel`, `AiChatTrigger`, `AiDropdown`, `AiActionProgress`, `useAgentRun`, `useAiChat`.
- **Runtime-side (`ClientToolRegistry`):** a classic singleton registry like `BuiltInAiActionRegistry`. Pro's `AiServiceProvider` populates it in `register()`. Free `SchemaForm.tsx` calls `ClientToolRegistry.get(name)` at dispatch time, no React Context needed.

This is cleaner. Keeps React Context for React-ish things, classic registries for boot-time things. And it scales: if Phase 4.5 adds more non-React AI integration points, they slot into `ClientToolRegistry`-style seams without touching React.

**Fallback:** Option C (stub files overwritten by vendor:publish) becomes the backup only if Option A proves ergonomically painful in practice. The migration from A → C is local to each slot and doesn't require reworking the Provider structure.

---

### D2 — `PanelAgent` class export: where does it live?

Phase 3 split `PanelAgentInterface` (free) from the concrete `PanelAgent` class (which was supposed to move to pro but was left in free as a TODO). Phase 4 actually moves the class.

**Question:** when pro is installed, where do apps import `PanelAgent` from?

**Option D2-A — Pro exports `PanelAgent` at `@pilotiq-pro/ai`.** Apps who want to subclass it do `import { PanelAgent } from '@pilotiq-pro/ai'`. Free no longer re-exports the class.

- Pro: `export { PanelAgent } from './PanelAgent.js'`
- Free: drops the re-export from `index.ts`. Keeps `export type { PanelAgentInterface, PanelAgentMeta, PanelAgentFieldType }`.
- Apps: `import { PanelAgent } from '@pilotiq-pro/ai'` (changed from `@pilotiq/panels`)

**Option D2-B — Free re-exports pro's `PanelAgent` via a type-only indirection + runtime dynamic import.** Keeps the import path `@pilotiq/panels` stable for apps.

- Too clever, hard to type correctly, no real benefit — apps installing pro are already installing pro. They can change one import.

**Recommendation: D2-A.** Clean. Clear ownership. Apps that want to subclass `PanelAgent` are opting into pro anyway — importing from pro is honest. Document in `MIGRATING.md`: "post-Phase-4, replace `import { PanelAgent } from '@pilotiq/panels'` with `import { PanelAgent } from '@pilotiq-pro/ai'`."

**Playground impact:** the existing `ArticleResource.ts` slow_search smoke-test scaffold (per memory `reference_playground_smoke_tests.md`) currently imports `PanelAgent` from `@pilotiq/panels`. Phase 4 Step 4.8 updates it to import from `@pilotiq-pro/ai`. The playground already has pro linked (if Phase 5 demo worked).

### D3 — Conversation store: does the Prisma schema move to pro?

Today: `@pilotiq/panels/schema/panels.prisma` defines an `AiConversation` table. `PrismaConversationStore.ts` reads/writes it.

**Option D3-A — Schema stays in free `panels.prisma`.** Pro's `ConversationStore` writes to it. Prisma tables exist unconditionally; pro just doesn't use them if not installed.

**Pros:**
- Zero schema migration work. Apps that ran `prisma migrate dev` before Phase 4 still have the table.
- Pro install is a pure code install — no schema change.
- Simplifies rollback: if Phase 4 is reverted, the table is still there.

**Cons:**
- Free panels "ships" an unused table. Cosmetically weird — "why does free panels have `AiConversation` if AI is pro?"
- Prisma schema has to maintain an `AiConversation` model that free never writes to.

**Option D3-B — Move the `AiConversation` table definition to a new `pilotiq-ai.prisma` fragment, published under tag `pilotiq-ai-schema` by pro.**

**Pros:**
- Clean: free ships only what it uses.
- Pro install adds the table via vendor:publish + `prisma migrate dev`.

**Cons:**
- Migration ceremony for apps: install pro, run vendor:publish, run migrate. Three steps vs one.
- Two prisma fragments in different repos — prisma schema composition isn't natively supported; we'd need a merge step or the app manually concatenates.
- Rollback drops the table (data loss).

**Recommendation: D3-A.** The cosmetic weirdness is small; the operational simplicity is large. Document the rationale in the `AiConversation` model block: "// Defined in free so pro install doesn't require a migration. See phase-4-ai-extraction.md D3."

**Related:** `app.instance('ai.conversations', new PrismaConversationStore())` — this binding moves from free `PanelServiceProvider.boot()` to pro `AiServiceProvider.boot()`. Free introduces a new `ConversationStoreRegistry` (or just uses the existing `app.instance('ai.conversations', ...)` container key) that consumers read. Free doesn't call it; pro populates it.

### D4 — Chat UI pages: one `pilotiq-ai-pages` tag or fine-grained?

Locked in `project_pilotiq_rebrand.md` decision #3: **two tags, two publish commands** (`pilotiq-pages` from free + `pilotiq-ai-pages` from pro). Single-tag-multi-source CLI extension deferred.

Phase 4 honors this. Pro publishes:
```ts
this.publishes({
  from: new URL('../pages/_components/agents', import.meta.url).pathname,
  to:   'pages/(panels)/_components/agents',
  tag:  'pilotiq-ai-pages',
})
```

Apps run after install:
```bash
pnpm rudder vendor:publish --tag=pilotiq-pages --force      # free
pnpm rudder vendor:publish --tag=pilotiq-ai-pages --force   # pro
```

**Open question:** does `AiUiProvider` (the React context provider) ship as a vendored page or as a library export? **Recommendation:** library export from `@pilotiq-pro/ai`. Vendored pages are only the things apps may want to customize — chat UI components. The provider wiring is framework code, not user-customizable. It lives in `src/AiUiProvider.tsx` and the `+Layout.tsx` auto-wrap dynamic-imports it.

### D5 — Chat route mounting: how does `mountPanelChat` run after extraction?

Today: `PanelServiceProvider.boot()` calls `mountPanelChat(router, panel, mw)` synchronously after the router is available.

After Phase 4: `mountPanelChat` lives in `@pilotiq-pro/ai`. Pro's `AiServiceProvider.boot()` should mount chat routes for every registered panel. This requires pro to iterate the `PanelRegistry` after free's panels have booted.

**Boot order constraint:** free's `PanelServiceProvider.boot()` registers panels into `PanelRegistry` and mounts free routes (CRUD, meta, theme). Pro's `AiServiceProvider.boot()` must run **after** free's boot to see the populated registry. This is the standard rudderjs provider ordering — apps register pro after free in their `bootstrap/providers.ts` (same recipe as `CollabServiceProvider` from Phase 5).

```ts
// AiServiceProvider.boot()
async boot(): Promise<void> {
  const { router } = await import('@rudderjs/router')
  const mw = [/* build middleware from app config */]
  for (const panel of PanelRegistry.all()) {
    mountPanelChat(router, panel, mw)
  }
}
```

**Risk:** if pro is registered *before* free, the `PanelRegistry` is empty when pro's `boot()` runs, and chat routes never mount. **Mitigation:** document the ordering in pro's README + throw a warning if `PanelRegistry.all()` is empty at pro boot time.

**Alternative:** pro listens for a `PanelRegistered` lifecycle event from free and mounts chat per-panel on demand. More robust but requires introducing a new lifecycle event in free — scope creep. Defer.

---

## Phase plan

### Phase 4.0 — Bootstrap `@pilotiq-pro/ai` package skeleton

1. `~/Projects/pilotiq-pro/packages/ai/` directory. `package.json` with `@pilotiq-pro/ai`, version `0.0.1`, deps on `yjs`-less runtime: `@rudderjs/ai` as dep, `@pilotiq/panels`, `@pilotiq/lexical`, `@rudderjs/core`, `@rudderjs/router`, `react` as peers.
2. `tsconfig.json`, `tsconfig.build.json` mirroring `@pilotiq-pro/collab`.
3. `src/index.ts` — empty stub.
4. Empty `src/__tests__/` directory.
5. `pnpm install && pnpm build` from `pilotiq-pro` root succeeds.

**Deliverable:** empty package that builds. Commit + push.

### Phase 4.1 — Introduce `AiUiContext` + `ClientToolRegistry` in free

1. New `@pilotiq/panels/src/ui/AiUiRegistry.ts` — defines the `AiUi` interface, `AiUiContext`, `useAiUi()` hook, default empty value.
2. New `@pilotiq/panels/src/registries/ClientToolRegistry.ts` — classic singleton mirroring `CollabSupportRegistry`: `register(name, handler)`, `get(name)`, `all()`, `reset()` (for tests).
3. Export both from `src/index.ts`.
4. Free builds + tests pass. No behavior change yet — the registry is unused.

**Deliverable:** seam infrastructure in free. Pilotiq builds 4/4 clean.

### Phase 4.2 — Migrate free pages to use `useAiUi()` / `ClientToolRegistry`

1. **`pages/@panel/+Layout.tsx`:** drop the static `AiChatProvider` import; add a second dynamic import for `@pilotiq-pro/ai`'s `AiUiProvider` using the same string-concat specifier trick as Phase 5. Layout auto-wraps in *both* `CollabProvider` (from collab) and `AiUiProvider` (from ai) when the respective packages are installed.
2. **`pages/_components/AdminLayout.tsx`:** `const { AiChatPanel, AiChatTrigger } = useAiUi()`. Render conditionally.
3. **`pages/_components/fields/{TextInput,TextareaInput,RichContentInput}.tsx`:** `const { AiDropdown, useAiChat } = useAiUi()`. Render `AiDropdown` only if defined. Replace `useAiChatSafe()` with `useAiChat?.() ?? null`.
4. **`pages/_components/edit/SchemaRenderer.tsx`:** `const { AiDropdown } = useAiUi()`. Move `PanelAgentApiProvider` consumption to pro (pro wraps the tree in its own provider).
5. **`pages/_components/edit/FormActions.tsx`:** `const { useAgentRun } = useAiUi()`. Conditional call. Fall back to `{ status: 'idle', entries: [], run: noop, reset: noop }`.
6. **`pages/_components/SchemaForm.tsx`:** replace `registerClientTool(name, handler)` with `ClientToolRegistry.register(name, handler)` at boot / inside a `useEffect` on mount. Audit all call sites.
7. **`pages/@panel/resources/@resource/@id/edit/+Page.tsx`:** audit and apply matching edits.
8. **Do NOT move the files yet.** `pages/_components/agents/*` stays in free for this phase — the free files just stop being imported. Free builds + tests still pass.

**Deliverable:** free pages no longer have static imports of concrete AI components. Free still has the files, unused. Pilotiq 4/4 builds clean; 620 panels tests pass.

**Smoke test:** run playground in browser. Verify chat panel / AI dropdown stop rendering (expected — `useAiUi()` returns `{}`). Verify the rest of the admin panel works without crashes. Verify no `useAiChatSafe is not defined` or similar errors.

### Phase 4.3 — Move SRC files to `@pilotiq-pro/ai`

1. **Move `src/agents/PanelAgent.ts`:** copy to `pilotiq-pro/packages/ai/src/agents/PanelAgent.ts`. Keep `@pilotiq/panels`'s `src/agents/types.ts` in place. Update pro's imports to reference `@pilotiq/panels` types.
2. **Move `src/ai-actions/builtin.ts` + `src/ai-actions/index.ts`:** copy to `pilotiq-pro/packages/ai/src/ai-actions/`. Update pro's `ai-actions/index.ts` to re-export from the new location. Keep `src/ai-actions/registry.ts` in free (it's the seam).
3. **Move `src/conversation/PrismaConversationStore.ts`:** copy to `pilotiq-pro/packages/ai/src/conversation/PrismaConversationStore.ts`.
4. **Move `src/handlers/chat/` (entire subtree):** copy to `pilotiq-pro/packages/ai/src/handlers/chat/`.
5. **Move `src/handlers/agentRun.ts`:** copy to `pilotiq-pro/packages/ai/src/handlers/agentRun.ts`.
6. **Move `src/handlers/agentStream/`:** copy to `pilotiq-pro/packages/ai/src/handlers/agentStream/`.
7. **Fix import paths** in all moved files: references to `../agents/types.js` become `@pilotiq/panels`, references to `../schema/Field.js` become `@pilotiq/panels`, references to `../registries/*` become `@pilotiq/panels`. Pro imports everything else it needs from `@rudderjs/ai` and `@rudderjs/router` directly.
8. **Delete** the original files from `@pilotiq/panels/src/`. Update `src/handlers/index.ts` to drop the `export { mountPanelChat }` line (or re-export from pro dynamically — no, just drop it).
9. **Pro builds clean.** It's a massive file dump; first build will have many import errors. Fix one file at a time. Commit per-subtree for bisect safety.

**Deliverable:** ~27 src files moved from free to pro. Pro builds clean. Free builds clean (minus the AI surface). Free tests still 615 passing (the 5 AI tests will have broken — move them in 4.4).

### Phase 4.4 — Move tests to `@pilotiq-pro/ai`

1. Move `src/__tests__/chat-contexts.test.ts`, `chat-mixed-tools.test.ts`, `chat-persistence.test.ts`, `subagent-runStore.test.ts`, `blockCatalog.test.ts` to `pilotiq-pro/packages/ai/src/__tests__/`.
2. Fix imports to use `@pilotiq/panels` for interface/type references and `./..` for the pro-internal modules they exercise.
3. Pro tests run green.

**Deliverable:** free tests = 615 passing; pro tests = 5 AI suites passing.

### Phase 4.5 — Move `pages/_components/agents/` subtree to pro + `pilotiq-ai-pages` tag

1. Copy all 12 files from `pilotiq/packages/panels/pages/_components/agents/` into `pilotiq-pro/packages/ai/pages/_components/agents/`.
2. Pro's `src/AiServiceProvider.ts` publishes them:
   ```ts
   this.publishes({
     from: new URL('../pages/_components/agents', import.meta.url).pathname,
     to:   'pages/(panels)/_components/agents',
     tag:  'pilotiq-ai-pages',
   })
   ```
3. Delete the source files from `@pilotiq/panels/pages/_components/agents/`.
4. **Crucial step:** the auto-wrap in `+Layout.tsx` dynamic-imports `@pilotiq-pro/ai`'s `<AiUiProvider>`, which must in turn import the vendored-path components. This is circular-ish: pro's Provider imports from the vendored-pages path. The way Phase 5's `CollabProvider` avoided this is that `useYjsCollabImpl` is a library export from pro, not a vendored page. **For Phase 4, `AiUiProvider` and its wiring live in `pilotiq-pro/packages/ai/src/`, not in the vendored pages.** Vendored pages are only the customizable chat UI components (`AiChatPanel`, `AiDropdown`). Provider lives in pro's library source and imports the pro library-source versions of components, which ARE ALSO the ones the vendored-pages copy mirrors. **This means pro ships two copies of the chat UI:** one in `pilotiq-pro/packages/ai/src/` (the canonical, imported by `AiUiProvider`), and one in `pilotiq-pro/packages/ai/pages/_components/agents/` (the vendored copy apps can customize). They should be identical but maintained — or the vendored copy is just a `export * from '@pilotiq-pro/ai/components/AiChatPanel'` passthrough. **Decision:** start with passthroughs in the vendored copy (`pages/_components/agents/AiChatPanel.tsx` just re-exports from `@pilotiq-pro/ai/src/components/AiChatPanel.tsx`). Apps that want to customize replace the passthrough with their own component.
5. **Alternative:** skip vendoring entirely for Phase 4 — pro's `AiUiProvider` library-imports everything from `pilotiq-pro/packages/ai/src/components/*`, and nothing gets published to apps' `pages/(panels)/_components/agents/` dir. Apps can't customize the chat UI from their own source tree. Vendoring becomes a Phase 4.6 follow-up once the customization need is clear. **Recommendation:** take this simpler path. Skip `pilotiq-ai-pages` tag for now; the locked decision #3 in rebrand memory is honored in spirit (two tags planned), deferred to a later follow-up.

**Deliverable:** pro has the full AI runtime + UI as library exports. Free has zero `pages/_components/agents/*` files.

### Phase 4.6 — Pro's `AiServiceProvider` + `<AiUiProvider>`

1. New `pilotiq-pro/packages/ai/src/AiServiceProvider.ts`:
   ```ts
   import { ServiceProvider } from '@rudderjs/core'
   import { BuiltInAiActionRegistry, ClientToolRegistry, PanelRegistry } from '@pilotiq/panels'
   import { builtInActions } from './ai-actions/builtin.js'
   import { mountPanelChat } from './handlers/chat/index.js'
   import { PrismaConversationStore } from './conversation/PrismaConversationStore.js'
   import { updateFormStateHandler } from './components/updateFormStateHandler.js'
   import { readFormStateHandler } from './components/readFormStateHandler.js'

   export class AiServiceProvider extends ServiceProvider {
     register(): void {
       // Seed the AI action catalogue — Phase 3 seam
       for (const action of builtInActions) {
         BuiltInAiActionRegistry.register(action)
       }
       // Client tools used by updateFormStateTool / readFormStateTool at dispatch time
       ClientToolRegistry.register('update_form_state', updateFormStateHandler)
       ClientToolRegistry.register('read_form_state',  readFormStateHandler)
     }

     async boot(): Promise<void> {
       // Conversation store (Prisma) — bind if app has prisma
       try {
         if (this.app.make('prisma')) {
           this.app.instance('ai.conversations', new PrismaConversationStore())
         }
       } catch { /* no prisma */ }

       // Mount chat routes for every registered panel
       const { router } = await import('@rudderjs/router')
       const mw = /* build from app config */
       for (const panel of PanelRegistry.all()) {
         mountPanelChat(router, panel, mw)
       }
     }
   }
   ```
2. New `pilotiq-pro/packages/ai/src/AiUiProvider.tsx`:
   ```tsx
   import { AiUiContext } from '@pilotiq/panels'
   import { AiChatPanel, AiChatTrigger } from './components/AiChatPanel.js'
   import { AiDropdown } from './components/AiDropdown.js'
   import { AiActionProgress } from './components/AiActionProgress.js'
   import { useAgentRun } from './hooks/useAgentRun.js'
   import { useAiChat, AiChatContextProvider } from './contexts/AiChatContext.js'

   export function AiUiProvider({ children }) {
     return (
       <AiChatContextProvider>
         <AiUiContext.Provider value={{
           AiChatPanel, AiChatTrigger, AiDropdown, AiActionProgress,
           useAgentRun, useAiChat,
         }}>
           {children}
         </AiUiContext.Provider>
       </AiChatContextProvider>
     )
   }
   ```
   Note the nested providers: pro's `AiChatContextProvider` owns the chat state (message list, streaming state, composer value); the `AiUiContext.Provider` is the registry seam that exposes hooks/components to free.
3. Pro `src/index.ts` exports `PanelAgent`, `AiServiceProvider`, `AiUiProvider`.
4. Pro builds + tests pass.

**Deliverable:** pro is now a real package with a Provider, a service provider, the agent class, the runtime, and the UI. Installation is: `pnpm add @pilotiq-pro/ai` + register `AiServiceProvider` in `bootstrap/providers.ts`. Nothing else.

### Phase 4.7 — Free `PanelServiceProvider` cleanup

1. Drop the `for (const action of builtInActions) { BuiltInAiActionRegistry.register(action) }` loop in `register()`.
2. Drop the `mountPanelChat(router, panel, mw)` call in `boot()`.
3. Drop the `PrismaConversationStore` lazy-import in `boot()`. Replace with a comment: "conversation store binding moved to @pilotiq-pro/ai's AiServiceProvider.boot()".
4. Drop the import of `BuiltInAiActionRegistry`, `builtInActions`, `mountPanelChat` from the file. Keep `BuiltInAiActionRegistry` export in free's `index.ts` (it's still the seam).
5. Drop `@rudderjs/ai` from `@pilotiq/panels/package.json` (if present).
6. Free builds clean; tests pass (615 free tests after AI tests moved in 4.4).

**Deliverable:** free `PanelServiceProvider` has zero AI runtime wiring. All wiring flows through pro's `AiServiceProvider`.

### Phase 4.8 — Playground smoke test

Mirror of Phase 5.8. From `~/Projects/rudderjs/playground`:

1. `pnpm build` root. Verify no regressions.
2. Without pro linked: verify `/admin` renders, resources list, forms render, NO chat panel visible, NO `✦` dropdown on text fields, NO crash. Verify `Field.ai(['rewrite'])` schema build throws the helpful Phase 3 error.
3. Link `@pilotiq-pro/ai`: add to `playground/package.json` as `link:../../pilotiq-pro/packages/ai`, `pnpm install`, register `AiServiceProvider` in `bootstrap/providers.ts`.
4. Re-run `pnpm dev`. Verify chat sidebar opens, `✦` dropdown on text fields works, built-in actions run, streaming works, conversation persists across reloads, sub-agent dispatch works (slow_search scaffold).
5. Verify `Field.ai(['rewrite'])` now succeeds at schema build time.

**Deliverable:** end-to-end verification of both code paths. Phase 4 is complete when the smoke test passes.

### Phase 4.9 — Docs + commit

1. Update `pilotiq/docs/packages/panels.md` to document the `AiUiContext` + `ClientToolRegistry` seams and point to `@pilotiq-pro/ai` for the real runtime.
2. Update `pilotiq-pro/README.md` to mark `@pilotiq-pro/ai` as **shipped**. Add cross-repo dev section for `@pilotiq-pro/ai` (mirror of the Phase 5 collab section).
3. New `pilotiq-pro/packages/ai/README.md` — installation, service provider registration, subclassing `PanelAgent`, client tool authoring.
4. Commit atomically across three repos:
   - `pilotiq` — Phase 4: extract AI runtime and UI to @pilotiq-pro/ai
   - `pilotiq-pro` — Phase 4: ship @pilotiq-pro/ai — PanelAgent, chat, built-in actions
   - `rudderjs` — playground: register AiServiceProvider + link pilotiq-pro/ai
5. Update memory: `project_pilotiq_rebrand.md` marks Phase 4 DONE. Add implementation notes (`AiUiContext` shape, `ClientToolRegistry` pattern, boot-order warning).

---

## Risks

### R1 — Deep coupling in free pages (8+ files touch AI today)

Phase 5 had one file to rewrite (`useYjsCollab.ts`). Phase 4 has 8 free pages importing concrete AI components. Any missed call site breaks the build or silently loses functionality.

**Mitigation:** Phase 4.2 (migrate free pages to `useAiUi`) runs **before** 4.3 (move src files). Migrating pages first catches missing call sites as type errors — "Cannot find name 'AiDropdown'" at the specific locations. Grep for each symbol being migrated and verify every hit is addressed. Dump a list of all grep results into the commit message for the migration step.

### R2 — `SchemaForm.registerClientTool` timing change

Today: `registerClientTool('update_form_state', handler)` runs at module scope. After 4.2: runs inside a `useEffect` on first mount. Any chat interaction that races the registration window will fail "client tool not found".

**Mitigation:** `ClientToolRegistry.register()` runs in pro's `AiServiceProvider.register()` at app boot — **before any component mounts**. That's strictly earlier than today's module-scope registration. The timing is actually better. Verify via a test that registers a tool and immediately dispatches it.

### R3 — Boot-order dependency (pro after free)

Pro's `AiServiceProvider.boot()` iterates `PanelRegistry.all()`. If pro boots before free's `PanelServiceProvider.boot()` populates the registry, chat routes never mount.

**Mitigation:**
- Document the ordering in pro README and bootstrap-provider example.
- Add a runtime check in `AiServiceProvider.boot()`: if `PanelRegistry.all().length === 0`, log a warning like "@pilotiq-pro/ai booted before any panels were registered. Make sure AiServiceProvider is listed AFTER @pilotiq/panels's providers in your bootstrap/providers.ts."
- Consider: pro provider declares a dependency on `PanelServiceProvider` via rudderjs's provider dependency mechanism, if it has one. Research needed.

### R4 — `@rudderjs/ai` type leakage

Free `@pilotiq/panels` currently type-imports `AiMessage`, `AnyTool`, `ConversationStoreMeta`, etc. from `@rudderjs/ai` in its `handlers/chat/contexts/*.ts` files. After 4.3, those files move to pro. But what about `src/agents/types.ts` and `src/registries/*` — do they reference `@rudderjs/ai` types?

**Mitigation:** Audit before 4.3. `grep -rn '@rudderjs/ai' src/` on the keep-files. If any stay-files reference `@rudderjs/ai`, either:
- Narrow the usage to a minimal type fragment and duplicate in free
- Move the file to pro instead of keeping it in free
- Accept `@rudderjs/ai` as a free type-only peer dep

Current grep (run during audit) shows only the handlers/chat/* and conversation files use `@rudderjs/ai` — all of which move to pro. Free should be clean.

### R5 — Mixed-tool continuation invariants regress during extraction

The 2026-04-08 fix (`feedback_mixed_tool_continuation_validation.md`) distinguishes "required" from "allowed" tools in the continuation validator. Moving `continuation.ts` + `chatHandler.ts` + `chat-mixed-tools.test.ts` together atomically should preserve this, but a half-moved state could introduce a 400 on mixed-tool turns.

**Mitigation:** Phase 4.3 moves `handlers/chat/**` as one unit in one commit. `chat-mixed-tools.test.ts` moves in Phase 4.4 immediately after and must pass on the pro side before commit.

### R6 — Sub-agent client-tool dispatch (runStore) timing

The 2026-04-09 fix (`bug_subagent_client_tools.md`) added a server-side `runStore` + control-chunk pause + chat `/continue` dispatch for sub-agent client tools. The `runStore` lives in `handlers/agentStream/runStore.ts` and is co-owned by the chat handler and the sub-agent dispatch. Moving both to pro atomically is required.

**Mitigation:** Phase 4.3 moves `handlers/agentStream/` and `handlers/chat/**` in the same commit. `subagent-runStore.test.ts` moves in Phase 4.4 and must pass before commit.

### R7 — `ArticleResource.ts` slow_search smoke-test scaffold imports break

Per memory `reference_playground_smoke_tests.md`, the playground's `ArticleResource.ts` instantiates a `slow-search-test` PanelAgent directly. After Phase 4, this import needs to come from `@pilotiq-pro/ai`.

**Mitigation:** Phase 4.8 includes updating the playground's imports. Capture in the checklist. Also: per the user's proposed Phase 6 (playground extraction), these smoke scaffolds will eventually move to `pilotiq-pro/playground`. Phase 4 updates the import paths in-place; Phase 6 moves the files later.

### R8 — Circular dep between pro AiUiProvider and vendored pages

See Phase 4.5 discussion. Ducked by deferring vendoring. If a future phase re-enables vendoring, this risk re-emerges.

**Mitigation:** Phase 4.5 skips `pilotiq-ai-pages` tag. Library exports only. Revisit in a follow-up.

### R9 — Pro package is huge (50+ files, ~7500 LOC)

Not a technical risk but a reviewability concern. The initial pro commit will be hard to review.

**Mitigation:** split Phase 4.3 into per-subtree commits — one commit per `{agents, ai-actions, conversation, handlers/chat, handlers/agentRun + agentStream, pages/_components/agents}`. Six smaller commits, each individually bisectable. Merge via a PR with a generous description. Accept that the review is long; there's no way around it for an extraction of this size.

---

## Open Questions

### O1 — Should `ClientToolRegistry` be module-scope or per-app instance?

Pro registers via `AiServiceProvider.register()`. If multiple apps (e.g. in a test harness) boot in the same process, a module-scope singleton leaks state between them.

**Recommendation:** module-scope with `reset()` for tests. Multi-app-in-one-process is a test-only scenario; existing registries in free (`BuiltInAiActionRegistry`, `CollabSupportRegistry`, `PanelRegistry`) are all module-scope. Consistency wins.

### O2 — Does pro need a TypeScript `AiUi` type surface exported for app authors who want custom providers?

If an app wants to provide its own chat UI (replace `AiChatPanel` with a custom component), they need the `AiUi` interface to type-check. Currently free exports it via `AiUiContext`.

**Recommendation:** export `type { AiUi } from '@pilotiq/panels'`. Apps that bring their own UI extend the default by providing a custom Provider. Document in `pilotiq-pro/packages/ai/README.md` as the "bring your own chat UI" recipe.

### O3 — What about `@pilotiq-pro/ai` tests that need Prisma?

`chat-persistence.test.ts` probably uses a mock `ConversationStore`, not real Prisma. `PrismaConversationStore` itself has no unit tests today (per audit, no `prisma-conversation-store.test.ts` file exists). After Phase 4, pro tests run against mocks, not real Prisma. Fine.

**Recommendation:** keep the mock-based test strategy. If real Prisma integration tests are needed, defer to the playground smoke test or a pilotiq-pro/playground in Phase 6.

### O4 — Does `Field.ai(['rewrite'])` error message get updated in free to point at pro?

Today (Phase 3): "Unknown AI action 'rewrite'. Install `@pilotiq-pro/ai` to enable built-in actions."

This message is already correct for Phase 4. **No change needed.** Verify the message still renders after Phase 4.7.

### O5 — When does `@rudderjs/ai` drop from `@pilotiq/panels/package.json`?

If `@pilotiq/panels` still has `@rudderjs/ai` as a dep after Phase 4, the extraction isn't really done. `grep @rudderjs/ai package.json` should return empty on the free side.

**Recommendation:** verify in Phase 4.7 cleanup. Drop the dep. Free should only depend on `@rudderjs/core`, `@rudderjs/router`, `@rudderjs/support`, `@pilotiq/lexical` (via peer), and UI libs.

### O6 — Should `AiUiProvider` be auto-wrapped in `+Layout.tsx` the same way `CollabProvider` is?

**Yes, same pattern.** The current `+Layout.tsx` has one dynamic import for `@pilotiq-pro/collab`; Phase 4 adds a parallel one for `@pilotiq-pro/ai`. Both auto-wrap independently. Apps install whichever pros they want; everything just works.

Consider a small refactor: a shared `useDynamicProProvider(pkgName)` helper that both collab and ai use. Or leave them as two explicit blocks for clarity. **Recommendation:** leave explicit for Phase 4. Helper extraction is a future polish task.

### O7 — Should the `+Layout.tsx` auto-wrap nesting order matter?

Collab provider inside AI provider? Or AI provider inside collab provider? If the AI provider reads collab state (e.g. "user X is editing field Y" for presence-aware AI prompts), nesting matters. Today: no such coupling.

**Recommendation:** CollabProvider OUTSIDE AiUiProvider. If AI ever wants to read collab state, it can `useContext(CollabHookContext)` through the Collab wrapper. The reverse is unlikely. Document the order.

---

## File-level extraction map

| From (free) | To (pro) | Action | Phase |
|---|---|---|---|
| `src/agents/PanelAgent.ts` | `src/agents/PanelAgent.ts` | move | 4.3 |
| `src/agents/types.ts` | **stays** | edit (no change expected) | 4.2 |
| `src/ai-actions/builtin.ts` | `src/ai-actions/builtin.ts` | move | 4.3 |
| `src/ai-actions/index.ts` | `src/ai-actions/index.ts` | move (new barrel) | 4.3 |
| `src/ai-actions/registry.ts` | **stays** | no change — the seam | — |
| `src/conversation/PrismaConversationStore.ts` | `src/conversation/PrismaConversationStore.ts` | move | 4.3 |
| `src/handlers/chat/**` (18 files) | `src/handlers/chat/**` | move as unit | 4.3 |
| `src/handlers/agentRun.ts` | `src/handlers/agentRun.ts` | move | 4.3 |
| `src/handlers/agentStream/index.ts` | `src/handlers/agentStream/index.ts` | move | 4.3 |
| `src/handlers/agentStream/runStore.ts` | `src/handlers/agentStream/runStore.ts` | move | 4.3 |
| `src/handlers/index.ts` | **stays** | drop `mountPanelChat` re-export | 4.3 |
| `src/__tests__/chat-*.test.ts` (3) | `src/__tests__/chat-*.test.ts` | move | 4.4 |
| `src/__tests__/subagent-runStore.test.ts` | `src/__tests__/subagent-runStore.test.ts` | move | 4.4 |
| `src/__tests__/blockCatalog.test.ts` | `src/__tests__/blockCatalog.test.ts` | move | 4.4 |
| `src/PanelServiceProvider.ts` | **stays** | drop AI wiring (Phase 4.7) | 4.7 |
| `src/Resource.ts` | **stays** | switch to `PanelAgentInterface` (if not already) | 4.2 |
| `src/index.ts` | **stays** | drop `PanelAgent` class export; add `AiUiContext`, `ClientToolRegistry` | 4.1 + 4.3 |
| `src/schema/Field.ts` | **stays** | no change (Phase 3 already done) | — |
| `src/ui/AiUiRegistry.ts` | **NEW in free** | create | 4.1 |
| `src/registries/ClientToolRegistry.ts` | **NEW in free** | create | 4.1 |
| `pages/_components/agents/*` (12 files) | `pages/_components/agents/*` OR `src/components/*` | move | 4.5 |
| `pages/@panel/+Layout.tsx` | **stays** | add 2nd auto-wrap for AiUiProvider | 4.2 |
| `pages/_components/AdminLayout.tsx` | **stays** | `useAiUi()` slots | 4.2 |
| `pages/_components/fields/TextInput.tsx` | **stays** | `useAiUi()` slots | 4.2 |
| `pages/_components/fields/TextareaInput.tsx` | **stays** | `useAiUi()` slots | 4.2 |
| `pages/_components/fields/RichContentInput.tsx` | **stays** | `useAiUi()` slots | 4.2 |
| `pages/_components/edit/FormActions.tsx` | **stays** | `useAiUi()?.useAgentRun` | 4.2 |
| `pages/_components/edit/SchemaRenderer.tsx` | **stays** | `useAiUi()` slots | 4.2 |
| `pages/_components/SchemaForm.tsx` | **stays** | `ClientToolRegistry.register` in useEffect | 4.2 |
| `packages/panels/package.json` | **stays** | drop `@rudderjs/ai` | 4.7 |
| `pilotiq-pro/packages/ai/package.json` | **NEW** | create with deps + peers | 4.0 |
| `pilotiq-pro/packages/ai/src/AiServiceProvider.ts` | **NEW** | create | 4.6 |
| `pilotiq-pro/packages/ai/src/AiUiProvider.tsx` | **NEW** | create | 4.6 |
| `pilotiq-pro/packages/ai/src/index.ts` | **NEW** | export `PanelAgent`, `AiServiceProvider`, `AiUiProvider` | 4.6 |

**Rough count:** ~27 src + 5 test + 12 pages = **44 files moved**. 8 free pages + 6 free src files **edited**. 5–10 new files **created** in pro. 

---

## Verification checklist

Before declaring Phase 4 done:

- [ ] `pnpm build && pnpm test` from `~/Projects/pilotiq` → 4/4 packages, ~615 panels + 21 lexical + 28 workspaces tests pass
- [ ] `pnpm build && pnpm test` from `~/Projects/pilotiq-pro` → 2 packages (`@pilotiq-pro/collab` + `@pilotiq-pro/ai`), ~5 AI tests pass
- [ ] `pnpm build` from `~/Projects/rudderjs` → 47/47 packages including playground
- [ ] `grep -rn '@rudderjs/ai' ~/Projects/pilotiq/packages/panels/src/` returns only comments/doc-references, no runtime imports
- [ ] `grep -rn 'agents/PanelAgent\|ai-actions/builtin\|handlers/chat\|handlers/agentRun\|handlers/agentStream\|conversation/PrismaConversationStore' ~/Projects/pilotiq/packages/panels/src/` returns empty (all moved)
- [ ] `grep -rn '@pilotiq/panels/pages/_components/agents' ~/Projects/pilotiq/packages/panels/` returns empty (all moved)
- [ ] Playground smoke test (Phase 4.8) — local-only mode (no pro) renders without AI; with-pro mode restores full chat + dropdown + sub-agent behavior
- [ ] `Field.ai(['rewrite'])` without pro throws "Install `@pilotiq-pro/ai`" error
- [ ] `Field.ai(['rewrite'])` with pro registered succeeds
- [ ] Chat streaming works (visual: messages stream in, not all-at-once)
- [ ] Sub-agent dispatch (slow_search scaffold) works end-to-end
- [ ] Mixed-tool continuation turns don't throw 400 (regression guard from 2026-04-08 fix)
- [ ] Update `feedback_panels_dist_rebuild.md` if any new dist-rebuild quirks surface
- [ ] `MEMORY.md` index updated with new entries for `@pilotiq-pro/ai` architecture
- [ ] `project_pilotiq_rebrand.md` Phase 4 section added with commit hashes + implementation notes

---

## What this plan does NOT change

- `Panel.make('admin').resources(...)` call sites — unchanged
- `Resource.make('Article').agents(...)` call sites — unchanged (the agents arg now takes pro-owned `PanelAgent` subclasses, but the signature is the same)
- `Field.ai(['rewrite'])` call signature — unchanged
- `BuiltInAiActionRegistry` public shape — unchanged (pro populates it, free reads via `Field.ai()`)
- `PanelAgentInterface`, `PanelAgentMeta`, `PanelAgentFieldType` type contracts — unchanged
- `CollabSupportRegistry` / Phase 5 collab mechanism — untouched
- Lexical / CollaborativePlainText components — untouched
- Media library, workspaces, cli, ORM, router, core — untouched

---

## Estimated effort

| Phase | Estimated LOC change | Notes |
|---|---|---|
| 4.0 — pro package skeleton | ~120 LOC config | Mirrors collab Phase 5.0 |
| 4.1 — seams in free (AiUiContext + ClientToolRegistry) | ~80 LOC | Two new files |
| 4.2 — migrate free pages to `useAiUi()` | ~200 LOC edits across 8 files | Small edit per file; grep-driven |
| 4.3 — move src to pro (6 sub-commits) | ~4200 LOC moved + import rewrites | The big move |
| 4.4 — move tests | ~775 LOC moved + import rewrites | |
| 4.5 — move pages subtree | ~3328 LOC moved + import rewrites | Vendoring deferred |
| 4.6 — pro `AiServiceProvider` + `AiUiProvider` | ~200 LOC new | Two small files |
| 4.7 — free `PanelServiceProvider` cleanup | ~30 LOC net deletion | |
| 4.8 — playground smoke test | 0 LOC + playground provider edit | Manual verification |
| 4.9 — docs + commit | ~200 LOC across 4 docs | |

**Total:** ~9000 LOC moved + ~700 LOC edited + ~600 LOC new. **4–5 focused sessions**, not a single sitting. Each sub-phase should be its own commit for bisect safety.

---

## Sequencing relative to Phase 6 (playground extraction)

Phase 6 (move playground out of rudderjs into pilotiq + pilotiq-pro) was user-proposed 2026-04-10. Phase 4 sits before Phase 6 by user preference.

**Implication for Phase 4:** the playground smoke test (4.8) runs against `~/Projects/rudderjs/playground` as it exists today. Post-Phase-6, the smoke test location moves to `~/Projects/pilotiq-pro/playground` — but that's Phase 6's problem. Phase 4 doesn't need to pre-adapt.

**Implication for Phase 6:** the slow_search and related AI smoke scaffolds currently in `rudderjs/playground/app/.../ArticleResource.ts` migrate cleanly to `pilotiq-pro/playground` once `PanelAgent` imports come from `@pilotiq-pro/ai`. Phase 4 makes the import path change; Phase 6 moves the files. Ordered correctly.
