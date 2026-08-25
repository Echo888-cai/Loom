# Loom Desktop v0.1 Design

## 1. Product Definition

Loom Desktop is a local, code-first interface for the existing Loom coding-agent harness. It does not replace AgentLoop, Tools, EventStore, Verification, or DeepSeekProvider. It makes those layers visible and controllable through a focused desktop workbench.

The approved product expression is:

> Cursor-like efficiency, Apple-level restraint, and Claude Code-level process visibility.

The interface must feel quiet even while the harness is doing complex work. Complexity remains in the runtime; the UI surfaces only information needed to understand a change, make a decision, or resolve a blocker.

## 2. Scope

### Included in v0.1

- Electron desktop shell for macOS.
- React renderer written in TypeScript.
- Open a local workspace.
- Start a Loom task with a natural-language goal.
- Resume and replay existing tasks.
- Live Agent Console with full available model reasoning, tool activity, execution frontier, and verification evidence.
- Code and unified diff viewing with Monaco Editor.
- Shell approval interaction with allow-once and deny decisions.
- Task cancellation.
- Empty, running, approval-required, verification, blocked, failed, cancelled, candidate-done, and verified states.
- Keyboard navigation and command palette entry point.
- Automated unit, IPC contract, integration, and Electron end-to-end tests.

### Excluded from v0.1

- Editing code manually inside the UI.
- Git commit, branch, pull request, or remote repository management.
- Multi-agent orchestration.
- Cloud task execution, authentication, collaboration, or account sync.
- Plugin marketplace.
- Dark mode.
- Storing DeepSeek credentials in the renderer or EventStore.

The first release continues to read `DEEPSEEK_API_KEY` from the process environment. A later credential design may use the macOS Keychain through Electron `safeStorage`, but it is intentionally outside this scope.

## 3. Visual System

The canonical rules are in `design-system/loom-desktop/MASTER.md`, overridden for the workbench by `design-system/loom-desktop/pages/workbench.md`.

The workbench uses a light, near-monochrome system with one blue interaction accent, green verified evidence, amber approval, and red failure. It uses native macOS typography where available and avoids remote font loading.

The original Loom logo is an interlocking-thread mark: two offset rounded paths in a single monochrome treatment. It must remain legible at 16px and must not resemble the OpenAI, Anthropic, Cursor, or Apple marks.

### Information explicitly removed

- Generic “connected” status.
- Language mode, encoding, line ending, cursor position, and similar editor status-bar metadata.
- Decorative metric badges.
- Repeated explanatory text that tells an experienced user what obvious controls do.
- Tool output that does not influence the current decision.

## 4. Workspace Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Loom / repository         Current task                ⌘K    │
├──────────────┬──────────────────────────┬────────────────────┤
│ Explorer     │ Code / Diff              │ Agent Console      │
│ 205px        │ flexible                 │ 365px, resizable   │
│              │                          │                    │
│ files        │ selected file            │ reasoning          │
│ tasks        │ unified diff             │ execution frontier │
│              │                          │ evidence           │
│              │                          │ approval           │
└──────────────┴──────────────────────────┴────────────────────┘
```

The code workspace is the visual center. The Agent Console is persistent, resizable between 320px and 520px, and may collapse through a keyboard-accessible control. Explorer can collapse below 1,000px window width. Below 760px, the product shows an explicit minimum-window message rather than forcing a phone layout; Loom Desktop is a desktop tool, not a responsive mobile website.

## 5. Agent Console

The Agent Console is built from runtime facts, not simulated UI status.

### Reasoning

- When a provider returns `reasoningContent`, Loom stores it in an event and displays it in full.
- While a model request is active, a subtle thinking animation is displayed.
- If a provider does not expose reasoning, Loom shows the active operation and elapsed time; it never fabricates hidden reasoning.
- Reasoning is selectable and copyable.

### Execution frontier

The console projects events into four concepts:

- Done: completed tool actions with concise outcomes.
- Current: the model call, tool call, approval, or verification currently active.
- Next: known pending checks, such as configured verification commands.
- Evidence: objective diff, test, build, lint, and verification results.

Raw output is available through expansion, but is never the default visual layer.

### Approval

Approval appears as a bottom-anchored decision surface inside Agent Console. It includes the exact command, cwd, reason, timeout, and two actions: Inspect and Allow once. Deny remains available through the Inspect view and keyboard shortcut. Approval never blocks visibility of the code change or keyboard focus.

## 6. Desktop Architecture

The implementation uses an Electron main process, a sandboxed preload bridge, and a React renderer.

```text
React Renderer
  │ typed window.loom API
  ↓
