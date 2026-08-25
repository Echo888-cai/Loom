// Registry 是模型工具调用和本地实现之间的唯一入口。
import type { ToolSchema } from "../model/types.js"
import { createReadFileTool } from "./read-file.js"
import { createSearchTool } from "./search.js"
import type { ToolContext, ToolDefinition, ToolResult } from "./types.js"

export class DefaultToolRegistry {
  private readonly tools: ToolDefinition<unknown>[]
  constructor(tools: ToolDefinition<unknown>[] = [createReadFileTool(), createSearchTool()] as ToolDefinition<unknown>[]) { this.tools = tools }
  // 给 ModelProvider 的 tools 字段：模型只能知道注册过的工具。
  schemas(): ToolSchema[] { return this.tools.map((tool) => tool.openAiSchema) }
  async execute(name: string, context: ToolContext, input: unknown): Promise<ToolResult> {
    // 第一步：按模型返回的名字查找工具。
    const tool = this.tools.find((candidate) => candidate.name === name)
    if (!tool) return { ok: false, content: `Unknown tool: ${name}` }
    // 第二步：校验模型生成的 arguments JSON 对应的对象。
    const parsed = tool.schema.safeParse(input)
    if (!parsed.success) return { ok: false, content: `Invalid arguments for ${name}: ${parsed.error.message}` }
    // 第三步：才允许进入真实文件系统/子进程操作。
    return tool.execute(context, parsed.data)
  }
}
