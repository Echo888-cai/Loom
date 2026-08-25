// hash 用来留下修改前后的可比对指纹；fs API 负责安全地读写文件。
import { createHash } from "node:crypto"
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createTwoFilesPatch } from "diff"
import { z } from "zod"
import { assertWorkspacePath, PathPolicyError } from "../safety/path-policy.js"
import type { ToolDefinition, ToolResult } from "./types.js"

// 模型必须明确提供 oldText 和 newText；不接受“按大概位置修改”。
const inputSchema = z.object({
  path: z.string().min(1),
  oldText: z.string().min(1),
  newText: z.string(),
})
type Input = z.infer<typeof inputSchema>

/**
 * 统计非重叠匹配次数。
 * 四问：输入是原文和待替换片段；无副作用；不会失败，返回 0/1/多次；由 edit_file 测试间接验证。
 */
function countOccurrences(text: string, needle: string): number {
  let count = 0
  let position = 0
  while (true) {
    const found = text.indexOf(needle, position)
    if (found === -1) return count
    count += 1
    position = found + needle.length
  }
}

/**
 * 计算文本的 SHA-256。
 * 四问：输入是文件文本；无外部副作用；正常不会失败；hash 结果在 edit_file 测试的 metadata 中验证。
 */
function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

/**
 * 创建 edit_file 工具。
 * 四问：输入是无状态工厂调用；创建阶段不改文件；真正的 I/O 在 execute；edit-file 测试覆盖成功和拒绝路径。
 */
export function createEditFileTool(): ToolDefinition<Input> {
  return {
    name: "edit_file",
    description: "Replace exactly one matching text fragment in a workspace file.",
    schema: inputSchema,
    openAiSchema: {
      type: "function",
      function: {
        name: "edit_file",
        description: "Replace exactly one matching text fragment in a workspace file.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } },
          required: ["path", "oldText", "newText"],
        },
      },
    },
    /**
     * 精确修改一个文件。
     *
     * 四问：
     * - 输入：workspace 上下文，以及 path/oldText/newText。
     * - 外部副作用：读取目标文件；成功时原子替换文件，并可追加 file.changed 事件。
     * - 失败方式：路径不安全、文件不存在或 oldText 不是恰好一次时拒绝；写入异常继续 reject。
     * - 测试位置：`tests/tools/edit-file.test.ts` 覆盖精确替换、0 次、2 次和保护目录。
     */
    async execute(context, input): Promise<ToolResult> {
      let path: string
      try {
        path = await assertWorkspacePath(context.workspaceRoot, input.path)
      } catch (error: unknown) {
        if (error instanceof PathPolicyError || (error as NodeJS.ErrnoException).code === "ENOENT") return { ok: false, content: `File is not editable: ${input.path}` }
        throw error
      }

      // 先读快照，再基于快照计算 match；在写入前绝不猜测模型意图。
      const before = await readFile(path, "utf8")
      const matchCount = countOccurrences(before, input.oldText)
      if (matchCount !== 1) return { ok: false, content: `Edit refused: oldText must match exactly once, but matched ${matchCount}.`, metadata: { changed: false, matchCount } }

      // 因为已经确认只有一个匹配，replace 的结果是确定性的。
      const after = before.replace(input.oldText, input.newText)
      const beforeHash = sha256(before)
      const afterHash = sha256(after)
      const diff = createTwoFilesPatch(input.path, input.path, before, after)

      // 先写同目录临时文件，再 rename；这样中途失败不会留下半写入的源文件。
      const temporaryPath = join(dirname(path), `.loom-edit-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`)
      try {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(temporaryPath, after, "utf8")
        await rename(temporaryPath, path)
      } catch (error: unknown) {
        await unlink(temporaryPath).catch(() => undefined)
        throw error
      }

      // 事件记录放在文件成功替换之后，避免记录一个实际上没有发生的修改。
      if (context.eventStore) {
        await context.eventStore.append(context.taskId, "file.changed", { path: input.path, beforeHash, afterHash, diff, matchCount })
      }
      return { ok: true, content: `Updated ${input.path}`, metadata: { changed: true, beforeHash, afterHash, diff, matchCount } }
    },
  }
}
