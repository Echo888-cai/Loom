# Loom v0.0 设计方案

## 状态

本设计于 2026-08-24 经对话确认。本文定义 Loom 第一个可独立运行的 Coding Agent Harness，以及将它逐步发展为生产级 Harness 的学习路线。

## 目标与范围

Loom 是一个开放、Context-native 的 Coding Agent Harness。v0.0 只支持一个本地 macOS 代码仓库、一个 CLI，以及 DeepSeek 这一种模型提供商。

Loom 自己负责 Agent Loop、工具执行、事件历史、安全边界和完成验证，不依赖 Codex Runtime 或 DeepSeek Harness Runtime。

v0.0 的退出标准是：在一个真实的小型代码仓库中，Loom 无需人工复制粘贴即可完成一次 Bug Fix：读取和搜索代码、修改文件、运行测试、根据失败结果继续迭代，并生成可回放的 Verified 任务记录。

暂不做：

- Desktop
- 多模型提供商
- Multi-agent
- Cloud Agent
- Browser Agent 与 Mobile
- 团队协作、Marketplace、SaaS、Enterprise
- v0.0 的通用插件系统

## 设计原则

1. 产品开发和学习使用同一套代码。每个里程碑都在稳定接口后替换简单实现，而不是制作一次性原型。
2. 模型只提出结构化动作；Loom 负责校验、授权、执行、记录和验证。
3. Event Log 是事实来源。Conversation、任务状态、指标和回放都是它的投影。
4. 模型的完成声明只是候选结果，不是事实。只有 Verification 才能产生 Verified。
5. 原始工具输出必须保留在本地。Context 缩减使用 Progressive Disclosure，不能静默丢弃信息。
6. 每个高风险能力都必须有边界、超时、取消路径和审计事件。

## 总体架构

~~~text
用户
  |
Loom CLI
  |
Agent Loop ---------------------- Event Store（追加式 JSONL）
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

稳定接口：

- AgentLoop：驱动 Turn 和 Step。
- ModelProvider：把 Loom 请求转换为 DeepSeek 调用，并标准化响应。
- Tool：提供 Schema 和执行函数，不能修改 Agent Loop 内部状态。
- EventStore：追加和读取不可变事件。
- ContextCompiler：构造下一次模型调用的 Working Set。
- Verifier：根据客观证据评估完成申请。

v0.0 使用一个包含多个聚焦模块目录的 Package，不引入插件框架。未来可以拆分模块，但不改变产品模型。

## 执行模型

~~~text
Task
└── Turn：一次用户输入，直到 Loom 交回控制权
    └── Step：一次模型请求及其工具调用
        └── Event：一个不可变事实
~~~

执行过程：

1. 创建 Task 和 Event Log。
2. 解析仓库根目录和 Loom 配置。
3. 生成当前模型输入。
4. 调用 DeepSeek。
5. 校验并授权每一个 Tool Call。
6. 执行工具、保留原始输出、生成有限长度的模型结果，并追加事件。
7. 继续当前 Step 或开始下一个 Step。
8. 如果模型请求 finish_task，进入 candidate_done 并启动验证。
9. 验证失败时，将证据返回 Agent Loop；验证成功时产生 task.verified。

状态机：

~~~text
created -> running -> waiting_approval -> running
running -> candidate_done -> verifying
verifying -> verified | verification_failed -> running | blocked | failed
running -> cancelled
~~~

finish_task 是一个控制工具。它的输入包含 summary、filesChanged、verificationClaim 和 remainingRisks，但不能直接把任务标记为 verified。

## Event Store 与状态

每次运行保存在：

~~~text
.loom/runs/<task-id>/
├── events.jsonl
├── raw/
├── snapshots/
└── summary.json
~~~

每个事件包含序号、时间戳、Task ID、类型和类型化 Payload。v0.0 的最小事件类型：

~~~text
task.created, turn.started, step.started,
model.requested, model.responded,
tool.requested, approval.requested, approval.resolved,
tool.started, tool.completed, file.changed,
verification.started, verification.completed,
step.completed, task.verified, task.blocked,
task.failed, task.cancelled
~~~

v0.0 投影出 Goal、Status、Current Step、Changed Files、Last Tool 和 Verification Evidence。

v0.2 再增加独立的 Execution Frontier 投影：

~~~text
Goal
Done
Current
Next
Constraints
Open Questions
Evidence
~~~

Event Log 支持任务恢复、回放、Token 和 Tool 指标统计，以及未来的 Context Objects。它是持久化事实来源；Conversation 和状态必须能够从它重新构建。

## Model Provider

DeepSeek 是 v0.0 唯一的模型提供商。使用其兼容 OpenAI 格式的 Chat Completions API：

~~~text
https://api.deepseek.com
~~~

支持结构化 Tool Calls，并在模型协议需要时传递 reasoning content。

API Key 来自：

~~~text
DEEPSEEK_API_KEY
~~~

它不能写入 Event Log。

Provider 错误统一分为：

- 可重试
- 不可重试
- 已取消
- Context 超限

重试次数和退避策略必须有限，并记录到 Event Log。

## 工具与安全

v0.0 精确提供五个模型可见工具：

