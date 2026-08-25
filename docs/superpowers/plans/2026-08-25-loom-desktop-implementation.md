# Loom Desktop v0.1 Implementation Plan

> **For Loom:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for each task, then `superpowers:verification-before-completion` before claiming the milestone complete.

**Goal:** Ship a secure, light-theme macOS desktop workbench that lets a non-coding user open a repository, run Loom, observe the real Agent Loop, inspect code and diffs, approve commands, cancel/resume tasks, and replay durable history without using the terminal.

**Architecture:** Keep the existing root package as the reusable Loom core and CLI. Add `apps/desktop` as an Electron + React workspace package. Electron main owns filesystem access, LoomRuntime, task cancellation, approvals, and event streaming; a sandboxed preload exposes a narrow Zod-validated API; the renderer derives its UI from persisted runtime events rather than inventing a second task state.

**Tech Stack:** TypeScript, Node.js, pnpm workspaces, Electron, electron-vite, React, Monaco Editor, Zustand, Zod, Phosphor Icons, Vitest, Testing Library, Playwright Electron, electron-builder.

---

## Non-negotiable product constraints

- The approved visual source of truth is `design-system/loom-desktop/pages/workbench.md`; it overrides generic rules in `design-system/loom-desktop/MASTER.md`.
- Code remains the visual center. Explorer defaults to 205px; Agent Console defaults to 365px and resizes between 320px and 520px.
- The renderer is read-only for source code in v0.1. Loom edits through its tools; the user inspects files and diffs.
- Show actual `reasoningContent` in full when the provider supplies it. Never synthesize hidden reasoning.
- Do not add connected indicators, language/encoding/line-column status bars, decorative metrics, remote fonts, emoji icons, or repeated explanatory copy.
- Keep `DEEPSEEK_API_KEY` in the Electron main process environment. It must never cross IPC or enter renderer state.
- Preserve the current CLI behavior and event-log compatibility.

## Target file map

```text
Loom/
├── apps/desktop/
│   ├── package.json
│   ├── electron-builder.yml
│   ├── electron.vite.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── tsconfig.web.json
│   ├── playwright.config.ts
│   ├── resources/icon.icns
│   ├── src/main/
│   │   ├── index.ts
│   │   ├── window.ts
│   │   ├── ipc.ts
│   │   ├── task-service.ts
│   │   ├── approval-gate.ts
│   │   └── workspace-service.ts
│   ├── src/preload/
│   │   ├── index.ts
│   │   └── global.d.ts
│   ├── src/shared/
│   │   ├── channels.ts
│   │   └── contracts.ts
│   ├── src/renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── styles/{tokens,global,motion}.css
│   │       ├── state/{task-store,event-projection}.ts
│   │       ├── components/{LoomLogo,IconButton,PanelDivider,MinimumWindow}.tsx
│   │       ├── features/shell/{AppShell,WorkspaceHeader,CommandPalette}.tsx
│   │       ├── features/explorer/{Explorer,FileTree,TaskList}.tsx
│   │       ├── features/code/{CodeWorkspace,EditorTabs,DiffView}.tsx
│   │       ├── features/agent/{AgentConsole,ReasoningBlock,ThinkingIndicator,ExecutionFrontier,ToolActivity,VerificationEvidence,ApprovalSurface}.tsx
│   │       └── features/task/{NewTaskComposer,TaskStateView}.tsx
│   ├── tests/{main,preload,renderer}/
│   └── e2e/{fixtures,fake-provider,electron.spec}.ts
├── src/
│   ├── public.ts
│   ├── runtime.ts
│   ├── agent/loop.ts
│   └── events/streaming-store.ts
└── tests/
    ├── events/streaming-store.test.ts
    └── runtime/runtime-session.test.ts
```

## Task 1: Create the desktop workspace and secure Electron shell

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `src/public.ts`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsconfig.node.json`
- Create: `apps/desktop/tsconfig.web.json`
- Create: `apps/desktop/src/main/window.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/preload/global.d.ts`
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/src/main.tsx`
- Create: `apps/desktop/src/renderer/src/App.tsx`
- Test: `apps/desktop/tests/main/window.test.ts`
- Test: `apps/desktop/tests/renderer/security.test.ts`

- [x] **Step 1: Write the failing BrowserWindow security test**

```ts
import { describe, expect, it } from "vitest"
import { createWindowOptions } from "../../src/main/window"

describe("createWindowOptions", () => {
  it("isolates and sandboxes the renderer", () => {
    const options = createWindowOptions("/absolute/preload.js")
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: "/absolute/preload.js",
    })
  })

  it("enforces the minimum desktop viewport", () => {
    expect(createWindowOptions("/absolute/preload.js")).toMatchObject({
      width: 1440,
      height: 900,
      minWidth: 760,
      minHeight: 620,
    })
  })
})
```

