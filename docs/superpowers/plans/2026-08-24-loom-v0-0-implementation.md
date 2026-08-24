# Loom v0.0 Implementation Plan（实现计划）

> **For agentic workers:** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行本计划。每个步骤使用复选框跟踪。

**目标：** 在同一套 TypeScript 代码中实现一个独立、可恢复、可验证的 DeepSeek Coding Agent Loop，使 Loom 能完成一次真实小仓库 Bug Fix。

**架构：** 以 AgentLoop、ModelProvider、Tool、EventStore、ContextCompiler、Verifier 六个接口为长期边界。v0.0 使用单 Package 和简化实现，后续用更强的 Context、State 和 Verification 实现替换内部逻辑。

**技术栈：** Node.js 24.16+、TypeScript、pnpm 11、DeepSeek OpenAI-compatible API、OpenAI JavaScript SDK、Zod、Execa、Diff、Vitest、ripgrep。

**Spec：** docs/superpowers/specs/2026-08-24-loom-v0-0-design.zh-CN.md

## Global Constraints

- 仅支持 macOS arm64；当前开发环境为 macOS 26.5.2、Node.js 24.16、pnpm 11.19。
- v0.0 只接入 DeepSeek；API Key 只从 DEEPSEEK_API_KEY 读取，不能写入 Event Log 或子进程环境。
- Loom 不依赖 Codex Runtime 或 DeepSeek Harness Runtime。
- 模型可见工具严格限制为 read_file、search、edit_file、shell、finish_task。
- 所有路径必须位于 workspace 根目录以内；.git 和 .loom 受普通工具保护。
- 所有模型调用、工具调用、审批、拒绝、超时、取消、文件变化和验证结果都写入追加式 JSONL。
- finish_task 只能触发 Verification，不能直接产生 Verified。
- 每个任务先写失败测试，再写最小实现，再运行验证；每个任务独立提交。
- Shell 命令必须有超时、输出上限、进程组取消和审批接口。
- 不为节省 Token 静默丢弃原始工具输出；完整原文保存到本地 raw 目录。

---

### Task 1: 建立项目骨架、配置和 Event Store

**目标：** 建立可测试的 TypeScript 项目与最小公共类型，完成配置加载和 JSONL Event Store。

**Files:**

- Create: package.json
- Create: tsconfig.json
- Create: vitest.config.ts
- Create: src/types.ts
- Create: src/config.ts
- Create: src/events/types.ts
- Create: src/events/store.ts
- Create: tests/config.test.ts
- Create: tests/events/store.test.ts
- Create: docs/learning/L0-foundation.md

**Interfaces:**

~~~ts
export type RuntimeConfig = {
  workspaceRoot: string
  deepseekApiKey: string
  verificationCommands: string[]
  limits: {
    maxModelCalls: number
    maxToolCalls: number
    maxDurationMs: number
    maxToolOutputChars: number
  }
}

export type EventRecord<T = unknown> = {
  seq: number
  timestamp: string
  taskId: string
  type: string
  data: T
}

export interface EventStore {
  append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>>
  readAll(taskId: string): Promise<EventRecord[]>
}
~~~

- [ ] **Step 1: 写项目配置和测试脚本**

在 package.json 中加入 scripts：build=tsc -p tsconfig.json、test=vitest run、test:watch=vitest、typecheck=tsc --noEmit；加入依赖 openai、zod、execa、diff，开发依赖 typescript、vitest、tsx、@types/node。

- [ ] **Step 2: 写失败的配置测试**

在 tests/config.test.ts 测试：给定 workspaceRoot 和 DEEPSEEK_API_KEY，loadConfig 返回绝对路径、默认 limits 和空 verificationCommands；缺少 API Key 时抛出包含 DEEPSEEK_API_KEY 的错误。

- [ ] **Step 3: 运行配置测试确认失败**

