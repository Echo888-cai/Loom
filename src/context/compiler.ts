// ContextCompiler 是模型调用前的“上下文装配器”接口。
import type { ModelMessage } from "../model/types.js"

/**
 * 决定本轮模型看到哪些消息。
 * 四问：输入是目标和历史消息；本接口无副作用；实现可以因预算失败；当前由 compiler 测试验证顺序。
 */
export interface ContextCompiler {
  compile(input: { goal: string; messages: ModelMessage[] }): ModelMessage[]
}

/**
 * v0.0 的最简单上下文策略：完整保留历史。
 * 四问：输入是 goal/messages；无外部副作用；当前不会失败；`tests/context/compiler.test.ts` 验证原始顺序。
 * 后续 Context Engine 会替换这个实现，而 AgentLoop 不需要改变。
 */
export class FullHistoryCompiler implements ContextCompiler {
  compile(input: { goal: string; messages: ModelMessage[] }): ModelMessage[] {
    return [...input.messages]
  }
}

export type ContextCompilerOptions = { maxTokens: number }

/**
 * v0.1 的可解释预算策略：保留 system/goal，再从最新消息向前填充。
 * 这里用字符数近似 token（约 4 个字符≈1 token），目的是先建立稳定策略；
 * 真正 tokenizer 可以在后续替换，不影响 AgentLoop 的接口。
 */
export class BudgetedContextCompiler implements ContextCompiler {
  constructor(private readonly options: ContextCompilerOptions) {}

  compile(input: { goal: string; messages: ModelMessage[] }): ModelMessage[] {
    const [system, currentGoal] = input.messages
    const pinned = [system, currentGoal].filter((message): message is ModelMessage => message !== undefined)
    const remaining = input.messages.slice(pinned.length).reverse()
    let used = pinned.reduce((sum, message) => sum + estimateTokens(message), 0)
    const selected: ModelMessage[] = []

    for (const message of remaining) {
      const cost = estimateTokens(message)
      if (used + cost > this.options.maxTokens) continue
      selected.push(message)
      used += cost
    }

    return [...pinned, ...selected.reverse()]
  }
}

function estimateTokens(message: ModelMessage): number {
  const content = message.content ?? ""
  return Math.max(1, Math.ceil(content.length / 4))
}