- [x] **Step 2: Configure the pnpm workspace and public core entry point**

Set `pnpm-workspace.yaml` to include `apps/*` while preserving the existing esbuild allowlist. Add a root `exports` entry that maps `.` to `dist/public.js` and retains `bin: dist/index.js`. `src/public.ts` must export only the reusable contracts the desktop needs:

```ts
export { LoomRuntime } from "./runtime.js"
export type { RuntimeDependencies } from "./runtime.js"
export type { RunResult } from "./agent/loop.js"
export type { EventRecord, EventStore } from "./events/types.js"
export { FileEventStore } from "./events/store.js"
export type { ApprovalDecision, ApprovalGate, ApprovalRequest } from "./safety/approval.js"
export type { ModelProvider } from "./model/types.js"
```

Add root scripts:

```json
{
  "desktop:dev": "pnpm build && pnpm --filter loom-desktop dev",
  "desktop:build": "pnpm build && pnpm --filter loom-desktop build",
  "desktop:test": "pnpm --filter loom-desktop test",
  "desktop:e2e": "pnpm build && pnpm --filter loom-desktop e2e"
}
```

- [x] **Step 3: Scaffold the desktop package and install dependencies**

Use pnpm so resolved versions are recorded in `pnpm-lock.yaml`:

```bash
pnpm --filter loom-desktop add electron react react-dom zod zustand @monaco-editor/react monaco-editor @phosphor-icons/react loom@workspace:*
pnpm --filter loom-desktop add -D electron-vite electron-builder 'vite@^7.3.6' '@vitejs/plugin-react@^5.2.0' typescript vitest jsdom @types/node @types/react @types/react-dom @testing-library/react @testing-library/user-event @playwright/test
```

Define package scripts `dev`, `build`, `typecheck`, `test`, `e2e`, and `package:mac`. Configure electron-vite entry points for `src/main/index.ts`, `src/preload/index.ts`, and `src/renderer/index.html`.

- [x] **Step 4: Implement the secure window factory and minimal renderer**

`createWindowOptions(preloadPath)` returns the tested options plus `titleBarStyle: "hiddenInset"`, `backgroundColor: "#F7F7F5"`, and `show: false`. `createMainWindow()` must:

- show on `ready-to-show`;
- deny `will-navigate` away from the loaded application;
- return `{ action: "deny" }` from `setWindowOpenHandler`;
- load the dev URL only when `ELECTRON_RENDERER_URL` exists, otherwise load the bundled renderer.

Bundle the sandboxed preload as CommonJS (`index.cjs`) because Electron runs sandbox preload scripts as plain scripts rather than ESM. Add a renderer Content Security Policy that restricts scripts to Loom's own renderer and blocks object embedding.

The first React screen renders only a plain `Loom` heading so the shell can be exercised before visual work.

- [x] **Step 5: Run the focused test, then build both packages**

Run: `pnpm --filter loom-desktop test -- window.test.ts`

Expected: 2 tests pass.

Run: `pnpm build && pnpm --filter loom-desktop typecheck && pnpm --filter loom-desktop build`

Expected: core emits `dist/public.js`; Electron main, preload, and renderer bundles complete without errors.

- [x] **Step 6: Commit the shell milestone**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml src/public.ts apps/desktop
git commit -m "feat(desktop): add secure Electron shell"
```

## Task 2: Define the typed IPC boundary and workspace service

**Files:**

- Create: `apps/desktop/src/shared/channels.ts`
- Create: `apps/desktop/src/shared/contracts.ts`
- Create: `apps/desktop/src/main/workspace-service.ts`
- Create: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/preload/bridge.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/global.d.ts`
- Test: `apps/desktop/tests/main/contracts.test.ts`
- Test: `apps/desktop/tests/main/ipc.test.ts`
- Test: `apps/desktop/tests/main/workspace-service.test.ts`
- Test: `apps/desktop/tests/preload/bridge.test.ts`

- [x] **Step 1: Write failing contract and path-policy tests**

Cover these exact cases:

```ts
expect(() => StartTaskInputSchema.parse({ workspaceRoot: "relative", goal: "Fix it" })).toThrow()
expect(() => StartTaskInputSchema.parse({ workspaceRoot: "/repo", goal: "  " })).toThrow()
expect(() => ApprovalDecisionInputSchema.parse({ taskId: "bad/id", decision: "always" })).toThrow()
expect(EventEnvelopeSchema.parse(validPersistedEvent)).toEqual(validPersistedEvent)
```

