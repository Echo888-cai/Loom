import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { execa } from "execa"
import { z } from "zod"
import type { ToolDefinition } from "./types.js"

const inputSchema = z.object({ query: z.string().min(1), globs: z.array(z.string()).optional() })
type Input = z.infer<typeof inputSchema>

export function createSearchTool(): ToolDefinition<Input> {
  return {
    name: "search", description: "Search workspace text with ripgrep.", schema: inputSchema,
    openAiSchema: { type: "function", function: { name: "search", description: "Search workspace text with ripgrep.", parameters: { type: "object", properties: { query: { type: "string" }, globs: { type: "array", items: { type: "string" } } }, required: ["query"] } } },
    async execute(context, input) {
      const args = ["--line-number", "--with-filename", "--color", "never", ...(input.globs ?? []).flatMap((glob) => ["--glob", glob]), "--", input.query, "."]
      const result = await execa("rg", args, { cwd: context.workspaceRoot, reject: false, shell: false, cancelSignal: context.signal })
      if (result.exitCode === 1) return { ok: true, content: "No matches found." }
      if (result.exitCode !== 0) return { ok: false, content: result.stderr || `Search failed with exit code ${result.exitCode}` }
      const output = result.stdout.trimEnd()
      if (output.length <= context.maxOutputChars) return { ok: true, content: output }
      await mkdir(context.rawDir, { recursive: true }); const rawRef = `${context.rawDir}/search-${randomUUID()}.txt`; await writeFile(rawRef, output)
      return { ok: true, content: `${output.slice(0, context.maxOutputChars)}\n...[truncated]...`, rawRef, metadata: { truncated: true } }
    },
  }
}
