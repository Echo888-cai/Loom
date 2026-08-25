// Tool 模块依赖模型能理解的 schema，但不依赖具体的 DeepSeek Provider。
import type { ToolSchema } from "../model/types.js"
import type { z } from "zod"

// 每次工具调用都拿到的运行时上下文；工具不需要自己查全局变量。
export interface ToolContext {
  workspaceRoot: string
  taskId: string
  signal: AbortSignal
  maxOutputChars: number
  rawDir: string
}

// 工具结果同时服务两个方向：content 给模型，metadata/rawRef 给运行时和审计。
export interface ToolResult {
  ok: boolean
  content: string
  rawRef?: string
  metadata?: Record<string, unknown>
}

// 一个 ToolDefinition 把四件事绑在一起：名字、模型 schema、输入校验、实际执行函数。
export interface ToolDefinition<I> {
  name: string
  description: string
  schema: z.ZodType<I>
  openAiSchema: ToolSchema
  execute(context: ToolContext, input: I): Promise<ToolResult>
}