Create a temporary workspace and assert `WorkspaceService.readFile()` accepts a file inside it but rejects `../outside.txt` and a symlink that resolves outside the workspace.

- [x] **Step 2: Implement shared Zod contracts and channel constants**

Define these renderer-facing types from Zod schemas:

```ts
type WorkspaceInfo = { root: string; name: string }
type FileNode = { name: string; relativePath: string; kind: "file" | "directory"; children?: FileNode[] }
type TaskCommandResult = { taskId: string }
type StartTaskInput = { workspaceRoot: string; goal: string }
type ResumeTaskInput = { workspaceRoot: string; taskId: string }
type ReplayTaskInput = { workspaceRoot: string; taskId: string }
type ReadFileInput = { workspaceRoot: string; relativePath: string }
type ApprovalDecisionInput = { taskId: string; decision: "allow" | "deny" }
type TaskEventEnvelope = { taskId: string; event: EventRecord }
```

Use explicit constants for invoke channels and the single task-event channel. Do not export raw Electron channel access.

- [x] **Step 3: Implement safe workspace reads**

`WorkspaceService` provides:

```ts
chooseWorkspace(): Promise<WorkspaceInfo | null>
listTree(root: string): Promise<FileNode[]>
readFile(input: ReadFileInput): Promise<{ relativePath: string; content: string }>
```

Resolve and realpath both workspace and target, require the target to stay under the real workspace root, ignore `.git`, `node_modules`, `dist`, `.loom/runs`, and cap tree traversal at 10,000 nodes. Reject binary files and files larger than 2 MiB with a typed message the renderer can display.

- [x] **Step 4: Implement the narrow preload API**

Expose exactly this surface through `contextBridge.exposeInMainWorld("loom", api)`:

```ts
interface LoomDesktopApi {
  chooseWorkspace(): Promise<WorkspaceInfo | null>
  listWorkspace(root: string): Promise<FileNode[]>
  readFile(input: ReadFileInput): Promise<{ relativePath: string; content: string }>
  startTask(input: StartTaskInput): Promise<TaskCommandResult>
  resumeTask(input: ResumeTaskInput): Promise<TaskCommandResult>
  replayTask(input: ReplayTaskInput): Promise<EventRecord[]>
  cancelTask(taskId: string): Promise<void>
  resolveApproval(input: ApprovalDecisionInput): Promise<void>
  onTaskEvent(listener: (envelope: TaskEventEnvelope) => void): () => void
}
```

Every invoke input is parsed in preload and parsed again in main. Every response is parsed before returning to the renderer. The bridge test must assert that no `send`, `invoke`, `on`, `ipcRenderer`, environment object, or API-key value is exposed.

- [x] **Step 5: Register main handlers and verify the boundary**

Run: `pnpm --dir apps/desktop exec vitest run tests/main/contracts.test.ts tests/main/ipc.test.ts tests/main/workspace-service.test.ts tests/preload/bridge.test.ts`

Expected: malformed payloads, traversal, escaping symlinks, and unlisted bridge methods are rejected; valid file reads pass.

- [x] **Step 6: Commit the IPC milestone**

```bash
git add apps/desktop/src apps/desktop/tests
git commit -m "feat(desktop): add validated IPC boundary"
```

## Task 3: Stream durable core events and preserve model reasoning

**Files:**

- Create: `src/events/streaming-store.ts`
- Modify: `src/agent/loop.ts`
- Modify: `src/runtime.ts`
- Modify: `src/public.ts`
- Modify: `src/state/projection.ts`
- Modify: `tests/agent/loop.test.ts`
- Modify: `tests/state/projection.test.ts`
- Create: `tests/events/streaming-store.test.ts`
- Create: `tests/runtime/runtime-session.test.ts`

- [x] **Step 1: Write the failing persist-before-publish test**

```ts
it("publishes only after the inner store persists", async () => {
  const order: string[] = []
  const inner: EventStore = {
    append: async (taskId, type, data) => {
      order.push("persist")
      return { seq: 1, timestamp: "2026-08-25T00:00:00.000Z", taskId, type, data }
    },
    readAll: async () => [],
  }
  const store = new StreamingEventStore(inner)
  store.subscribe((event) => order.push(`publish:${event.seq}`))

  await store.append("task-1", "task.created", { goal: "Fix auth" })

  expect(order).toEqual(["persist", "publish:1"])
})
```

Also assert unsubscribe stops delivery and a rejected inner append publishes nothing.

- [x] **Step 2: Write the failing AgentLoop reasoning test**

Make the fake provider return:

