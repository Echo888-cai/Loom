# L2：Agent Loop

Agent Loop 的最小模式是：

```text
Observe → Decide → Act → Observe
```

在 Loom 中：

- Observe：模型看到目标、历史消息和工具结果；
- Decide：模型返回文本或 Tool Call；
- Act：Registry 校验并执行工具；
- Observe：工具结果追加为 tool message，进入下一轮。

v0.0 的 `FullHistoryCompiler` 故意不压缩消息，只完整保留顺序。这样先学习循环的因果关系，再学习 Context Filter。

Agent Loop 有三个重要边界：

1. 模型输出不会直接执行，必须经过 Tool Registry；
2. 模型说完成只产生 `task.candidate_done`，不是 Verified；
3. 模型调用、工具调用和运行时间都有上限，避免无限循环。