运行：pnpm test -- tests/config.test.ts
预期：FAIL，因为 src/config.ts 尚未提供 loadConfig。

- [ ] **Step 4: 实现 loadConfig**

在 src/config.ts 中实现 loadConfig(cwd: string, env: NodeJS.ProcessEnv): RuntimeConfig。解析 .loom/config.json（不存在时使用默认值），用 realpath 规范化 workspaceRoot，拒绝空 API Key，并使用默认值 maxModelCalls=40、maxToolCalls=80、maxDurationMs=900000、maxToolOutputChars=12000。

- [ ] **Step 5: 写失败的 Event Store 测试**

在 tests/events/store.test.ts 中使用临时目录，append 两条事件，断言 seq 为 1、2，readAll 按顺序返回，重新创建 Store 后仍能读取相同事件。

- [ ] **Step 6: 实现 JSONL Event Store**

在 src/events/store.ts 中实现 FileEventStore。每次 append 使用 mkdir recursive、JSON.stringify 加换行、appendFile；seq 从现有行数恢复；readAll 逐行解析并拒绝损坏 JSON。事件目录为 .loom/runs/<task-id>/events.jsonl。

- [ ] **Step 7: 运行全部基础测试**

运行：pnpm typecheck && pnpm test
预期：PASS。

- [ ] **Step 8: 写学习笔记并提交**

在 docs/learning/L0-foundation.md 解释 JSONL、append-only、事实来源和 Projection。运行 git add . && git commit -m "feat: add Loom foundation and event store"。

---

### Task 2: 实现 DeepSeek Model Provider

**目标：** 通过 DeepSeek OpenAI-compatible Chat Completions 接口完成文本和结构化 Tool Call 的标准化。

**Files:**

- Create: src/model/types.ts
- Create: src/model/deepseek.ts
- Create: tests/model/deepseek.test.ts
- Create: docs/learning/L0-provider.md

**Interfaces:**

~~~ts
export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string }

export type ToolCall = {
  id: string
  name: string
  argumentsJson: string
}

export type ToolSchema = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ModelRequest = {
  model: string
  messages: ModelMessage[]
  tools: ToolSchema[]
  signal?: AbortSignal
}

export type ModelResponse = {
  content: string | null
  toolCalls: ToolCall[]
  usage?: { inputTokens: number; outputTokens: number }
}

export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>
}
~~~

- [ ] **Step 1: 写 Provider 标准化测试**

在 tests/model/deepseek.test.ts 注入一个 fake transport：返回 assistant content、一个 tool_call 和 usage；断言 DeepSeekProvider 将 name、arguments JSON 和 token usage 转换成 Loom 类型。

- [ ] **Step 2: 写失败测试**

增加 malformed arguments JSON、空 choices、API error 和 AbortSignal 取消测试。运行 pnpm test -- tests/model/deepseek.test.ts，预期至少一个 FAIL，因为 Provider 尚未实现。

- [ ] **Step 3: 定义可替换 Transport**

在 src/model/deepseek.ts 中定义 DeepSeekTransport：

~~~ts
type DeepSeekTransport = (
  request: ModelRequest,
  signal?: AbortSignal
) => Promise<RawDeepSeekResponse>