```ts
{
  content: "I will inspect the file.",
  reasoningContent: "The failing behavior points to token refresh ordering.",
  toolCalls: [],
}
```

Assert `model.responded.data.reasoningContent` contains the exact provider text and the projected assistant message retains it for resume.

- [x] **Step 3: Implement StreamingEventStore**

```ts
export type EventSubscriber = (event: EventRecord) => void

export class StreamingEventStore implements EventStore {
  private readonly subscribers = new Set<EventSubscriber>()

  constructor(private readonly inner: EventStore) {}

  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  async append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>> {
    const event = await this.inner.append(taskId, type, data)
    for (const subscriber of this.subscribers) subscriber(event)
    return event
  }

  readAll(taskId: string): Promise<EventRecord[]> {
    return this.inner.readAll(taskId)
  }
}
```

Subscriber failures must be isolated so one UI listener cannot fail the Agent Loop; collect them through an optional `onSubscriberError` constructor callback.

Export `StreamingEventStore`, its subscriber types, and `RuntimeRunOptions` from `src/public.ts` only after these types exist.

- [x] **Step 4: Add runtime session options without breaking the CLI**

Introduce:

```ts
export type RuntimeRunOptions = {
  taskId?: string
  signal?: AbortSignal
  eventStore?: EventStore
}
```

Change signatures to:

```ts
run(goal: string, cwd: string, options?: RuntimeRunOptions): Promise<RunResult>
resume(taskId: string, cwd: string, options?: Omit<RuntimeRunOptions, "taskId">): Promise<RunResult>
replay(taskId: string, cwd: string, options?: Pick<RuntimeRunOptions, "eventStore">): Promise<EventRecord[]>
```

Use the supplied task ID, signal, and store when present. Preserve the current two-argument CLI calls. Pass `reasoningContent` into `model.responded` and the assistant message. Update `projectRun()` to restore `reasoningContent` from the event so resume reconstructs the same assistant message rather than losing provider-visible reasoning.

- [x] **Step 5: Verify core behavior and CLI regression**

Run: `pnpm test -- streaming-store.test.ts runtime-session.test.ts loop.test.ts cli.test.ts`

Expected: event ordering, reasoning preservation, injected task IDs, abort signals, and existing CLI behavior pass.

Run: `pnpm typecheck && pnpm build`

Expected: zero TypeScript or build errors.

- [ ] **Step 6: Commit the streaming milestone**

```bash
git add src tests
git commit -m "feat(core): stream durable task events"
```

## Task 4: Add desktop task lifecycle, approval, cancellation, and replay

**Files:**

- Create: `apps/desktop/src/main/approval-gate.ts`
- Create: `apps/desktop/src/main/task-service.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `apps/desktop/tests/main/approval-gate.test.ts`
- Test: `apps/desktop/tests/main/task-service.test.ts`

- [x] **Step 1: Write failing approval and cancellation tests**

Test these transitions with a fake runtime factory:

```text
startTask -> returns taskId immediately -> emits persisted events -> completes
shell request -> approval.requested envelope -> allow -> promise resolves "allow"
shell request -> deny -> promise resolves "deny"
cancelTask -> AbortController.signal.aborted is true -> task.cancelled arrives
resumeTask -> reuses taskId and streams newly persisted events
replayTask -> returns ordered JSONL events without starting a model call
```

Assert a second unresolved approval for the same task rejects with a clear invariant error, and closing the window denies every pending request.

- [x] **Step 2: Implement DesktopApprovalGate**

Construct one gate per running task:

```ts
class DesktopApprovalGate implements ApprovalGate {
  constructor(private readonly taskId: string) {}

