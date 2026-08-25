import { mkdir, readFile, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { assertWorkspacePath, PathPolicyError } from "../safety/path-policy.js"
import type { ToolDefinition, ToolResult } from "./types.js"

const inputSchema = z.object({ path: z.string().min(1), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() })
type Input = z.infer<typeof inputSchema>

function bounded(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  const head = Math.ceil(max * 0.6), tail = Math.floor(max * 0.4)
  return { text: `${text.slice(0, head)}\n...[truncated]...\n${text.slice(-tail)}`, truncated: true }
}

export function createReadFileTool(): ToolDefinition<Input> {
  return {
    name: "read_file", description: "Read a file within the workspace.", schema: inputSchema,
    openAiSchema: { type: "function", function: { name: "read_file", description: "Read a file within the workspace.", parameters: { type: "object", properties: { path: { type: "string" }, startLine: { type: "integer" }, endLine: { type: "integer" } }, required: ["path"] } } },
    async execute(context, input): Promise<ToolResult> {
      try {
        const path = await assertWorkspacePath(context.workspaceRoot, input.path)
        const raw = await readFile(path, "utf8")
        const lines = raw.split(/\r?\n/)
        const start = input.startLine ?? 1, end = input.endLine ?? lines.length
        const selected = lines.slice(start - 1, end).map((line, i) => `${start + i}|${line}`).join("\n")
        const preview = bounded(selected, context.maxOutputChars)
        let rawRef: string | undefined
        if (preview.truncated) { await mkdir(context.rawDir, { recursive: true }); rawRef = `${context.rawDir}/read-file-${randomUUID()}.txt`; await writeFile(rawRef, selected) }
        return { ok: true, content: preview.text, ...(rawRef ? { rawRef } : {}), metadata: { byteLength: Buffer.byteLength(raw), lineCount: lines.length, truncated: preview.truncated } }
      } catch (error) {
        if (error instanceof PathPolicyError || (error as NodeJS.ErrnoException).code === "ENOENT") return { ok: false, content: `File not found or inaccessible: ${input.path}` }
        throw error
      }
    },
  }
}
