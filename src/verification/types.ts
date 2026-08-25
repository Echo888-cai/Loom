/**
 * 客观验证结果。
 * `verified` 表示所有必要检查通过，`continue` 表示可以继续修复，`blocked` 表示缺少证据或无法继续。
 */
export type VerificationResult = {
  status: "verified" | "continue" | "blocked"
  checks: Array<{
    name: string
    passed: boolean
    exitCode?: number | null
    output?: string
  }>
  evidence: string[]
}

/**
 * Verification 端口。
 * 四问：输入是任务、workspace、变更文件和约束；实现会运行检查产生子进程副作用；失败以 continue/blocked 返回；verifier 测试覆盖。
 */
export interface Verifier {
  verify(input: {
    taskId: string
    workspaceRoot: string
    filesChanged: string[]
    constraints: string[]
  }): Promise<VerificationResult>
}

/** 模型提交的完成候选，不代表已经验证通过。 */
export type FinishTaskInput = {
  summary: string
  filesChanged: string[]
  verificationClaim: string
  remainingRisks: string[]
}