  request(input: ApprovalRequest): Promise<ApprovalDecision>
  resolve(decision: ApprovalDecision): void
  dispose(): void
}
```

Keep only the pending request and resolver in main memory. The existing shell tool persists `approval.requested` before it calls the gate and persists `approval.resolved` after the decision, so the renderer learns about approval through the same durable event stream as every other runtime fact. `dispose()` resolves an outstanding request as `deny`.

- [x] **Step 3: Implement TaskService**

Maintain:

```ts
type ActiveTask = {
  controller: AbortController
  gate: DesktopApprovalGate
  unsubscribe: () => void
  completion: Promise<RunResult>
}
```

`start()` generates the task ID before launching Loom, wraps `FileEventStore` with `StreamingEventStore`, forwards task-scoped events to the owning BrowserWindow, and starts `LoomRuntime.run()` without blocking the IPC response. `resume()` follows the same path with `LoomRuntime.resume()`. `cancel()`, `resolveApproval()`, `replay()`, and `disposeWindow()` must be idempotent where safe and return typed errors for unknown active tasks.

Inject a runtime factory into `TaskService` so tests never call DeepSeek or spawn real shell commands.

- [x] **Step 4: Wire task handlers to the allowlisted IPC layer**

Handlers parse requests with shared schemas, call TaskService, parse results, and redact error messages through one serializer. The serializer must remove any exact value found in `DEEPSEEK_API_KEY` before sending an error to the renderer.

- [x] **Step 5: Run the desktop service tests**

Run: `pnpm --filter loom-desktop test -- approval-gate.test.ts task-service.test.ts contracts.test.ts`

Expected: all lifecycle transitions, redaction, cancellation, replay, approval resolution, and cleanup pass.

- [x] **Step 6: Commit the task-service milestone**

```bash
git add apps/desktop/src/main apps/desktop/tests/main
git commit -m "feat(desktop): connect Loom task lifecycle"
```

## Task 5: Build the approved workbench shell and design system

**Files:**

- Create: `apps/desktop/src/renderer/src/styles/tokens.css`
- Create: `apps/desktop/src/renderer/src/styles/global.css`
- Create: `apps/desktop/src/renderer/src/styles/motion.css`
- Create: `apps/desktop/src/renderer/src/components/LoomLogo.tsx`
- Create: `apps/desktop/src/renderer/src/components/IconButton.tsx`
- Create: `apps/desktop/src/renderer/src/components/PanelDivider.tsx`
- Create: `apps/desktop/src/renderer/src/components/MinimumWindow.tsx`
- Create: `apps/desktop/src/renderer/src/features/shell/AppShell.tsx`
- Create: `apps/desktop/src/renderer/src/features/shell/WorkspaceHeader.tsx`
- Create: `apps/desktop/src/renderer/src/features/explorer/Explorer.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Test: `apps/desktop/tests/renderer/app-shell.test.tsx`
- Test: `apps/desktop/tests/renderer/accessibility.test.tsx`

- [x] **Step 1: Write failing shell behavior tests**

Use Testing Library to assert:

- the visual center has accessible name `Code workspace`;
- Agent Console defaults to 365px, clamps at 320px and 520px, and can collapse/restore by keyboard;
- Explorer collapses below 1,000px;
- below 760px `MinimumWindow` replaces the workbench;
- icon-only controls have accessible names;
- the page contains no `Connected`, `UTF-8`, `Ln `, `Col `, or editor-language status text.

- [x] **Step 2: Translate the approved design file into CSS tokens**

Use local system fonts and these semantic tokens from the approved workbench override:

```css
:root {
  --canvas: #f7f7f5;
  --surface: #ffffff;
  --surface-subtle: #f1f1ee;
  --text-primary: #171717;
  --text-secondary: #6f716d;
  --line: #deded9;
  --accent: #2864dc;
  --verified: #237a4b;
  --approval: #a76200;
  --failure: #bb3535;
  --focus: #2864dc;
  --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif;
  --font-code: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --radius-sm: 6px;
  --radius-md: 10px;
}
```

Keep borders one pixel, shadows quiet, and focus rings two pixels. Do not use gradients or remote assets.

- [x] **Step 3: Implement the original Loom mark and reusable controls**

Build `LoomLogo` as inline SVG with two interlocking rounded thread paths, `currentColor`, no text baked into the SVG, and legibility at 16px. Use Phosphor for general icons. `IconButton` requires `aria-label` and exposes 32px and 36px sizes.

- [x] **Step 4: Implement the three-panel AppShell**

Use CSS grid with persisted local panel widths:

```text
205px | minmax(360px, 1fr) | clamp(320px, saved width, 520px)
```

The header contains Loom/repository, current task title, and the command-palette control only. Panel dividers support mouse drag plus ArrowLeft/ArrowRight keyboard adjustment. Use a semantic `main` for code, `aside` for Agent Console, and navigation landmarks for Explorer.

- [x] **Step 5: Implement restrained motion and reduced-motion behavior**

Use 160ms ease-out for hover/focus, 220ms for panel movement, and at most 4px entrance translation. Under `prefers-reduced-motion: reduce`, disable spatial and continuous animation.

- [x] **Step 6: Run shell and accessibility tests**

Run: `pnpm --filter loom-desktop test -- app-shell.test.tsx accessibility.test.tsx`

Expected: layout, keyboard resizing, minimum viewport, names, reduced motion hooks, and noise-text bans pass.

- [x] **Step 7: Commit the visual shell milestone**

```bash
git add apps/desktop/src/renderer apps/desktop/tests/renderer
git commit -m "feat(desktop): build Loom workbench shell"
```

