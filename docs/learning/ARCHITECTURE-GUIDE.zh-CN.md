# Loom 架构说明书：先理解为什么，再看怎么写

这份说明书不要求你会写代码。你需要先建立一张整体地图：Loom 为什么存在、每一层负责什么、它们如何协作。

## 1. Loom 到底是什么

Loom 不是聊天窗口，也不是简单的“用户问题 → 模型回答”。

它是一个 Coding Agent Harness：负责让模型持续、受控、可验证地完成编程任务。

模型本身主要负责：

- 理解用户目标；
- 分析代码和结果；
- 提出下一步行动。

Loom 负责：

- 给模型提供正确的信息；
- 执行模型提出的工具请求；
- 记录任务进行到哪里；
- 控制安全边界；
- 判断任务是否真的完成。

一句话：

> 模型负责想，Loom 负责让它安全、连续、可验证地做事。

## 2. 为什么需要 Agent Loop

模型不会天然知道项目有哪些文件，也不能自己访问电脑。修复一个 Bug 通常需要多轮行动：

```text
理解任务
  ↓
搜索代码
  ↓
读取文件
  ↓
提出修改
  ↓
运行测试
  ↓
观察失败
  ↓
继续修改
  ↓
验证完成
```

这个“观察 → 行动 → 再观察”的循环就是 Agent Loop。

如果只有一次模型调用，得到的是回答；如果有一个受控循环，才可能完成真实开发任务。

## 3. Loom 的总体结构

```text
用户
 ↓
Agent Loop
 ├── Model Provider       问模型下一步做什么
 ├── Context Engine       决定模型这一轮看到什么
 ├── State Engine         记录任务做到哪里
 ├── Tool Registry        决定模型能调用哪些工具
 ├── Safety Policy        防止工具越界
 ├── Event Store          保存每一步发生过什么
 └── Verification         判断是否真的完成
```

可以把它类比成一个软件团队：

| Loom 部件 | 类比 | 作用 |
|---|---|---|
| Model | 思考者 | 分析问题、提出下一步 |
| Agent Loop | 项目负责人 | 决定是否继续、调用什么、何时停止 |
| Context | 工作资料 | 提供当前决策需要的信息 |
| Tools | 工程师的手 | 读文件、改代码、执行命令 |
| State | 项目看板 | 记录目标、已完成、当前、下一步 |
| Event Store | 黑匣子 | 记录实际发生过的事件 |
| Verification | 验收流程 | 用测试和构建确认结果 |

## 4. 为什么 Loom 独立于 Codex

Codex 是重要的学习对象和代码来源，但不是 Loom 的运行依赖。

原因是：

1. 如果直接依赖 Codex Runtime，我们只能学会调用它，学不会 Harness 内部原理。
2. Loom 需要自己设计 Context、State、Tools 和 Verification。
3. 未来可以选择性复用 Codex 的优秀实现，但必须先理解它解决的问题。

我们对每段上游代码都问三个问题：

```text
它解决了什么问题？
为什么这样解决？
是否适合 Loom？
```

## 5. 为什么先用 TypeScript 和 Node.js

当前 Loom 全部使用 TypeScript，运行在 Node.js 上。

TypeScript 的主要作用不是“让代码更酷”，而是定义模块之间的合同：

- 模型请求必须包含什么；
- 工具输入必须包含什么；
- 事件记录必须包含什么；
- 工具结果应该长什么样。

Node.js 提供 v0.0 所需的运行能力：

- 读写文件；
- 调用 DeepSeek API；
- 启动 Shell 子进程；
- 管理异步任务和取消信号。

以后如果某个模块需要极致性能，可以单独用 Rust 重写；现在先不增加语言复杂度。

## 6. 为什么需要 Model Provider

Agent Loop 不直接依赖 DeepSeek SDK，而是经过一层 Provider：

```text
Agent Loop
    ↓ Loom 自己的 ModelRequest
Model Provider
    ↓ DeepSeek API 格式
DeepSeek
```

不同模型厂商的字段和错误格式不同。Provider 把外部差异关在边界里：

```text
DeepSeek 原始响应 → Provider → Loom 统一响应
```

这样 Agent Loop 只理解“文本、工具调用、用量、错误”，不需要知道 DeepSeek 的具体字段名。

## 7. 为什么模型不能直接读文件和执行 Shell

模型输出是不可信输入。它可能生成错误的工具名、错误 JSON、越界路径或危险参数。

正确流程是：

```text
模型：请求调用 read_file
  ↓
Registry：工具是否存在？
  ↓
Registry：参数是否合法？
  ↓
Safety：路径是否位于 workspace？
  ↓
Loom：真正读取文件
  ↓
Loom：返回结果给模型
```

模型只能提出请求，Loom 才拥有执行权。

## 8. 为什么需要 Tool Registry

Tool Registry 是模型请求和真实执行之间的闸门。

