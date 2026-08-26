# Loom 工程地图

这份地图回答一个问题：每个目录为什么存在，以及学习时应该先看什么。

## 1. Agent Core：真正的 Harness

`src/` 是 Loom 的核心，不依赖 Electron。

```text
src/runtime.ts              组装一次任务运行
src/agent/loop.ts           Observe → Decide → Act 循环
src/model/                  DeepSeek 适配和消息协议
src/context/                模型调用前的 Context Compiler
src/tools/                  read / edit / search / shell / finish-task
src/events/                 JSONL 事件日志和实时发布
src/verification/           Test / Build / Diff 等验证
src/safety/                 路径策略和 Shell 审批
src/state/                   从事件恢复可继续执行的状态
src/process/                子进程执行边界
src/cli/                    CLI 外壳，不是 Harness 核心
```

推荐阅读顺序：

```text
model/types.ts
  → model/deepseek.ts
  → tools/types.ts / tools/registry.ts
  → agent/loop.ts
  → events/store.ts
  → verification/verifier.ts
  → runtime.ts
```

## 2. Electron Backend：后端宿主

`apps/desktop/src/backend/` 是桌面端的高权限区域。

```text
index.ts                 Electron 启动和依赖装配
task-service.ts          启动、取消、恢复、回放任务
workspace-service.ts     安全选择仓库、列文件、读文件、列历史任务
ipc.ts                   Backend 端的输入验证和白名单路由
approval-gate.ts         Shell 审批等待点
window.ts                BrowserWindow 安全配置
```

这里可以访问文件系统、Shell 和 API Key。Renderer 不应该直接拥有这些权限。

## 3. Bridge / Shared：唯一的窄桥

```text
apps/desktop/src/shared/contracts.ts   Zod 输入输出协议
apps/desktop/src/shared/channels.ts    IPC channel 白名单
apps/desktop/src/bridge/bridge.ts      暴露给 window.loom 的最小 API
apps/desktop/src/bridge/index.ts       Electron contextBridge 入口
```

这层的原则是：

```text
Renderer 想做什么
  → 通过已声明的 API 请求
  → Bridge 验证
  → Backend 再验证
  → 返回值再次验证
```

## 4. Frontend：低权限桌面界面

`apps/desktop/src/frontend/src/` 只负责显示状态和接收用户操作。

```text
App.tsx                       订阅持久化任务事件
state/task-store.ts           UI 缓存和当前选择
state/event-projection.ts     事件 → Agent Console 状态

features/shell/               工作台布局、命令面板、仓库标题
features/explorer/            文件树和历史任务
features/code/                只读代码、Tab、Diff
features/agent/               Thinking、工具活动、审批、验证
features/task/                新任务、取消、任务状态
components/                   可复用视觉组件
styles/                       颜色、间距、动效和全局布局
```

Frontend 的状态是“可重建的视图状态”，不是任务真相。任务真相永远来自 `.loom/runs/<taskId>/events.jsonl`。

## 5. Tests：每层各测什么

```text
tests/                        Agent Core 的模型、工具、Loop、验证测试
apps/desktop/tests/backend/   Backend、IPC、路径安全、任务生命周期
apps/desktop/tests/bridge/    窄桥 API 是否越权
apps/desktop/tests/frontend/  工作台和事件投影
apps/desktop/e2e/              真实 Electron 启动冒烟测试
```

## 6. 当前 Context Compiler 的位置

现在的实现是：

```text
src/context/compiler.ts
  FullHistoryCompiler
  → 原样保留全部消息
```

这不是最终能力，而是一个稳定的替换点。后续 Context Filter 会在这里加入：

```text
Context Pool
  → relevance
  → freshness
  → importance
  → token budget
  → Working Set
```

原始工具输出仍然保存在 `.loom/runs/<taskId>/raw/`，Context Engine 只决定这一轮展示给模型多少。

## 7. 学习路线

```text
第一阶段  ModelMessage / ToolCall / ToolResult
第二阶段  AgentLoop 的状态机
第三阶段  Event Store 和 Resume
第四阶段  Verification 为什么比模型的 Done 可靠
第五阶段  Context Compiler / Context Filter
第六阶段  Execution Frontier 和长期任务状态
```
