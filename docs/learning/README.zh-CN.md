# Loom 学习路线（从能看懂到能改造）

Loom 当前全部使用 **TypeScript + Node.js**：

- TypeScript：代码语言，提供类型、接口和泛型，帮助我们约束 Agent 各层之间的契约。
- Node.js：运行时，负责文件、网络、子进程和异步任务。
- DeepSeek API：外部模型服务；它不会读取文件，也不会执行 shell。
- `zod`：运行时校验模型和配置生成的 JSON。
- `vitest`：测试框架，用来先写行为，再实现功能。

## 先建立一张调用地图

```text
用户任务
  ↓
AgentLoop（下一步调用模型还是工具？）
  ↓
ModelProvider（向 DeepSeek 请求）
  ↓
ModelResponse（文本或 ToolCall）
  ↓
ToolRegistry（查找工具 + 校验参数）
  ↓
read_file / search / edit_file / shell
  ↓
ToolResult（有限预览 + 可追溯原文）
  ↓
EventStore（追加事实）
  ↺ 回到 AgentLoop
```

目前还没有实现 AgentLoop，所以先把图中的外围边界看懂。下一阶段才会把这条回路真正连起来。

## 建议学习顺序

### 1. 先看类型，不要先看实现

按这个顺序打开：

1. `src/model/types.ts`
2. `src/tools/types.ts`
3. `src/events/types.ts`

重点理解 `interface`、联合类型 `|`、泛型 `<T>` 和可选字段 `?`。这些文件是在定义“模块之间说什么语言”。

### 2. 再看一个最小的纯边界模块

看 `src/model/deepseek.ts`：

1. `DeepSeekTransport` 是可替换的网络函数。
2. `DeepSeekProvider.complete()` 把 Loom 请求转换给 DeepSeek。
3. 返回时又把 DeepSeek 字段转换回 Loom 的统一格式。

先不要关心 SDK，先理解 Adapter：**外部世界的复杂格式被关在边界里**。

### 3. 再看工具执行链

看 `src/tools/registry.ts`，然后看 `src/tools/read-file.ts`：

```text
unknown input
  ↓ zod.safeParse
合法输入
  ↓ assertWorkspacePath
安全路径
  ↓ readFile
ToolResult
```

这里最重要的 Agent 原理是：**模型生成的内容是不可信输入，必须先校验再执行**。

### 4. 最后看事件记录

看 `src/events/store.ts`。把它理解成黑匣子：每一步发生了什么，都追加一条记录。Agent 中断后，未来可以通过这些事件恢复任务状态。

## 每次学习的固定方法

每次只学一个函数，按下面四问阅读：

1. 输入是什么？类型在哪里定义？
2. 它有没有改变外部世界（文件、网络、进程）？
3. 失败时返回什么？错误有没有被吞掉？
4. 哪个测试证明了它的行为？

读完后做一个小实验：故意改坏一行，运行对应测试，再恢复。你会比只读注释更快理解边界。

## 第一轮建议阅读任务

今天只看三个文件：

```text
src/model/types.ts
src/tools/registry.ts
src/safety/path-policy.ts
```

看完后你应该能回答：

- 为什么模型不能直接读文件？
- 为什么工具参数要校验两次（Provider 的 JSON 校验 + Registry 的 schema 校验）？
- 为什么路径要检查真实路径，而不是只检查字符串有没有 `..`？

如果这三个问题能回答，下一步再进入 AgentLoop；不要同时学习 Context Compiler、Verification 和 Desktop。
