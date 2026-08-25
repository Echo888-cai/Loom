# L7：Benchmark 与 Harness 评估

Harness 不能只凭感觉判断变好了。

Benchmark 固定 repo commit、任务和模型，然后比较不同 Harness 版本：

```text
任务是否 Verified？
用了多少模型调用？
用了多少工具调用？
重复读取了多少次？
消耗多少 token？
```

最重要的护栏是：

> 不能为了省 Token 牺牲任务质量。

后续 Context Filter、Execution Frontier 和 Context Compiler 都应该在 Benchmark 上比较，而不是只看一次成功演示。