Preload Bridge
  │ allowlisted IPC channels only
  ↓
Electron Main Process
  ├── LoomRuntime
  ├── AgentLoop
  ├── StreamingEventStore
  ├── DesktopApprovalGate
  └── Workspace/File service
```

Security requirements:

- `contextIsolation: true`.
- `nodeIntegration: false`.
- Renderer sandbox enabled.
- No generic `ipcRenderer.send` exposed to the renderer.
- Every IPC request and response validated with Zod.
- Workspace paths validated in the main process.
- DeepSeek API Key never crosses to preload or renderer.
- External navigation and new windows denied by default.

The desktop package lives at `apps/desktop`. The existing root package remains the Loom core and CLI. `apps/desktop` consumes the root package through the pnpm workspace rather than copying runtime logic.

## 7. Runtime Integration

The current JSONL EventStore remains the source of truth. Desktop adds a `StreamingEventStore` decorator that forwards every successfully persisted event to in-process subscribers.

```text
AgentLoop append event
  ↓
FileEventStore persists JSONL
  ↓
StreamingEventStore publishes event
  ↓
Electron main sends task-scoped IPC event
  ↓
React store updates derived view
```

Persistence occurs before publication so the UI never displays an event that was not durably recorded.

`LoomRuntime` gains a task session API with:

- `run(goal, cwd, signal)`;
- `resume(taskId, cwd, signal)`;
- `replay(taskId, cwd)`;
- task-scoped event subscription;
- approval resolution;
- cancellation through `AbortController`.

Existing CLI behavior remains operational and is covered by regression tests.

## 8. State and Error Handling

The renderer derives state from events and small local view preferences. It does not maintain a second authoritative task state.

Errors are classified as:

- Setup: missing API key, inaccessible workspace, invalid `.loom/config.json`.
- Model: provider authentication, timeout, malformed tool call, cancellation.
- Tool: invalid arguments, path policy, shell denial, nonzero command.
- Verification: continue, blocked, failed check, insufficient evidence.
- Desktop bridge: rejected IPC validation, renderer disconnect, closed window.

Errors appear beside the operation that failed. A compact task-level failure summary is shown only when the task cannot continue. Event details remain replayable.

## 9. Interaction and Motion

- Standard hover and focus transitions use 160ms ease-out.
- Panel open/close uses 220ms spatial transitions.
- Thinking uses a quiet rotation/pulse and no bouncing or decorative choreography.
- New timeline items fade and translate no more than 4px.
- `prefers-reduced-motion` replaces continuous animation with a static “Thinking” label and removes movement transitions.
- All icon-only controls have accessible names and visible 2px focus rings.
- Keyboard focus is never hidden behind the approval surface.
- Color is not the only state indicator; every status includes text or shape.

## 10. Testing and Acceptance

### Core regression

- Existing `pnpm build`, `pnpm typecheck`, and `pnpm test` remain green.

### Renderer unit tests

- Event projection into Agent Console states.
- Full reasoning rendering and no fabricated reasoning fallback.
- Approval surface actions and keyboard navigation.
- Tool output progressive disclosure.
- Verified, continue, blocked, failed, and cancelled status rendering.

### IPC contract tests

- Renderer can only call allowlisted methods.
- Zod rejects malformed paths, task IDs, approval decisions, and event payloads.
- API Key cannot appear in IPC payloads or serialized renderer state.
- Persist-before-publish ordering for StreamingEventStore.

### Electron end-to-end tests

- Open a fixture repository.
- Start a task using a fake provider.
- Observe reasoning, search, read, edit, shell approval, verification, and final state.
- Approve and deny shell commands.
- Cancel a running task.
- Relaunch and replay a task from JSONL.

### Visual and accessibility acceptance

- Screenshot checks at 1440×900, 1280×800, and 1024×768.
- Keyboard-only task creation, panel navigation, approval, and cancellation.
- Visible focus at 3:1 non-text contrast minimum.
- Body text at 4.5:1 contrast minimum.
- Reduced-motion test.
- No horizontal overflow at the minimum supported window.
- No emoji structural icons, remote fonts, generic connection indicators, or editor status-bar noise.

## 11. Success Criteria

Loom Desktop v0.1 is complete when a user can open a repository, submit a coding task, watch the real Agent Loop progress, inspect changed code, approve a shell command, see Verification evidence, cancel or resume the task, and replay its durable event history without using the terminal.
