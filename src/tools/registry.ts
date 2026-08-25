// Registry 是模型工具调用和本地实现之间的唯一入口。
import type { ToolSchema } from "../model/types.js"
import { createReadFileTool } from "./read-file.js"
import { createSearchTool } from "./search.js"
import { createEditFileTool } from "./edit-file.js"
import type { ToolContext, ToolDefinition, ToolResult } from "./types.js"

export class DefaultToolRegistry {
  private readonly tools: ToolDefinition<unknown>[]
  /**
   * 创建工具注册表。
   * 四问：输入是可选工具集合；构造无外部副作用；重复名字等配置问题目前由调用方负责；registry 测试验证默认集合。
   */
  constructor(tools: ToolDefinition<unknown>[] = [createReadFileTool(), createSearchTool(), createEditFileTool()] as ToolDefinition<unknown>[]) { this.tools = tools }
  /**
   * 返回给模型看的工具 schemas。
   * 四问：输入是注册表内部工具；无外部副作用；不会执行工具；registry 测试验证名称。
   */
  // 给 ModelProvider 的 tools 字段：模型只能知道注册过的工具。
  schemas(): ToolSchema[] { return this.tools.map((tool) => tool.openAiSchema) }
  /**
   * 执行模型请求的工具。
   *
   * 四问：
   * - 输入：模型返回的工具名、运行上下文、未知参数对象。
   * - 外部副作用：通过真实 ToolDefinition 可能读文件、写 raw 文件或启动进程。
   * - 失败方式：未知工具/参数错误返回 ok=false；工具自身未预期错误可以 reject。
   * - 测试位置：`tests/tools/registry.test.ts`，并由各工具测试覆盖具体执行。
   */
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
