import type { ToolSchema } from "../model/types.js"
import { createReadFileTool } from "./read-file.js"
import { createSearchTool } from "./search.js"
import type { ToolContext, ToolDefinition, ToolResult } from "./types.js"

export class DefaultToolRegistry {
  private readonly tools: ToolDefinition<unknown>[]
  constructor(tools: ToolDefinition<unknown>[] = [createReadFileTool(), createSearchTool()] as ToolDefinition<unknown>[]) { this.tools = tools }
  schemas(): ToolSchema[] { return this.tools.map((tool) => tool.openAiSchema) }
  async execute(name: string, context: ToolContext, input: unknown): Promise<ToolResult> {
    const tool = this.tools.find((candidate) => candidate.name === name)
    if (!tool) return { ok: false, content: `Unknown tool: ${name}` }
    const parsed = tool.schema.safeParse(input)
    if (!parsed.success) return { ok: false, content: `Invalid arguments for ${name}: ${parsed.error.message}` }
    return tool.execute(context, parsed.data)
  }
}
