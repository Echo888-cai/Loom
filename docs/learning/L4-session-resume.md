# L4：Runtime、Replay 与 Resume

Runtime 是组合层：它把 Config、Provider、Registry、Runner、Verifier 和 AgentLoop 组装起来。

```text
CLI
 ↓
Runtime
 ├── Config
 ├── EventStore
 ├── ModelProvider
 ├── ToolRegistry
 ├── Verifier
 └── AgentLoop
```

Replay 不重新执行任何动作，只读取 JSONL 并打印事件序列。

Projection 则把事件转换成当前视图：状态、消息、调用次数、变更文件和验证证据。

Resume 使用 Projection 恢复消息边界和计数器，再从同一个 task ID 继续；不会重新追加 `task.created`。

这就是 Event Sourcing 的最小形式：事件是事实，状态是投影。
