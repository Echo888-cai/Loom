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
