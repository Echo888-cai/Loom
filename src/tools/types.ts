import type { ToolSchema } from "../model/types.js"
import type { z } from "zod"

export interface ToolContext {
  workspaceRoot: string
  taskId: string
  signal: AbortSignal
  maxOutputChars: number
  rawDir: string
}

export interface ToolResult {
  ok: boolean
  content: string
  rawRef?: string
  metadata?: Record<string, unknown>
}

export interface ToolDefinition<I> {
  name: string
  description: string
  schema: z.ZodType<I>
  openAiSchema: ToolSchema
  execute(context: ToolContext, input: I): Promise<ToolResult>
}
