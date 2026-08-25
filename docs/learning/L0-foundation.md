# L0：项目基础与 Event Log

## 这一层学什么

Loom 还没有 Agent Loop。我们先建立两个底座：运行配置和不可变事件记录。

配置回答：

- 当前操作哪个 workspace？
- 使用哪个 API Key？
- 任务最多调用多少次模型和工具？
- 验证命令是什么？

Event Log 回答：

- 任务发生过什么？
- 事件的顺序是什么？
- 进程中断后还能不能恢复？

## 为什么使用追加式 JSONL

每一行是一个独立事件。新事件只追加，不覆盖旧事件，因此可以按照顺序回放一次运行。

```text
task.created
step.started
tool.completed
verification.completed
```

以后 Conversation、Execution State 和指标都应该从这些事件投影出来，而不是各自维护互相可能冲突的状态。

## 故意失败实验

把 .loom/runs/<task-id>/events.jsonl 中的一行改成无效 JSON，再运行读取测试。Loom 必须报错，而不能静默跳过这一行；因为跳过事实会让恢复任务时产生错误判断。

## 与 Agent 的关系

Agent 的智能来自模型，但 Harness 的可靠性来自记录、边界和恢复能力。Event Store 是之后实现 Session、Resume、Replay 和 Context Objects 的基础。
