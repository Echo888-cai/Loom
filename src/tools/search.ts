// 搜索结果也可能很大，所以和 read_file 一样采用 preview + rawRef。
import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
// execa 负责安全地启动子进程；参数通过数组传递，不经过 shell 字符串拼接。
import { execa } from "execa"
import { z } from "zod"
import type { ToolDefinition } from "./types.js"

const inputSchema = z.object({ query: z.string().min(1), globs: z.array(z.string()).optional() })
type Input = z.infer<typeof inputSchema>

/**
 * 创建 search 工具定义。
 * 四问：输入是无状态工厂调用；创建阶段无副作用；真正错误在 execute 返回；search 测试覆盖匹配和无匹配。
 */
export function createSearchTool(): ToolDefinition<Input> {
  return {
    name: "search", description: "Search workspace text with ripgrep.", schema: inputSchema,
    openAiSchema: { type: "function", function: { name: "search", description: "Search workspace text with ripgrep.", parameters: { type: "object", properties: { query: { type: "string" }, globs: { type: "array", items: { type: "string" } } }, required: ["query"] } } },
    /**
     * 在 workspace 内执行 ripgrep。
     *
     * 四问：
     * - 输入：查询字符串、可选 glob、ToolContext。
     * - 外部副作用：启动 rg 子进程；结果过长时写 raw 文件。
     * - 失败方式：退出码 1 是正常“无匹配”；其他非零码返回 ok=false；取消会 reject。
     * - 测试位置：`tests/tools/search.test.ts`。
     */
    async execute(context, input) {
      // `--` 将参数和搜索词隔开，避免 query 以 `-` 开头时被当成 rg 选项。
      const args = ["--line-number", "--with-filename", "--color", "never", ...(input.globs ?? []).flatMap((glob) => ["--glob", glob]), "--", input.query, "."]
      // cancelSignal 让上层取消任务时能终止 rg 子进程。
      const result = await execa("rg", args, { cwd: context.workspaceRoot, reject: false, shell: false, cancelSignal: context.signal })
      // rg 的退出码 1 代表“没有匹配”，这是正常业务结果，不是工具崩溃。
      if (result.exitCode === 1) return { ok: true, content: "No matches found." }
      if (result.exitCode !== 0) return { ok: false, content: result.stderr || `Search failed with exit code ${result.exitCode}` }
      const output = result.stdout.trimEnd()
      if (output.length <= context.maxOutputChars) return { ok: true, content: output }
      await mkdir(context.rawDir, { recursive: true }); const rawRef = `${context.rawDir}/search-${randomUUID()}.txt`; await writeFile(rawRef, output)
      return { ok: true, content: `${output.slice(0, context.maxOutputChars)}\n...[truncated]...`, rawRef, metadata: { truncated: true } }
    },
  }
}
