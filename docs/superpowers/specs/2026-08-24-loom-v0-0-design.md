# Loom v0.0 Design

## Status

Approved conversational design on 2026-08-24. This document defines the first independently runnable Loom coding harness and the learning path that grows it into a production-grade harness.

## Goal and scope

Loom is an open, context-native coding agent harness. v0.0 supports one local macOS repository, one CLI, and DeepSeek as the only model provider. Loom owns the Agent Loop, tool execution, event history, safety boundaries, and completion verification. It does not depend on Codex Runtime or DeepSeek Harness Runtime.

The v0.0 exit criterion is a real small-repository Bug Fix completed without manual copy/paste: Loom reads and searches code, edits a file, runs tests, reacts to failures, and records a replayable Verified run.

Out of scope: Desktop, multiple providers, multi-agent execution, cloud agents, browser/mobile agents, collaboration, marketplace, SaaS, enterprise, and a general plugin system.

## Principles

1. Product and learning share one codebase. Each milestone replaces a simple implementation behind a stable interface.
2. The model proposes structured actions; Loom validates, authorizes, executes, records, and verifies them.
3. The Event Log is the source of truth. Conversation, state, metrics, and replay are projections.
4. A model completion claim is a candidate, not proof. Only verification can produce Verified.
5. Raw tool output is retained locally. Context reduction uses progressive disclosure, never silent deletion.
6. Every risky capability has a boundary, timeout, cancellation path, and audit event.

## Architecture

~~~text
User
  |
Loom CLI
  |
Agent Loop ---------------------- Event Store (append-only JSONL)
  |
  +-- Context Compiler ----------- DeepSeek Provider
  |
  +-- Tool Registry
  |     +-- read_file
  |     +-- search
  |     +-- edit_file
  |     +-- shell
  |     +-- finish_task
  |
  +-- Verification Engine
~~~

Stable interfaces:

- AgentLoop drives turns and steps.
- ModelProvider converts Loom requests to DeepSeek calls and normalizes responses.
- Tool exposes a schema and execution function.
- EventStore appends and reads immutable events.
- ContextCompiler builds the next model working set.
- Verifier evaluates a completion request against objective evidence.

v0.0 uses focused module directories in one package, not a plugin framework. The boundaries remain stable so later releases can split modules without changing the product model.

## Execution model

~~~text
Task
└── Turn: one user input until Loom returns control
    └── Step: one model request plus its tool calls
        └── Event: one immutable fact
~~~

Execution:

1. Create a Task and Event Log.
2. Resolve repository root and Loom configuration.
3. Build the current model input.
4. Call DeepSeek.
5. Validate and authorize each Tool Call.
6. Execute, retain raw output, produce a bounded model-facing result, and append events.
7. Continue the Step or start the next Step.
8. A finish_task request enters candidate_done and starts verification.
9. Failed verification returns evidence to the loop; success emits task.verified.

Status machine:

~~~text
created -> running -> waiting_approval -> running
running -> candidate_done -> verifying
verifying -> verified | verification_failed -> running | blocked | failed
running -> cancelled
~~~

finish_task is a control tool. Its input contains summary, filesChanged, verificationClaim, and remainingRisks. It cannot directly mark a task verified.

## Event store and state

Each run is stored at .loom/runs/<task-id>/:

~~~text
events.jsonl
raw/
snapshots/
summary.json
~~~

Each event has sequence number, timestamp, task id, type, and typed payload. Minimum event types:

~~~text
task.created, turn.started, step.started,
model.requested, model.responded,
tool.requested, approval.requested, approval.resolved,
tool.started, tool.completed, file.changed,
verification.started, verification.completed,
step.completed, task.verified, task.blocked,
task.failed, task.cancelled
~~~

v0.0 projects goal, status, current step, changed files, last tool, and verification evidence. v0.2 adds the independent Execution Frontier projection: Goal, Done, Current, Next, Constraints, Open Questions, and Evidence.

## Model provider

DeepSeek is the only v0.0 provider. Use its OpenAI-compatible Chat Completions API at https://api.deepseek.com with structured Tool Calls and provider reasoning content when required. The key comes from DEEPSEEK_API_KEY and is never written to the Event Log.

Provider errors normalize into retryable, non-retryable, cancelled, and context-limit categories. Retry count and backoff are bounded and recorded.

## Tools and safety

v0.0 exposes exactly five tools:

- read_file: canonicalize a workspace path, support line ranges, cap previews, and retain full output when truncated.
- search: use rg with structured arguments; return file names, line numbers, and bounded context.
- edit_file: exact replacement with exactly one match; atomic write, before/after hashes, and diff.
- shell: run an approved command in a workspace-bound process group; capture stdout, stderr, exit code, duration, and truncation metadata.
- finish_task: submit a completion request to Verification.

Hard boundaries:

- All paths resolve within the repository root.
- .git and .loom are protected from ordinary model tools.
- Shell commands have bounded cwd and timeout.
- Timeout and cancellation terminate the full process group.
- Tool output has a maximum size and preserves head and tail.
- DEEPSEEK_API_KEY is excluded from child-process environments by default.
- Every approval, denial, timeout, cancellation, and path rejection is an event.
- Global limits cover model calls, tool calls, elapsed time, and configured spend.

The default shell policy is explicit approval. A denial becomes a structured tool result so the Agent can adapt.

## Verification

The v0.0 verifier checks:

1. finish_task was requested.
2. git diff --check passes.
3. Configured verification commands return exit code zero.
4. Results and changed files satisfy declared constraints.
5. No safety or runtime failure remains unresolved.

Without a configured test command, Loom reports limited evidence rather than claiming full verification. v0.5 will turn this minimum into a pluggable multi-stage Verification Engine.

## Source reuse

Loom uses DeepSeek Harness and Codex with three reuse levels.

Direct dependencies: DeepSeek API, the OpenAI-compatible JavaScript SDK, and generic libraries for schemas, subprocesses, diffing, and CLI parsing.

Selective migration from DeepSeek Harness:

- packages/llm/llm-deepseek for API translation, SSE, and tool-call mapping.
- packages/fs/tool-fs and tool-str-replace-editor for file safety and editor behavior.
- packages/shell/tool-bash and tool-bash-persistent for process lifecycle.
- packages/session/session-persistence-jsonl for persistence patterns.
- packages/sandbox/sandbox-local and sandbox-policy for later sandbox behavior.

Selective migration from Codex:

- codex-rs/apply-patch for later multi-file patch parsing.
- codex-rs/core/src/exec_policy and sandbox modules for approval policy.
- codex-rs/core/src/context_manager for later Context management.
- codex-rs/docs/protocol_v1.md for the UI/runtime event boundary.

DeepSeek Harness agent-loop and Codex codex-core are reference-only in v0.0. Their complete runtimes are too coupled to preserve Loom's independent loop and learning surface.

The repository records fixed upstream commits and migration metadata in third_party/NOTICES.md. DeepSeek Harness is MIT licensed; Codex is Apache-2.0. Copied code keeps original notices and identifies source file, commit, license, and Loom modifications.

## Learning and delivery contract

Every milestone delivers a runnable feature, tests, a Chinese explanation, a data-flow diagram, a deliberate failure experiment, an upstream source comparison, and token/model/tool/failure metrics.

Teaching progression:

~~~text
L0 Provider
L1 Structured Tool Call
L2 Agent Loop
L3 Edit/Test Loop
L4 Session and Resume
L5 Safety Runtime
L6 Basic Verification
L7 Benchmark
~~~

Product progression:

~~~text
v0.0 Native Agent Loop
v0.1 Context Filter
v0.2 Execution Frontier
v0.3 Context Objects
v0.4 Context Compiler
v0.5 Verification Engine
v1.0 Complete Coding Harness
~~~

## Milestones and acceptance

L0 proves a DeepSeek call and usage metrics. L1 proves read_file and schema-validated Tool Results. L2 proves a bounded multi-step loop. L3 proves read/search/edit/test iteration. L4 proves replay and resume from JSONL. L5 proves approval, path limits, timeout, cancellation, and output limits. L6 proves candidate_done cannot bypass verification. L7 establishes fixed repository tasks for Bug Fix, Test Fix, Small Feature, and Refactor.

v0.0 is accepted only when Loom can complete one real small-repository Bug Fix with no manual copy/paste, persist the full run, resume an interrupted task, enforce safety, and produce task.verified with evidence.

## Benchmark

The first benchmark fixes repository commits and tasks, with expected verification commands. Primary metric:

~~~text
Verified Work / Token
~~~

Secondary metrics: task success, verified success, model calls, tool calls, input tokens, duplicate reads, cost, and failure type. Token reduction is rejected if verified task quality declines.

Future decisions deferred until v0.0 evidence: Rust versus TypeScript performance trade-offs, Desktop, multiple providers, a plugin model, semantic Context ranking, multi-agent scheduling, and cloud execution.