## Task 6: Add repository explorer, read-only code tabs, and diff inspection

**Files:**

- Create: `apps/desktop/src/renderer/src/features/explorer/FileTree.tsx`
- Create: `apps/desktop/src/renderer/src/features/explorer/TaskList.tsx`
- Create: `apps/desktop/src/renderer/src/features/code/CodeWorkspace.tsx`
- Create: `apps/desktop/src/renderer/src/features/code/EditorTabs.tsx`
- Create: `apps/desktop/src/renderer/src/features/code/DiffView.tsx`
- Create: `apps/desktop/src/renderer/src/state/task-store.ts`
- Modify: `apps/desktop/src/shared/contracts.ts`
- Modify: `apps/desktop/src/main/workspace-service.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/global.d.ts`
- Modify: `apps/desktop/src/renderer/src/features/explorer/Explorer.tsx`
- Modify: `apps/desktop/src/renderer/src/features/shell/AppShell.tsx`
- Test: `apps/desktop/tests/renderer/explorer.test.tsx`
- Test: `apps/desktop/tests/renderer/code-workspace.test.tsx`

- [ ] **Step 1: Write failing explorer and tab tests**

Assert that selecting a file calls `window.loom.readFile` with the active workspace, opens one tab, reselecting does not duplicate it, closing the active tab chooses the nearest remaining tab, and read errors render inline without replacing Agent Console.

Assert that a `file.changed` event selects the changed path and opens its persisted unified patch in a Monaco editor with the `diff` language, `readOnly: true`, no minimap, and no status bar. This uses the durable `file.changed.data.diff` fact and does not invent a missing pre-edit snapshot.

- [ ] **Step 2: Implement the renderer store as derived view state**

Store only UI preferences and cached read results:

```ts
type RendererState = {
  workspace: WorkspaceInfo | null
  tree: FileNode[]
  eventsByTask: Record<string, EventRecord[]>
  activeTaskId: string | null
  openTabs: string[]
  activePath: string | null
  fileCache: Record<string, string>
  agentPanelWidth: number
  explorerCollapsed: boolean
}
```

Do not store an authoritative `taskStatus`; derive it from events in Task 7.

- [ ] **Step 3: Implement file tree and task history navigation**

Use native buttons/tree semantics, roving keyboard focus, Left/Right to collapse/expand directories, Enter to open a file, and no decorative folder-status badges. Add `listTasks(root): Promise<TaskSummary[]>` to the shared contract, preload bridge, IPC handlers, and WorkspaceService. It reads `.loom/runs/*/events.jsonl`, orders tasks by their latest event timestamp, and labels each task from `task.created.data.goal` plus final projected state.

- [ ] **Step 4: Implement Monaco code and diff views**

Lazy-load Monaco on the first file selection. Detect language from file extension solely for syntax highlighting; do not display the language name. Keep the code editor read-only. `DiffView` displays the exact persisted unified patch from `file.changed.data.diff`, uses Monaco's `diff` language, and reveals the first `@@` hunk.

- [ ] **Step 5: Verify file navigation and diff behavior**

Run: `pnpm --filter loom-desktop test -- explorer.test.tsx code-workspace.test.tsx`

Expected: tree keyboard behavior, unique tabs, safe reads, read-only options, and unified diff presentation pass.

- [ ] **Step 6: Commit the code-workspace milestone**

```bash
git add apps/desktop/src apps/desktop/tests
git commit -m "feat(desktop): add code and diff workspace"
```

## Task 7: Build the real Agent Console from event projections

**Files:**

- Create: `apps/desktop/src/renderer/src/state/event-projection.ts`
- Create: `apps/desktop/src/renderer/src/features/agent/AgentConsole.tsx`
- Create: `apps/desktop/src/renderer/src/features/agent/ReasoningBlock.tsx`
- Create: `apps/desktop/src/renderer/src/features/agent/ThinkingIndicator.tsx`
- Create: `apps/desktop/src/renderer/src/features/agent/ExecutionFrontier.tsx`
- Create: `apps/desktop/src/renderer/src/features/agent/ToolActivity.tsx`
- Create: `apps/desktop/src/renderer/src/features/agent/VerificationEvidence.tsx`
- Create: `apps/desktop/src/renderer/src/features/agent/ApprovalSurface.tsx`
- Modify: `apps/desktop/src/renderer/src/features/shell/AppShell.tsx`
- Test: `apps/desktop/tests/renderer/event-projection.test.ts`
- Test: `apps/desktop/tests/renderer/agent-console.test.tsx`
- Test: `apps/desktop/tests/renderer/approval-surface.test.tsx`

