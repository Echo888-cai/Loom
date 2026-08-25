# L6：Verification

模型说 `Done` 只是一个候选结论，不是事实。

Loom 的完成链路是：

```text
模型调用 finish_task
        ↓
记录 summary / filesChanged / verificationClaim
        ↓
CommandVerifier
        ↓
git diff --check
        ↓
配置中的测试、构建或 lint 命令
        ↓
verified / continue / blocked
```

## 三种结果

### verified

所有必要检查通过，Agent Loop 才能返回 `verified`。

### continue

检查失败，但任务仍然可以继续。失败证据会作为 tool result 返回模型，模型应该根据证据继续修改。

### blocked

缺少验证命令、没有验证器或环境无法提供足够证据。此时不能假装成功。

## 为什么验证命令不经过模型审批

模型可以请求任意 shell 命令，但 Verification 使用的是 workspace 配置中的固定命令，例如：

```json
{
  "verificationCommands": ["pnpm test", "pnpm build"]
}
```

这是两种不同权限：

- Agent Shell：模型主动请求，可能需要用户审批；
- Verification：Harness 为判断完成而运行的固定检查。

Verification 仍然有超时、输出限制、workspace cwd 和净化环境。

## 为什么没有配置测试命令时是 blocked

`git diff --check` 只能检查补丁格式和空白错误，不能证明业务功能正确。

没有测试、构建或 lint 命令时，Loom 没有足够证据声明 verified，所以返回 blocked。

## 学习实验

1. 让 `git diff --check` 失败，观察状态变成 continue。
2. 让测试命令返回非零，观察证据如何回到模型。
3. 删除 verificationCommands，确认不会产生 verified。
4. 让模型调用 finish_task，但让验证命令失败，确认仍然不会产生 task.verified。
