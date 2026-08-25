/** Agent Loop 的资源上限，防止模型无限循环或无限消耗费用。 */
export type AgentLimits = {
  maxModelCalls: number
  maxToolCalls: number
  maxDurationMs: number
  maxToolOutputChars?: number
}

/** 一次运行过程中的计数器；只存在内存，不是持久化状态。 */
export type LimitState = {
  modelCalls: number
  toolCalls: number
  startedAt: number
}

/**
 * 检查当前运行是否应该停止。
 * 四问：输入是计数、开始时间、上限和取消信号；无外部副作用；返回停止原因而不是抛错；由 AgentLoop 测试间接验证。
 */
export function getLimitReason(state: LimitState, limits: AgentLimits, signal?: AbortSignal): string | undefined {
  if (signal?.aborted) return "cancelled"
  if (state.modelCalls >= limits.maxModelCalls) return "max_model_calls"
  if (state.toolCalls >= limits.maxToolCalls) return "max_tool_calls"
  if (Date.now() - state.startedAt >= limits.maxDurationMs) return "max_duration"
  return undefined
}