- [ ] **Step 1: Write failing projection tests for every terminal state**

Given ordered `EventRecord[]`, assert the projection returns:

```ts
type AgentConsoleView = {
  status: "empty" | "running" | "approval_required" | "verifying" | "candidate_done" | "verified" | "blocked" | "failed" | "cancelled"
  reasoning: Array<{ seq: number; content: string }>
  done: FrontierItem[]
  current: FrontierItem | null
  next: FrontierItem[]
  evidence: EvidenceItem[]
  pendingApproval: ApprovalView | null
}
```

Cover verified, continue, blocked, failed, cancelled, and candidate-done event histories. Unknown event types remain replayable in a raw detail view but do not break the projection.

- [ ] **Step 2: Write failing reasoning and thinking tests**

Assert provider reasoning renders verbatim and remains selectable. When the latest unmatched event is `model.requested`, render `Thinking` plus elapsed time. When `reasoningContent` is absent, show only the active operation and elapsed time; the DOM must not contain invented prose. Under reduced motion, render a static mark with no animation class.

- [ ] **Step 3: Implement pure event projection**

Project events by `seq`, pair request/completion events, and derive status from the most recent authoritative task or verification event. Keep raw tool output collapsed by default; concise `content` and metadata form the visible summary. Evidence items must name the check and show pass/fail/blocked text, not color alone.

- [ ] **Step 4: Implement the console composition**

Order the persistent console as:

```text
current reasoning / thinking
execution frontier
tool activity
verification evidence
approval surface (bottom anchored when present)
```

Reasoning is copyable, timeline entries enter within 4px, raw output opens with a disclosure button, and the console preserves scroll position when older items expand.

- [ ] **Step 5: Implement approval interaction**

The compact surface shows command, cwd, reason, `Inspect`, and `Allow once`. Inspect reveals timeout and `Deny`. Keyboard shortcuts work only while the surface owns focus: Enter allows, Escape denies. Both actions call `window.loom.resolveApproval` exactly once and disable during the promise.

- [ ] **Step 6: Verify the console behavior**

Run: `pnpm --filter loom-desktop test -- event-projection.test.ts agent-console.test.tsx approval-surface.test.tsx`

Expected: real reasoning, fallback, progressive disclosure, every state, evidence, and approval keyboard behavior pass.

- [ ] **Step 7: Commit the Agent Console milestone**

```bash
git add apps/desktop/src/renderer apps/desktop/tests/renderer
git commit -m "feat(desktop): add event-driven Agent Console"
```

## Task 8: Integrate task creation, command palette, resume, replay, and cancellation

**Files:**

- Create: `apps/desktop/src/renderer/src/features/task/NewTaskComposer.tsx`
- Create: `apps/desktop/src/renderer/src/features/task/TaskStateView.tsx`
- Create: `apps/desktop/src/renderer/src/features/shell/CommandPalette.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/state/task-store.ts`
- Modify: `apps/desktop/src/renderer/src/features/shell/WorkspaceHeader.tsx`
- Test: `apps/desktop/tests/renderer/task-lifecycle.test.tsx`
- Test: `apps/desktop/tests/renderer/command-palette.test.tsx`

- [ ] **Step 1: Write the failing complete renderer-flow test**

Mock `window.loom` and verify:

```text
choose repository -> explorer loads -> enter goal -> startTask
event subscription -> reasoning/tool/diff/verification update in sequence
cancel -> cancelTask(activeTaskId)
select past task -> replayTask -> console and changed file restore
resumable task -> resumeTask -> new events append without duplicates
```

Also verify setup/model/tool/verification/bridge errors appear beside the failed operation and API-key-shaped strings are not retained in Zustand state.

- [ ] **Step 2: Implement the task composer and lifecycle subscription**

Use a growing text area with `⌘Enter` to submit, disabled only for empty goals or no workspace. Subscribe once during app mount, merge events by `(taskId, seq)`, and unsubscribe on unmount. Keep cancellation visible only while an active task can still run.

- [ ] **Step 3: Implement command palette actions**

`⌘K` opens a focused palette with these commands:

- Open Repository
- New Task
- Show/Hide Explorer
- Show/Hide Agent Console
- Cancel Current Task
- Replay Current Task
- Resume Current Task when its projection is resumable

Arrow keys move selection, Enter invokes, Escape closes, and focus returns to the invoking control.

- [ ] **Step 4: Implement state-specific surfaces**

Render compact views for empty, setup failure, running, approval required, verifying, candidate done, verified, blocked, failed, and cancelled. Verified uses a green check plus evidence; candidate done explicitly says verification has not established completion. Avoid congratulatory copy and metric badges.

