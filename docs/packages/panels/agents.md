# AI Agents

Resource agents bring AI capabilities directly into your admin panel. Define agents on resources that can read record data, update fields in real-time, and stream progress to an integrated chat sidebar.

> **Open core:** the AI runtime ships in the commercial [`@pilotiq-pro/ai`](https://github.com/pilotiq-io/pilotiq-pro) package. Free `@pilotiq/panels` ships only the contracts (`PanelAgentInterface`, `BuiltInAiActionRegistry`, `AiUiContext`, `ClientToolRegistry`). To enable agents, install `@pilotiq-pro/ai` and register its `AiServiceProvider` in your `bootstrap/providers.ts` — see the [pro README](https://github.com/pilotiq-io/pilotiq-pro/tree/main/packages/ai) for the full setup recipe.
>
> Without `@pilotiq-pro/ai` installed:
> - `Field.ai(['rewrite'])` throws a helpful build-time error pointing here
> - The chat sidebar slot is empty (no trigger button rendered)
> - The `✦` field-action dropdowns silently no-op
> - Free `@pilotiq/panels` works otherwise unchanged — there is no AI runtime to fail

---

## Defining Agents

Override the `agents()` method on a resource to define available agents. The `PanelAgent` class itself ships in `@pilotiq-pro/ai`:

```ts
import { Resource, TextField, TextareaField, Form } from '@pilotiq/panels'
import { PanelAgent } from '@pilotiq-pro/ai'

export class ArticleResource extends Resource {
  static model = Article

  form(form: Form) {
    return form.fields([
      TextField.make('title').required(),
      TextareaField.make('excerpt'),
      TextField.make('metaTitle'),
      TextareaField.make('metaDescription'),
    ])
  }

  agents() {
    return [
      PanelAgent.make('seo')
        .label('Improve SEO')
        .icon('Search')
        .instructions('Analyse and improve the meta title and description for better SEO.')
        .fields(['metaTitle', 'metaDescription']),

      PanelAgent.make('summarize')
        .label('Write Excerpt')
        .icon('Sparkles')
        .instructions('Write a concise excerpt based on the article title and content.')
        .fields(['excerpt']),
    ]
  }
}
```

### Fluent API

| Method | Description |
|---|---|
| `PanelAgent.make(slug)` | Create a new agent with a unique slug |
| `.label(string)` | Display name in the UI |
| `.icon(string)` | Lucide icon name |
| `.instructions(string \| fn)` | System prompt — static string or function receiving the record |
| `.fields(string[])` | Which form fields this agent can update |
| `.model(string)` | Override the AI model (e.g. `'anthropic/claude-sonnet-4-5'`) |
| `.tools(Tool[])` | Additional custom tools beyond the auto-generated ones |

### Default toolkit

Every `PanelAgent` ships with five tools out of the box:

- **`update_field`** *(server)* — Direct field write via `@rudderjs/live` (Yjs). Headless-only — for cron jobs and background runs.
- **`read_record`** *(server)* — Returns the current record as JSON.
- **`edit_text`** *(server)* — Direct rope edit on a field's persisted value. Headless-only.
- **`update_form_state`** *(client)* — Dispatches form-state ops to the live `<SchemaForm>` in the user's browser. **Use this when a browser is open** — it preserves unsaved local edits and works for non-collaborative fields.
- **`read_form_state`** *(client)* — Reads field values from the live form state, including unsaved edits.

The client tools round-trip through the server: the agent loop pauses with `pending_client_tools`, the browser executes the registered handler from `ClientToolRegistry`, and POSTs the result back to continue the loop.

---

## Class-Based Agents

For complex agents with custom tools or dynamic instructions:

```ts
import { PanelAgent } from '@pilotiq-pro/ai'
import { toolDefinition } from '@rudderjs/ai'
import { z } from 'zod'

class TranslateAgent extends PanelAgent {
  constructor() {
    super('translate')
    this.label('Translate').icon('Languages')
    this.fields(['title', 'content', 'metaDescription'])
  }

  resolveInstructions() {
    const lang = this.context.record.language ?? 'English'
    return `Translate all fields to ${lang}. Preserve formatting.`
  }

  extraTools() {
    return [
      toolDefinition({
        name: 'lookup_term',
        description: 'Look up domain-specific term translation',
        inputSchema: z.object({ term: z.string(), lang: z.string() }),
      }).server(async ({ term, lang }) => `"${term}" in ${lang}: ...`),
    ]
  }
}
```

### Override Points

| Method | Description |
|---|---|
| `resolveInstructions()` | Dynamic system prompt — has access to `this.context.record` |
| `extraTools()` | Additional tools beyond auto-generated ones |
| `beforeRun(ctx)` | Called before the agent runs. Throw to abort. |
| `afterRun(ctx, result)` | Called after the agent completes. |

---

## AI Chat Sidebar

The panel layout includes a collapsible AI chat sidebar on the right side. Toggle it from the header icon.

### Unified Conversation

Agent runs and free-form chat share one conversation timeline:

- **Dropdown trigger** — click "AI Agents" in the form toolbar → agent output streams as a message in the chat
- **Chat trigger** — type "write me an excerpt" in the chat input → the AI recognizes the request and invokes the appropriate agent
- **Free-form chat** — ask questions about your data without triggering agents

### Resource Context

When you're on a resource edit page, the chat is automatically resource-aware:

- The AI knows the current record data and available agents
- It can decide when to invoke an agent based on your request
- On non-resource pages, the chat works as a generic AI assistant

### Field Animation

When an agent calls `update_field`, the new value animates into the form field character-by-character. For collaborative fields (Yjs), the update propagates to all connected users.

---

## Chat Endpoint

`POST /{panel}/api/_chat`

### Request Body

```json
{
  "message": "write me an excerpt",
  "history": [
    { "role": "user", "content": "previous message" },
    { "role": "assistant", "content": "previous response" }
  ],
  "resourceContext": {
    "resourceSlug": "articles",
    "recordId": "abc123"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `message` | Yes | The user's message |
| `history` | No | Conversation history (last 20 messages recommended) |
| `resourceContext` | No | Current resource + record for context-aware responses |

To run a specific agent (instead of free-form chat), use the **standalone agent endpoint** `POST /{panel}/api/{resource}/:id/_agents/:agentSlug` — that's the canonical way to invoke a `PanelAgent` from a button click. The chat endpoint is for open-ended conversations only.

### SSE Events

The response is `text/event-stream`:

```
event: agent_start
data: {"agentSlug":"summarize","agentLabel":"Write Excerpt"}

event: tool_call
data: {"tool":"update_field","input":{"field":"excerpt","value":"..."}}

event: text
data: {"text":"The excerpt has been updated."}

event: agent_complete
data: {"steps":2,"tokens":450}

event: complete
data: {"done":true}
```

---

## Direct Agent Endpoint

The per-agent endpoint is still available for programmatic access:

`POST /{panel}/api/{resource}/:id/_agents/:agentSlug`

```json
{ "input": "optional user instruction" }
```

Returns SSE with events: `text`, `tool_call`, `complete`, `error`. For client tool round-trips (e.g. an action that calls `update_form_state`), the loop pauses with `pending_client_tools` and the browser POSTs the result to `/_agents/:agentSlug/continue` with the `runId` from the initial `run_started` event.

---

## Open-core seams (advanced)

`@pilotiq/panels` ships four open-core seams that `@pilotiq-pro/ai` fills in. Apps that want to build their own AI runtime — or replace pieces of pro's — can read and write these seams directly.

### `BuiltInAiActionRegistry`

The catalogue of built-in AI field actions (`rewrite`, `shorten`, `expand`, etc.) `Field.ai([...])` resolves slugs through. Free panels ships an empty registry; `@pilotiq-pro/ai`'s `AiServiceProvider.register()` seeds it with the 8 built-in actions at app boot.

```ts
import { BuiltInAiActionRegistry } from '@pilotiq/panels'

// Register a custom built-in action (must implement PanelAgentInterface):
BuiltInAiActionRegistry.register(myCustomAction)

// Look up an action by slug:
const agent = BuiltInAiActionRegistry.get('rewrite')
```

If `Field.ai(['unknown-slug'])` finds no matching agent at form-build time, it throws a helpful error pointing at `@pilotiq-pro/ai`.

### `AiUiContext` + `useAiUi()`

The React-side slot bag for AI UI components contributed by pro. Free panels ships the contract (an interface + an empty default context); pro's `<AiUiProvider>` populates the slots with concrete components and hooks.

```tsx
import { useAiUi } from '@pilotiq/panels'

function MyTopbar() {
  const { AiChatPanel, AiChatTrigger, AiDropdown, useAgentRun, useAiChat } = useAiUi()

  // Optional chaining: when pro is not installed, every slot is undefined.
  return (
    <header>
      {AiChatTrigger && <AiChatTrigger />}
      {/* … */}
    </header>
  )
}
```

The slot interface intentionally types every slot as optional with loose component shapes — tightening them here would force free to re-declare pro's full type surface, defeating the seam. Apps that vendor `+Layout.tsx` and statically wrap with `<AiUiProvider panelPath={...}>` get fully-typed access through pro's exports.

### `ClientToolRegistry`

Browser-side singleton that maps client-tool names to handler functions. Used by:

- `<SchemaForm>` registers `update_form_state` and `read_form_state` from a `useEffect` on mount
- `@pilotiq-pro/ai`'s chat dispatcher and `useAgentRun` look up handlers via `ClientToolRegistry.get(name)` when the agent loop pauses with a client tool call

There is exactly **one** `ClientToolRegistry` singleton per app — it lives in `@pilotiq/panels` and pro reads from the same module instance. This requires `@pilotiq/panels` to be deduped in your Vite config when you install pro (see the [pro README](https://github.com/pilotiq-io/pilotiq-pro/tree/main/packages/ai#3-configure-vite-load-bearing) for the recipe).

```ts
import { ClientToolRegistry } from '@pilotiq/panels'

useEffect(() => {
  return ClientToolRegistry.register('open_modal', async (args: { modalId: string }) => {
    showModal(args.modalId)
    return { opened: true }
  })
}, [])
```

`register()` returns an unregister function for `useEffect` cleanup. To make a registered tool callable by an agent, declare it server-side as a `toolDefinition` with no `.server(...)` execute function — that's what makes it a "client tool" the agent loop yields control on.

### `buildPanelMiddleware`

Helper that builds the panel guard middleware used by built-in CRUD route mounting. Exported so pro packages (or app code) can mount their own routes with the same auth posture:

```ts
import { buildPanelMiddleware, PanelRegistry } from '@pilotiq/panels'

for (const panel of PanelRegistry.all()) {
  const mw = [
    sessionMw,
    ...panel.getMiddleware(),
    ...buildPanelMiddleware(panel),
  ]
  // mount your own routes with `mw`
}
```

This is exactly how `@pilotiq-pro/ai`'s `AiServiceProvider.boot()` mounts its chat + standalone agent routes per panel.

### Why these seams?

The four together let `@pilotiq/panels` ship a fully-functional admin/CMS with zero AI runtime, while `@pilotiq-pro/ai` plugs in via the seams without any free-side knowledge of pro's internals. Apps that don't install pro get a clean baseline; apps that do install pro get the full agent runtime for one provider registration plus a Vite config edit. See [`docs/plans/phase-4-ai-extraction.md`](../../plans/phase-4-ai-extraction.md) for the full design rationale.