它统一做三件事：

```text
1. 检查工具是否存在
2. 校验参数是否符合 schema
3. 通过后才执行真实函数
```

没有 Registry，工具调用会散落在 Agent Loop 里，难以增加新工具、统计调用、统一处理错误，也容易意外暴露未完成能力。

## 9. 为什么需要 Path Policy

模型可能请求读取：

```text
../secrets.txt
/Users/某个用户的私人文件
```

Path Policy 要确认路径最终是否真的位于当前 workspace 内。

它必须解析 symlink，因为：

```text
workspace/link.txt → 外部目录/secret.txt
```

字符串看起来在 workspace 内，真实文件却在外部。

`.git` 和 `.loom` 也被保护：前者是版本控制内部数据，后者是 Loom 的配置、运行记录和原始输出。Agent 不应该随意修改自己的审计记录。

## 10. 为什么工具输出不能全部塞给模型

测试输出可能有几万行。全部放进 Context 会造成：

- token 消耗增加；
- 无关日志占用模型注意力；
- 真正的错误被淹没；
- 长任务更容易遗忘目标。

因此 Loom 使用：

```text
完整结果 → 保存在本地
模型看到 → 有限预览
需要细节 → 通过 rawRef 展开
```

这叫 Progressive Disclosure，渐进式披露。它不是粗暴删除信息，而是默认只展示当前决策需要的信息，同时保留完整原文的追溯能力。

## 11. 为什么需要 Event Store

如果状态只保存在内存里，程序一退出，任务进度就丢失。

Loom 使用追加式事件日志：

```text
task.created
model.called
tool.called
tool.completed
test.completed
verification.completed
```

每个事件只追加，不修改过去记录。这样可以：

1. 查看任务实际发生过什么；
2. 进程中断后恢复；
3. 重新播放事件来重建状态；
4. 统计模型、工具和成本。

Event Store 是事实来源。Conversation 是对话视图，Execution State 是从事件整理出来的当前视图。

## 12. 为什么“模型说完成”不等于完成

模型说 `Done` 只是主观判断。Loom 还要检查：

```text
测试是否通过？
构建是否通过？
Lint 是否通过？
Diff 是否符合约束？
任务目标是否满足？
```

所以完成有两个阶段：

```text
模型提出完成候选
        ↓
Loom 执行验证
        ↓
Verified ✓
```

测试和构建是证据，模型的文字是意见。

## 13. 一个真实任务如何流动

用户说：

```text
修复登录接口返回 401 的问题，并运行相关测试。
```

理想流程是：

```text
创建任务
  ↓
记录目标
  ↓
询问 DeepSeek
  ↓
DeepSeek 请求 search
  ↓
Registry 校验参数
  ↓
Search 在 workspace 内执行
  ↓
返回精简结果
  ↓
DeepSeek 请求 read_file
  ↓
读取相关代码
  ↓
DeepSeek 请求 edit_file
  ↓
应用修改
  ↓
DeepSeek 请求 shell
  ↓
运行测试
  ↓
失败则继续，完成则 Verification
```

Agent Loop 的任务就是把这些步骤安全地连接起来。

## 14. 当前已经完成什么

已经完成：

- Runtime Config：读取 workspace、API Key 和限制；
- Event Store：保存 JSONL 事件；
- DeepSeek Provider：调用并转换 DeepSeek 响应；
- Tool Registry：注册和校验工具；
- Path Policy：限制文件访问范围；
- `read_file`：安全读取文件；
- `search`：安全搜索代码。

尚未完成：

- Agent Loop；
- `edit_file`；
- `shell` 安全运行时；
- Verification Engine；
- Resume；
- Context Compiler；
- Desktop。

所以当前代码是完整 Agent 的底座，还不是最终产品。

## 15. 你应该如何学习

不要先背语法，也不要一次看完所有文件。每次只学习一个设计问题：

### 为什么模型不能直接操作电脑？

因为模型输出不可信，必须由 Harness 校验并执行。

### 为什么需要 Provider？

为了隔离 DeepSeek 等供应商的外部格式，让 Agent Loop 保持稳定。

### 为什么需要 Registry？

为了统一工具名称检查、参数校验、错误处理和调用统计。

### 为什么需要 Event Store？

为了让任务可追溯、可恢复、可重放。

### 为什么需要 Verification？

因为模型的“我完成了”只是意见，测试和构建才是证据。

## 16. 接下来怎么推进

下一步只实现一个最小闭环：

```text
用户任务
  ↓
DeepSeek
  ↓
read_file / search
  ↓
工具结果返回 DeepSeek
  ↓
继续下一轮
```

先理解这个循环，再增加 edit、shell、verification 和 Context Compiler。

学习顺序应该是：

```text
工具
  → Agent Loop
  → State
  → Verification
  → Context
  → Context Compiler
```

这是从“模型如何行动”逐渐走向“Harness 如何变聪明”。
