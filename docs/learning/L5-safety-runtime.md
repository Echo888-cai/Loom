# L5：Shell 安全运行时

Shell 是 Agent 最强也最危险的工具。`read_file` 最多泄露文件内容，`shell` 则可能删除文件、修改环境或访问网络。

因此 Shell 被拆成两层：

```text
ApprovalGate：允不允许运行？
       ↓ allow
CommandRunner：具体怎么运行？
```

`CommandRunner` 不拥有审批权，`Shell Tool` 不绕过审批直接启动进程。

## 当前保护措施

- 没有 ApprovalGate 时默认拒绝；
- 只能在当前 workspace 目录执行；
- 使用 `/bin/zsh -lc`，符合当前 macOS v0.0 目标；
- 有超时和 AbortSignal 取消；
- 子进程环境不包含 `DEEPSEEK_API_KEY`；
- stdout/stderr 完整保存到 raw 日志；
- 回传给模型的内容限制在 Context 预算内；
- 记录 approval、tool.started、tool.completed 事件。

## 为什么超时和取消是两件事

- 超时：Loom 主动判断命令运行太久，返回 `timedOut=true`。
- 取消：用户或上层任务主动停止，传播 `AbortSignal`，终止等待并抛出 `AbortError`。

两者都需要结束子进程，否则 Agent 表面停止，后台命令仍然可能继续运行。

## 为什么 API Key 不能进入子进程

Shell 命令是模型请求执行的。即使模型没有直接看到环境变量，命令也可能把环境打印出来或传给外部服务。

所以 Harness 的秘密必须和 Agent 的执行环境隔离。

## 当前尚未解决的问题

当前是 v0.0 最小安全边界，还没有：

- 图形化审批界面；
- 命令 allowlist；
- 网络访问沙箱；
- 独立操作系统用户；
- 完整进程组树清理。

这些能力要在真正允许生产环境使用前继续加强。
