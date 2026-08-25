// Tool 模块依赖模型能理解的 schema，但不依赖具体的 DeepSeek Provider。
import type { ToolSchema } from "../model/types.js"
import type { z } from "zod"
import type { EventStore } from "../events/types.js"
import type { ApprovalGate } from "../safety/approval.js"
import type { CommandRunner } from "../process/runner.js"
import type { Verifier } from "../verification/types.js"

/**
 * 每次工具调用拿到的运行时上下文。
 * 四问：输入是 workspace/task/取消信号/输出预算/raw 目录；本接口无副作用；错误由工具执行返回；各工具测试构造它。
 */
// 每次工具调用都拿到的运行时上下文；工具不需要自己查全局变量。
export interface ToolContext {
  workspaceRoot: string
  taskId: string
  signal: AbortSignal
  maxOutputChars: number
  rawDir: string
  eventStore?: EventStore
  approvalGate?: ApprovalGate
  commandRunner?: CommandRunner
  verifier?: Verifier
}

/**
 * 统一工具结果。
 * 四问：输入来自工具执行；本类型无副作用；失败用 ok=false 表达；read/search 测试验证 content、metadata、rawRef。
 */
// 工具结果同时服务两个方向：content 给模型，metadata/rawRef 给运行时和审计。
export interface ToolResult {
  ok: boolean
  content: string
  rawRef?: string
  metadata?: Record<string, unknown>
}

/**
 * 一个工具的完整定义。
 * 四问：输入是未知模型参数，先经 zod schema；真正副作用只发生在 execute；失败返回 ToolResult/reject；Registry 测试验证入口行为。
 */
// 一个 ToolDefinition 把四件事绑在一起：名字、模型 schema、输入校验、实际执行函数。
export interface ToolDefinition<I> {
  name: string
  description: string
  schema: z.ZodType<I>
  openAiSchema: ToolSchema
  execute(context: ToolContext, input: I): Promise<ToolResult>
}

export interface ToolRegistry {
  schemas(): ToolSchema[]
  execute(name: string, context: ToolContext, input: unknown): Promise<ToolResult>
}