- [ ] **Step 5: Verify integrated renderer behavior**

Run: `pnpm --filter loom-desktop test -- task-lifecycle.test.tsx command-palette.test.tsx`

Expected: creation, streaming, cancel, replay, resume, focus return, shortcuts, error placement, and event de-duplication pass.

- [ ] **Step 6: Commit the integrated renderer milestone**

```bash
git add apps/desktop/src/renderer apps/desktop/tests/renderer
git commit -m "feat(desktop): complete task workbench flow"
```

## Task 9: Package, test, and visually verify the complete desktop app

**Files:**

- Create: `apps/desktop/electron-builder.yml`
- Create: `apps/desktop/playwright.config.ts`
- Create: `apps/desktop/e2e/fake-provider.ts`
- Create: `apps/desktop/e2e/fixtures/sample-repo/src/auth.ts`
- Create: `apps/desktop/e2e/fixtures/sample-repo/tests/auth.test.ts`
- Create: `apps/desktop/e2e/electron.spec.ts`
- Create: `apps/desktop/resources/icon.svg`
- Generate: `apps/desktop/resources/icon.icns`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/README.md`

- [ ] **Step 1: Create a deterministic fake-provider mode for E2E only**

When `LOOM_DESKTOP_E2E=1`, main injects a scripted `ModelProvider` that emits this observable sequence without network access:

```text
reasoning -> search -> read_file -> edit_file -> shell approval -> finish_task -> verified
```

Keep this branch behind the explicit test environment variable and outside production bundles where electron-vite dead-code elimination can remove it.

- [ ] **Step 2: Write Electron E2E scenarios**

Use Playwright `_electron.launch()` and cover:

1. open the fixture repo, start a task, observe exact reasoning, search/read/edit, approve shell, inspect diff, and reach Verified;
2. deny shell and observe the tool denial without a false Verified state;
3. cancel while the fake provider is pending and observe Cancelled;
4. close/relaunch, replay JSONL history, and restore console plus diff;
5. perform open/new-task/panel navigation/approval/cancel using keyboard only;
6. emulate reduced motion and verify no continuous thinking animation.

- [ ] **Step 3: Add visual assertions at the supported sizes**

Capture screenshots at 1440×900, 1280×800, and 1024×768. Assert no horizontal document overflow, code remains the largest panel, Agent Console stays within bounds, and no banned noise text is visible. At 759px width assert only the minimum-window screen is present.

- [ ] **Step 4: Add the final icon and packaging configuration**

Create the same interlocking-thread Loom mark on a restrained warm-white macOS icon field. Configure electron-builder for macOS arm64/x64 development artifacts, hardened runtime, app ID `dev.loom.desktop`, product name `Loom`, and bundled core/renderer assets. Do not sign or notarize in v0.1; document the unsigned local-build warning.

- [ ] **Step 5: Run the complete verification matrix**

Run, in order:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter loom-desktop typecheck
pnpm --filter loom-desktop test
pnpm --filter loom-desktop build
pnpm --filter loom-desktop e2e
pnpm --filter loom-desktop package:mac
```

Expected:

- all existing core/CLI tests remain green;
- all desktop unit, contract, integration, accessibility, and E2E tests pass;
- Electron bundles load without console errors;
- a local macOS application artifact is produced;
- the API key does not appear in IPC snapshots, renderer state, screenshots, or packaged renderer assets.

- [ ] **Step 6: Inspect the final worktree and record the milestone**

Run: `git status --short && git diff --check`

Expected: no unintended files, no whitespace errors, and generated screenshots/build artifacts excluded by `.gitignore`.

```bash
git add apps/desktop .gitignore pnpm-lock.yaml package.json pnpm-workspace.yaml
git commit -m "feat: ship Loom Desktop v0.1"
```

## Final acceptance walkthrough

- [ ] Launch Loom from Finder or `pnpm desktop:dev` with `DEEPSEEK_API_KEY` set only in the parent process.
- [ ] Open a repository through the native folder chooser.
- [ ] Submit a natural-language coding task with `⌘Enter`.
- [ ] Watch real reasoning, tool actions, frontier, and verification evidence update from persisted events.
- [ ] Open changed files and inspect a read-only diff in the code workspace.
- [ ] Inspect and allow or deny a shell command without losing code context.
- [ ] Cancel a running task and see the durable cancelled event.
- [ ] Relaunch Loom, replay a prior task, and resume a resumable task.
- [ ] Confirm the UI remains quiet: no connected badge, status-bar metadata, decorative metrics, redundant hints, emoji icons, or fake reasoning.
- [ ] Confirm the app is usable without opening a terminal.
