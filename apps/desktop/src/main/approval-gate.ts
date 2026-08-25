import type { ApprovalDecision, ApprovalGate, ApprovalRequest } from "loom"

/**
 * 将一次 shell 审批悬挂在 Electron 主进程中，直到用户在桌面端选择允许或拒绝。
 *
 * 只有一个 pending request 是刻意限制：同一个 Agent 按顺序执行工具，第二个并发审批
 * 表明运行时或调用方违反了这个不变量，不能默默覆盖第一个用户决定。
 */
export class DesktopApprovalGate implements ApprovalGate {
  private pending: { input: ApprovalRequest; resolve: (decision: ApprovalDecision) => void } | undefined
  private disposed = false

  constructor(private readonly taskId: string) {}

  get pendingRequest(): ApprovalRequest | undefined {
    return this.pending?.input
  }

  request(input: ApprovalRequest): Promise<ApprovalDecision> {
    if (this.disposed) return Promise.resolve("deny")
    if (this.pending) return Promise.reject(new Error(`Task ${this.taskId} is already awaiting approval`))
    return new Promise<ApprovalDecision>((resolve) => {
      this.pending = { input, resolve }
    })
  }

  resolve(decision: ApprovalDecision): void {
    const pending = this.pending
    if (!pending) return
    this.pending = undefined
    pending.resolve(decision)
  }

  dispose(): void {
    this.disposed = true
    this.resolve("deny")
  }
}
