// 文件读取使用 Promise API，不阻塞 Node.js 事件循环。
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { assertWorkspacePath, PathPolicyError } from "../safety/path-policy.js"
import type { ToolDefinition, ToolResult } from "./types.js"

// 这是运行时参数校验；模型输出的 JSON 不能直接信任。
const inputSchema = z.object({ path: z.string().min(1), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() })
type Input = z.infer<typeof inputSchema>

/**
 * 把工具输出压缩到 Context 预算以内。
 * 四问：输入是原始文本和最大字符数；无外部副作用；不会抛错但会标记 truncated；read_file 测试验证头尾和截断。
 */
// Context 预算有限：保留头部和尾部，中间折叠，并把完整内容落盘。
function bounded(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  const head = Math.ceil(max * 0.6), tail = Math.floor(max * 0.4)
  return { text: `${text.slice(0, head)}\n...[truncated]...\n${text.slice(-tail)}`, truncated: true }
}

/**
 * 创建 read_file 工具定义。
 * 四问：输入是无状态工厂调用；创建阶段无文件副作用；执行错误在 execute 中处理；read-file 测试覆盖其行为。
 */
export function createReadFileTool(): ToolDefinition<Input> {
  return {
    name: "read_file", description: "Read a file within the workspace.", schema: inputSchema,
    openAiSchema: { type: "function", function: { name: "read_file", description: "Read a file within the workspace.", parameters: { type: "object", properties: { path: { type: "string" }, startLine: { type: "integer" }, endLine: { type: "integer" } }, required: ["path"] } } },
    /**
     * 执行一次文件读取。
     *
     * 四问：
     * - 输入：ToolContext 和已通过 schema 的 path/startLine/endLine。
     * - 外部副作用：读取文件；输出过长时会在 rawDir 写一个完整预览文件。
     * - 失败方式：路径不安全或文件不存在返回 ok=false；其他意外 I/O 错误继续 reject。
     * - 测试位置：`tests/tools/read-file.test.ts` 的行范围、截断和缺失文件用例。
     */
    async execute(context, input): Promise<ToolResult> {
      try {
        // 所有文件读取必须经过 path policy，工具本身不能绕过安全层。
        const path = await assertWorkspacePath(context.workspaceRoot, input.path)
        const raw = await readFile(path, "utf8")
        // 使用 1-based 行号，和编辑器、编译器错误信息的习惯一致。
        const lines = raw.split(/\r?\n/)
        const start = input.startLine ?? 1, end = input.endLine ?? lines.length
        const selected = lines.slice(start - 1, end).map((line, i) => `${start + i}|${line}`).join("\n")
        const preview = bounded(selected, context.maxOutputChars)
        let rawRef: string | undefined
        // 模型只看 preview；rawRef 让后续逻辑仍能拿到完整工具输出。
        if (preview.truncated) { await mkdir(context.rawDir, { recursive: true }); rawRef = `${context.rawDir}/read-file-${randomUUID()}.txt`; await writeFile(rawRef, selected) }
        return { ok: true, content: preview.text, ...(rawRef ? { rawRef } : {}), metadata: { byteLength: Buffer.byteLength(raw), lineCount: lines.length, truncated: preview.truncated } }
      } catch (error) {
        if (error instanceof PathPolicyError || (error as NodeJS.ErrnoException).code === "ENOENT") return { ok: false, content: `File not found or inaccessible: ${input.path}` }
        throw error
      }
    },
  }
}