type RawDeepSeekResponse = {
  choices: Array<{
    message: {
      content: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        id: string
        type: "function"
        function: { name: string; arguments: string }
      }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}
~~~

生产 Transport 使用 OpenAI SDK，baseURL 固定为 https://api.deepseek.com；测试 Transport 使用内存 fake。

- [ ] **Step 4: 实现 DeepSeekProvider**

实现 DeepSeekProvider.complete：将 ModelMessage 转成 API messages，将 ToolSchema 转成 function tools，读取 choices[0].message，解析 tool_calls.arguments，保留 reasoning_content 到响应元数据，映射 usage.prompt_tokens 和 usage.completion_tokens；对空 choices、非法 JSON 和 API 错误抛出带类别的错误。

- [ ] **Step 5: 运行 Provider 测试**

运行：pnpm test -- tests/model/deepseek.test.ts
预期：PASS。

- [ ] **Step 6: 写学习笔记并提交**

在 docs/learning/L0-provider.md 解释 Message Role、Tool Call、Tool Result、Provider Adapter 和为什么模型不执行工具。提交 git add . && git commit -m "feat: add DeepSeek model provider"。

---

### Task 3: 建立 Tool Contract，并实现 read_file 和 search

**目标：** 建立统一 Tool Registry，完成受 workspace 限制的文件读取和 rg 搜索。

**Files:**

- Create: src/tools/types.ts
- Create: src/tools/registry.ts
- Create: src/safety/path-policy.ts
- Create: src/tools/read-file.ts
- Create: src/tools/search.ts
- Create: tests/safety/path-policy.test.ts
- Create: tests/tools/read-file.test.ts
- Create: tests/tools/search.test.ts
- Create: docs/learning/L1-tools.md

**Interfaces:**

~~~ts
export type ToolContext = {
  workspaceRoot: string
  taskId: string
  signal: AbortSignal
  maxOutputChars: number
  rawDir: string
}

export type ToolResult = {
  ok: boolean
  content: string
  rawRef?: string
  metadata?: Record<string, unknown>
}

export type ToolDefinition<I> = {
  name: string
  description: string
  schema: z.ZodType<I>
  openAiSchema: ToolSchema
  execute(context: ToolContext, input: I): Promise<ToolResult>
}

export interface ToolRegistry {
  schemas(): ToolSchema[]
  execute(name: string, context: ToolContext, rawInput: unknown): Promise<ToolResult>
}
~~~

- [ ] **Step 1: 写路径安全失败测试**

测试 workspaceRoot=/tmp/repo 时允许 /tmp/repo/src/a.ts，拒绝 /tmp/other/a.ts、../other/a.ts、符号链接解析后越界的路径，以及 .git 和 .loom。

- [ ] **Step 2: 实现 path-policy**

在 src/safety/path-policy.ts 中用 realpath、resolve 和 relative 实现 assertWorkspacePath(root, requested, options)。返回规范化绝对路径；越界或受保护目录抛出 PathPolicyError。

- [ ] **Step 3: 写 read_file 失败测试**

测试读取完整文件、指定 startLine/endLine、文件不存在、路径越界和超过 maxOutputChars 时返回截断预览并保留 truncation metadata。

- [ ] **Step 4: 实现 read_file**

使用 node:fs/promises.readFile 和 path-policy；按行切片；输出超过限制时保留头部和尾部，中间以明确标记表示，并返回 byteLength、lineCount、truncated。完整文本写入 ToolContext.rawDir/read-file-<seq>.txt，并在 Tool Result 中返回 rawRef。

- [ ] **Step 5: 写 search 失败测试**

创建临时仓库和两个匹配文件，断言 search 返回文件名、行号和匹配上下文；测试无匹配和 rg 不存在时的错误。

- [ ] **Step 6: 实现 search**

使用 execa 调用 rg --line-number --with-filename --color never，并把 query、globs、cwd 作为独立参数传入；禁止拼接任意 shell 字符串；将完整 stdout 写入 ToolContext.rawDir/search-<seq>.txt，将有限结果解析成模型预览并返回 rawRef。

- [ ] **Step 7: 实现 Registry 并运行测试**

注册 read_file 和 search；未知工具返回结构化错误；运行 pnpm typecheck && pnpm test，预期 PASS。

- [ ] **Step 8: 写学习笔记并提交**

在 docs/learning/L1-tools.md 解释 Schema、Tool Contract、路径规范化、为什么 search 不能接受任意 shell 字符串。提交 git add . && git commit -m "feat: add safe read and search tools"。

---

### Task 4: 实现最小 Agent Loop

**目标：** 让模型、Tool Registry 和 Event Store 形成有上限的多步执行闭环。

**Files:**

- Create: src/agent/loop.ts
- Create: src/agent/limits.ts
- Create: src/context/compiler.ts
- Create: tests/agent/loop.test.ts
- Create: tests/context/compiler.test.ts
- Create: docs/learning/L2-agent-loop.md

**Interfaces:**

~~~ts
export interface ContextCompiler {
  compile(input: {
    goal: string
    messages: ModelMessage[]
  }): ModelMessage[]
}

export class FullHistoryCompiler implements ContextCompiler {
  compile(input: { goal: string; messages: ModelMessage[] }): ModelMessage[]
}
~~~

~~~ts
export type RunRequest = {
  taskId: string
  goal: string
  workspaceRoot: string
}

export type RunResult = {
  taskId: string
  status: "candidate_done" | "verified" | "blocked" | "failed" | "cancelled"
  steps: number
  modelCalls: number
  toolCalls: number
}

export class AgentLoop {
  run(request: RunRequest): Promise<RunResult>
}
~~~

- [ ] **Step 1: 写 Context Compiler、fake provider、fake tools 和失败测试**

在 tests/context/compiler.test.ts 断言 FullHistoryCompiler 保留 system、user、assistant 和 tool message 的原始顺序。在 tests/agent/loop.test.ts 创建按顺序返回 read_file tool call、search tool call、普通文本的 FakeProvider；创建 FakeRegistry；断言 Loop 将 assistant message 和 tool result 按顺序交回 Provider，并在达到 maxModelCalls 时返回 blocked。

- [ ] **Step 2: 运行测试确认失败**

运行：pnpm test -- tests/agent/loop.test.ts
预期：FAIL，因为 AgentLoop 尚未实现。

- [ ] **Step 3: 实现 FullHistoryCompiler 和第一版 Loop**

在 src/context/compiler.ts 中让 FullHistoryCompiler 返回完整历史，不做排序或压缩；在 src/agent/loop.ts 中实现：

~~~text
append task.created
messages = [system, user(goal)]
repeat until limit:
  append model.requested
  response = provider.complete(messages)
  append model.responded
  if response has no tool calls:
    return candidate_done
  append each tool.requested
  execute registry tool
  append tool.completed
  add assistant message and tool result
return blocked
~~~

第一版只把无 Tool Call 的自然语言结果标记为 candidate_done；Task 7 再注入 Verifier，把 finish_task 接入 verified/continue/blocked 状态。

- [ ] **Step 4: 加入 AbortSignal 和限额**

在 src/agent/limits.ts 中实现 modelCalls、toolCalls、duration 的检查；每次模型请求和工具执行前检查 signal；达到限制时追加 task.blocked 并返回结果。

- [ ] **Step 5: 验证事件顺序和上下文**

断言 Event Store 中的顺序为 task.created → model.requested → model.responded → tool.requested → tool.completed；断言下一次请求包含上一轮 assistant tool call 和 tool message。

- [ ] **Step 6: 运行测试并写学习笔记**

运行 pnpm typecheck && pnpm test。在 docs/learning/L2-agent-loop.md 解释 Observe → Decide → Act → Observe、Step、Turn、工具结果反馈和无限循环。提交 git add . && git commit -m "feat: add bounded agent loop"。

---

### Task 5: 实现安全 edit_file 和 Diff 记录

**目标：** 让 Loom 能可靠修改代码，并给后续测试迭代提供可观察 Diff。

**Files:**

- Create: src/tools/edit-file.ts
- Create: tests/tools/edit-file.test.ts
- Modify: src/tools/registry.ts
- Modify: src/events/types.ts
- Create: docs/learning/L3-edit-loop.md

**Interfaces:**

~~~ts
type EditFileInput = {
  path: string
  oldText: string
  newText: string
}

type EditFileResult = ToolResult & {
  metadata?: {
    changed: boolean
    beforeHash?: string
    afterHash?: string
    diff?: string
    matchCount?: number
  }
}
~~~

- [ ] **Step 1: 写失败测试**

覆盖精确一次匹配、零匹配、多次匹配、路径越界、受保护文件、保留文件末尾换行、原子写入失败不破坏原文件。

- [ ] **Step 2: 运行测试确认失败**

运行 pnpm test -- tests/tools/edit-file.test.ts，预期 FAIL。

- [ ] **Step 3: 实现精确替换**

使用 path-policy、readFile、字符串 match count；matchCount 不等于 1 时返回 ok=false，不写文件；等于 1 时写入临时文件后 rename。

- [ ] **Step 4: 记录 hash 和 unified diff**

使用 node:crypto 计算修改前后 SHA-256，使用 diff 库生成 unified diff；追加 file.changed 事件，并把 diff 放进 Tool Result metadata。

- [ ] **Step 5: 注册并集成 Agent Loop**

把 edit_file 的 OpenAI Schema 和执行函数加入 Registry；用集成测试验证模型连续调用 read_file → edit_file。

- [ ] **Step 6: 运行测试和学习实验**

运行 pnpm typecheck && pnpm test。在 docs/learning/L3-edit-loop.md 记录一次 oldText 多次匹配的失败实验，并解释为什么编辑工具必须拒绝猜测。提交 git add . && git commit -m "feat: add safe file editing"。

---

### Task 6: 实现 Shell、审批、超时和取消

**目标：** 提供受控 Shell 执行，同时保留完整原始输出和审计事件。

**Files:**

- Create: src/safety/approval.ts
- Create: src/safety/limits.ts
- Create: src/process/runner.ts
- Create: src/tools/shell.ts
- Create: tests/process/runner.test.ts
- Create: tests/tools/shell.test.ts
- Create: docs/learning/L5-safety-runtime.md

**Interfaces:**

~~~ts
export type ApprovalRequest = {
  command: string
  cwd: string
  timeoutMs: number
  reason: string
}

export type ApprovalDecision = "allow" | "deny"

export interface ApprovalGate {
  request(input: ApprovalRequest): Promise<ApprovalDecision>
}

export interface CommandRunner {
  run(input: {
    command: string
    cwd: string
    timeoutMs: number
    signal: AbortSignal
    env: NodeJS.ProcessEnv
  }): Promise<{
    stdout: string
    stderr: string
    exitCode: number | null
    timedOut: boolean
    durationMs: number
  }>
}
~~~

- [ ] **Step 1: 写 runner 失败测试**

测试成功命令、非零退出码、超时命令、AbortSignal 取消和 stdout/stderr 捕获；使用短命令，禁止测试依赖网络。

- [ ] **Step 2: 实现 CommandRunner**

使用 execa 或 node:child_process.spawn 启动 /bin/zsh -lc，cwd 固定为已验证 workspace，创建独立进程组；超时时发送终止信号并等待退出；限制收集到内存的字符数，同时把完整输出交给 raw sink。

- [ ] **Step 3: 写 shell tool 失败测试**

测试 approval=deny 不启动进程并返回结构化拒绝；approval=allow 返回 exitCode；命令超时返回 timedOut=true；子进程环境不包含 DEEPSEEK_API_KEY。

- [ ] **Step 4: 实现 shell tool**

在 shell tool 中先通过 ApprovalGate，再调用不负责审批的底层 CommandRunner；追加 approval.requested、approval.resolved、tool.started、tool.completed；将完整 stdout/stderr 写入 ToolContext.rawDir/shell-<seq>.log，返回有限预览和 rawRef。

- [ ] **Step 5: 运行安全测试**

运行 pnpm typecheck && pnpm test。增加路径越界、超时和取消的回归测试。

- [ ] **Step 6: 写学习笔记并提交**

在 docs/learning/L5-safety-runtime.md 解释模型能力与 Harness 权限的区别、进程组、超时、取消和审批。提交 git add . && git commit -m "feat: add approved shell runtime"。

---

### Task 7: 实现 finish_task 和 Verification

**目标：** 让 Loom 能区分模型完成声明与客观验证结果。

**Files:**

- Create: src/verification/types.ts
- Create: src/verification/verifier.ts
- Create: src/tools/finish-task.ts
- Create: tests/verification/verifier.test.ts
- Modify: src/agent/loop.ts
- Modify: src/tools/registry.ts
- Create: docs/learning/L6-verification.md

**Interfaces:**

~~~ts
export type VerificationResult = {
  status: "verified" | "continue" | "blocked"
  checks: Array<{
    name: string
    passed: boolean
    exitCode?: number | null
    output?: string
  }>
  evidence: string[]
}

export interface Verifier {
  verify(input: {
    taskId: string
    workspaceRoot: string
    filesChanged: string[]
    constraints: string[]
  }): Promise<VerificationResult>
}

export type FinishTaskInput = {
  summary: string
  filesChanged: string[]
  verificationClaim: string
  remainingRisks: string[]
}
~~~

- [ ] **Step 1: 写 verifier 失败测试**

覆盖 git diff --check 失败、验证命令返回非零、全部检查通过、没有配置测试命令时的 limited evidence，以及 command timeout。

- [ ] **Step 2: 实现基础 Verifier**

使用不经过模型审批的底层 CommandRunner 运行 git diff --check 和 RuntimeConfig.verificationCommands；这些命令来自本地配置而不是模型 Tool Call，仍然受 workspace、timeout、进程组和输出限制保护；每个检查追加 verification.started 和 verification.completed；全部必要检查通过才返回 verified；失败返回 continue 并带有精确 evidence。

- [ ] **Step 3: 写 finish_task 测试**

断言 finish_task 只会提交 FinishTaskInput，不能直接改变 task 状态；验证器返回 continue 时，Loop 会把失败证据作为下一条 tool result 返回模型。

- [ ] **Step 4: 实现 finish_task Tool**

验证 summary、filesChanged、verificationClaim、remainingRisks 的 Zod Schema；调用 Verifier；将结果映射为 tool result 和 task.verified/task.blocked 事件。

- [ ] **Step 5: 接入 Agent Loop**

当响应包含 finish_task 时停止普通工具循环，进入 candidate_done → verifying；verified 时返回 verified，continue 时重新进入 running，blocked 时保留事件并结束。若模型只返回自然语言而没有 finish_task，追加内部 finish_task_required 提示并继续运行；自然语言本身不能触发 Verification。

- [ ] **Step 6: 运行测试和故意失败实验**

运行 pnpm typecheck && pnpm test。创建一个故意失败的测试，确认模型调用 finish_task 仍不能产生 task.verified。写 docs/learning/L6-verification.md。提交 git add . && git commit -m "feat: gate completion with verification"。

---

### Task 8: 完成 CLI、Resume、Replay 和 Benchmark

**目标：** 把 Runtime 接入可使用 CLI，并满足 v0.0 的中断恢复、回放和指标验收。

**Files:**

- Create: src/runtime.ts
- Create: src/cli.ts
- Create: src/cli/approval.ts
- Create: src/cli/format.ts
- Create: src/state/projection.ts
- Create: src/run/resume.ts
- Create: src/index.ts
- Create: tests/runtime.integration.test.ts
- Create: tests/cli.integration.test.ts
- Create: .loom/config.example.json
- Create: benchmark/README.md
- Create: benchmark/tasks.json
- Create: docs/learning/L4-session-resume.md
- Create: docs/learning/L7-benchmark.md
- Modify: package.json

**Interfaces:**

~~~ts
export interface LoomRuntime {
  run(goal: string, cwd: string): Promise<RunResult>
  resume(taskId: string): Promise<RunResult>
  replay(taskId: string): Promise<EventRecord[]>
}

export type ResumeState = {
  taskId: string
  goal: string
  messages: ModelMessage[]
  turn: number
  step: number
  modelCalls: number
  toolCalls: number
}

export type CliCommands = "run" | "resume" | "replay"
~~~

- [ ] **Step 1: 写 Runtime 集成测试**

使用临时 Git 仓库和 FakeProvider，执行一个 read/search/edit/finish 流程；断言产生 events.jsonl、raw 目录和 summary.json。

- [ ] **Step 2: 实现 Runtime composition**

在 src/runtime.ts 组装 config、FileEventStore、DeepSeekProvider、ToolRegistry、ApprovalGate、CommandRunner、Verifier 和 AgentLoop；所有依赖通过构造函数注入，测试可以替换 Provider 和 Runner。

- [ ] **Step 3: 写 Resume 和 Projection 测试**

先运行一次 FakeProvider 任务，重新创建 Runtime，读取 Event Log，投影出 status、currentStep、changedFiles 和 evidence；断言 resume 不追加 task.created、不重复已完成的 tool call，并从最后一个未完成 Step 的消息边界继续。

- [ ] **Step 4: 实现 Projection 和 resume**

在 src/state/projection.ts 从 EventRecord[] 派生 RunState；在 src/run/resume.ts 加载事件、恢复 assistant/tool 消息边界和计数器；为 AgentLoop 增加 resume(request, state: ResumeState) 入口，该入口从现有 turn/step 继续，不重新追加 task.created。

- [ ] **Step 5: 写 CLI 集成测试**

测试命令：

~~~text
loom run "修复测试失败" --cwd /path/to/repo
loom resume <task-id>
loom replay <task-id>
~~~

断言无 API Key 时给出可读错误，run 输出 Task ID 和状态，replay 输出事件序列，拒绝 shell 时 CLI 展示 command、cwd、reason 并读取 allow/deny。

- [ ] **Step 6: 实现 CLI**

使用 node:util.parseArgs；src/cli/approval.ts 使用 readline 提供 allow/deny；src/cli/format.ts 格式化模型文本、工具调用、审批、验证证据和最终状态；src/index.ts 暴露 main 并在 package.json 增加 bin loom。

- [ ] **Step 7: 建立 Benchmark**

在 benchmark/tasks.json 固定任务字段：id、repo、commit、prompt、verificationCommands、expectedFiles；在 benchmark/README.md 说明运行方法和指标：Verified Work / Token、Task Success、Verified Success、Model Calls、Tool Calls、Input Tokens、重复读取次数、Cost、Failure Type。

- [ ] **Step 8: 运行 v0.0 验收**

运行 pnpm build && pnpm typecheck && pnpm test；用一个真实小型 Git 仓库完成一次 Bug Fix；手动终止后执行 loom resume；确认测试失败时没有 task.verified，测试通过时产生带 evidence 的 task.verified。

- [ ] **Step 9: 写学习笔记并提交**

在 docs/learning/L4-session-resume.md 解释 Event Sourcing、Projection、Replay 和 Resume；在 docs/learning/L7-benchmark.md 解释 Harness 评估和 Verified Work / Token。提交 git add . && git commit -m "feat: ship Loom v0.0 CLI harness"。

---

## 计划自检清单

- Spec 中的五个模型工具均有实现任务：Task 3、5、6、7。
- Agent Loop、Event Store、Model Provider、Tool Registry、Safety、Verification 和 CLI 均有明确文件与测试。
- v0.0 的中断恢复、回放、指标和 Benchmark 均在 Task 8 验收。
- 每个接口都在相邻任务中定义，后续任务引用的名称与前置任务一致。
- 计划没有依赖 Codex Runtime 或 DeepSeek Harness Runtime。
- 计划没有包含 Multi-agent、Desktop、Cloud 或其他已明确排除的功能。
