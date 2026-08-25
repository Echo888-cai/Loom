# Loom Benchmark

Benchmark 的基本单位是固定的：

```text
同一个 repo commit + 同一个 task prompt + 同一个 model
```

每次运行记录：

- Task Success；
- Verified Success；
- Model Calls；
- Tool Calls；
- Input Tokens；
- 重复读取次数；
- Cost；
- Failure Type。

核心指标：

```text
Verified Work / Token
```

不能为了减少 token 牺牲 verified success。

`tasks.json` 只放可复现任务定义，不放 API Key，也不放运行结果。运行结果留在每个 workspace 的 `.loom/runs/<task-id>/events.jsonl`。
