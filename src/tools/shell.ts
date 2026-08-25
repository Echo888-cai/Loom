// Shell 是高风险工具：审批、子进程、输出落盘都集中在这个边界中。
import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { z } from "zod"
import { ExecaCommandRunner } from "../process/runner.js"
import type { ApprovalDecision } from "../safety/approval.js"
import type { ToolDefinition, ToolResult } from "./types.js"

const inputSchema = z.object({ command: z.string().min(1), timeoutMs: z.number().int().positive().max(900_000).optional(), reason: z.string().optional() })
type Input = z.infer<typeof inputSchema>

/** 限制回传给模型的字符数，但完整输出仍写入 raw 文件。 */
function preview(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n...[truncated]...`
}

/**
 * 子进程环境净化。
 * DeepSeek API Key 属于 Loom Harness，不应暴露给模型要求执行的命令。
 */
function safeEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "DEEPSEEK_API_KEY"))
}

/**
 * 创建 shell 工具。
 * 四问：输入是无状态工厂调用；创建阶段无副作用；执行阶段会审批、启动进程并写 raw；shell 测试覆盖拒绝、允许和超时。
 */
export function createShellTool(): ToolDefinition<Input> {
  return {
    name: "shell",
    description: "Run an approved shell command in the workspace.",
    schema: inputSchema,
    openAiSchema: { type: "function", function: { name: "shell", description: "Run an approved shell command in the workspace.", parameters: { type: "object", properties: { command: { type: "string" }, timeoutMs: { type: "integer" }, reason: { type: "string" } }, required: ["command"] } } },
    /**
     * 执行一次经过审批的命令。
     * 四问：输入是命令/超时/原因和 ToolContext；副作用是审批、子进程、日志文件和事件；失败以 deny/非零/timeout 或 reject 表示；由 shell 测试验证。
     */
    async execute(context, input): Promise<ToolResult> {
      const timeoutMs = input.timeoutMs ?? 120_000
      const gate = context.approvalGate
      const runner = context.commandRunner ?? new ExecaCommandRunner()
      const approvalRequest = { command: input.command, cwd: context.workspaceRoot, timeoutMs, reason: input.reason ?? "Agent requested shell execution" }
      await context.eventStore?.append(context.taskId, "approval.requested", approvalRequest)
      const decision: ApprovalDecision = gate ? await gate.request(approvalRequest) : "deny"
      await context.eventStore?.append(context.taskId, "approval.resolved", { ...approvalRequest, decision })
      if (decision !== "allow") return { ok: false, content: "Shell execution denied by approval policy." }

      await context.eventStore?.append(context.taskId, "tool.started", { name: "shell", command: input.command })
      const startedAt = Date.now()
      try {
        const result = await runner.run({ command: input.command, cwd: context.workspaceRoot, timeoutMs, signal: context.signal, env: safeEnvironment() })
        const combined = [`$ ${input.command}`, result.stdout ? `stdout:\n${result.stdout}` : "", result.stderr ? `stderr:\n${result.stderr}` : ""].filter(Boolean).join("\n")
        let rawRef: string | undefined
        if (combined) { await mkdir(context.rawDir, { recursive: true }); rawRef = join(context.rawDir, `shell-${randomUUID()}.log`); await writeFile(rawRef, combined, "utf8") }
        const ok = result.exitCode === 0 && !result.timedOut
        const content = `${result.timedOut ? "Command timed out" : `Command exited with code ${result.exitCode ?? "unknown"}`}\n${preview(combined, context.maxOutputChars)}`.trim()
        const output = { ok, content, ...(rawRef ? { rawRef } : {}), metadata: { exitCode: result.exitCode, timedOut: result.timedOut, durationMs: result.durationMs, truncated: combined.length > context.maxOutputChars } }
        await context.eventStore?.append(context.taskId, "tool.completed", { name: "shell", durationMs: Date.now() - startedAt, ...output })
        return output
      } catch (error: unknown) {
        await context.eventStore?.append(context.taskId, "tool.completed", { name: "shell", ok: false, error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    },
  }
}