- read_file：规范化 workspace 路径，支持行号范围；输出过长时保留完整原文并只给模型有限预览。
- search：使用带结构化参数的 rg；返回文件名、行号和有限上下文。
- edit_file：要求精确匹配且只能匹配一次；原子写入、记录修改前后 Hash，并生成 Diff。
- shell：在获得批准后，于 workspace 范围内的进程组中运行命令；捕获 stdout、stderr、退出码、耗时和截断信息。
- finish_task：向 Verification Engine 提交完成申请。

硬性边界：

- 所有文件路径都必须解析到仓库根目录以内。
- .git 和 .loom 不能由普通模型工具修改。
- Shell 命令必须有受限的 cwd 和超时。
- 超时或取消时终止完整进程组。
- 工具输出有最大大小限制，并保留头尾内容。
- 默认不把 DEEPSEEK_API_KEY 注入子进程环境。
- 每次批准、拒绝、超时、取消和路径拒绝都写入事件。
- 全局限制覆盖模型调用次数、工具调用次数、耗时和配置的费用上限。

默认 Shell 策略是显式审批。用户拒绝后，拒绝结果会作为结构化 Tool Result 返回，让 Agent 能够调整策略。

## Verification

v0.0 的验证器检查：

1. 是否请求过 finish_task。
2. git diff --check 是否通过。
3. 配置的验证命令是否执行成功并返回零退出码。
4. 命令结果和修改文件是否满足任务声明的约束。
5. 是否仍有未解决的安全或运行时错误。

如果没有配置测试命令，Loom 只能报告有限证据，不能声称完整验证。

v0.0 的验证逻辑是最小版本；v0.5 再将它升级为可插拔、多阶段的 Verification Engine。

## 源码复用

Loom 使用 DeepSeek Harness 和 Codex 两个上游项目，并分成三个复用层级。

### 直接依赖

- DeepSeek API
- 兼容 OpenAI API 的 JavaScript SDK
- Schema 校验、子进程、Diff 和 CLI 参数解析等通用开源库

### 选择性移植：DeepSeek Harness

- packages/llm/llm-deepseek：API 转换、SSE 和 Tool Call 映射
- packages/fs/tool-fs 与 tool-str-replace-editor：文件安全和编辑器行为
- packages/shell/tool-bash 与 tool-bash-persistent：进程生命周期
- packages/session/session-persistence-jsonl：持久化设计
- packages/sandbox/sandbox-local 与 sandbox-policy：未来的本地 Sandbox 行为

### 选择性移植：Codex

- codex-rs/apply-patch：未来的多文件 Patch 解析
- codex-rs/core/src/exec_policy 与 Sandbox 模块：审批和执行策略
- codex-rs/core/src/context_manager：未来的 Context 管理
- codex-rs/docs/protocol_v1.md：UI 与 Runtime 的事件边界参考

DeepSeek Harness 的 agent-loop 和 Codex 的 codex-core 在 v0.0 只作为学习参考，不作为运行时依赖。它们的完整 Runtime 耦合度太高，不适合直接作为 Loom 的核心。

仓库在 third_party/NOTICES.md 中记录固定的上游 Commit 和移植信息。DeepSeek Harness 使用 MIT License；Codex 使用 Apache-2.0。复制代码时保留原版权和许可证，并注明来源文件、Commit、许可证和 Loom 修改内容。

## 学习与交付约定

每个里程碑必须同时交付：

- 同一套代码中可运行的功能
- 单元测试和集成测试
- 对应 Agent 原理的中文说明
- 执行或数据流图
- 一次故意制造失败的实验
- 与 DeepSeek Harness 或 Codex 的源码对照
- Token、模型调用、工具调用和失败指标

教学路线：

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

产品路线：

~~~text
v0.0 Native Agent Loop
v0.1 Context Filter
v0.2 Execution Frontier
v0.3 Context Objects
v0.4 Context Compiler
v0.5 Verification Engine
v1.0 Complete Coding Harness
~~~

## 里程碑与验收

- L0：完成 DeepSeek 调用并记录使用量。
- L1：完成 read_file 和经过 Schema 校验的 Tool Result。
- L2：完成有边界的多步 Agent Loop。
- L3：完成读取、搜索、编辑、测试和迭代。
- L4：完成 JSONL 回放与中断恢复。
- L5：完成审批、路径限制、超时、取消和输出限制。
- L6：证明 candidate_done 不能绕过 Verification。
- L7：建立 Bug Fix、Test Fix、Small Feature 和 Refactor 固定任务集。

只有在 Loom 能完成一次真实小仓库 Bug Fix、无需手工复制粘贴、能持久化完整运行记录、能恢复中断任务、能执行安全限制，并生成带证据的 task.verified 时，v0.0 才算完成。

## Benchmark

第一组 Benchmark 固定仓库 Commit、任务和预期验证命令。

核心指标：

~~~text
Verified Work / Token
~~~

辅助指标：

- Task Success
- Verified Success
- Model Calls
- Tool Calls
- Input Tokens
- 重复读取次数
- Cost
- Failure Type

如果 Token 降低但 Verified 任务质量下降，则该优化不接受。

## 延后决策

等 v0.0 有真实数据后，再决定：

- Rust 与 TypeScript 的性能取舍
- Desktop
- 多模型提供商
- 完整插件模型
- 语义化 Context 排序
- Multi-agent 调度
- Cloud Execution

