/** Shell 在执行前向用户/策略层提交的请求。 */
export type ApprovalRequest = {
  command: string
  cwd: string
  timeoutMs: number
  reason: string
}

/** 只有明确 allow 才能启动子进程；缺少审批实现时默认 deny。 */
export type ApprovalDecision = "allow" | "deny"

/**
 * 审批层接口。
 * 四问：输入是命令、目录、超时和原因；接口本身无副作用；可以拒绝或 Promise reject；Shell 测试使用 FakeApproval。
 */
export interface ApprovalGate {
  request(input: ApprovalRequest): Promise<ApprovalDecision>
}
