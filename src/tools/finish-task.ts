// finish_task 是完成声明的入口，但最终裁决权属于 Verifier。
import { z } from "zod"
import type { FinishTaskInput } from "../verification/types.js"
import type { ToolDefinition, ToolResult } from "./types.js"

const inputSchema = z.object({ summary: z.string().min(1), filesChanged: z.array(z.string()), verificationClaim: z.string().min(1), remainingRisks: z.array(z.string()) })

/**
 * 创建 finish_task 工具。
 * 四问：输入是模型的总结/变更文件/声明/风险；副作用是运行验证器并记录状态事件；失败返回 blocked 或继续证据；finish-task 测试覆盖。
 */
export function createFinishTaskTool(): ToolDefinition<FinishTaskInput> {
  return {
    name: "finish_task",
    description: "Submit a completion candidate for objective verification.",
    schema: inputSchema,
    openAiSchema: { type: "function", function: { name: "finish_task", description: "Submit a completion candidate for objective verification.", parameters: { type: "object", properties: { summary: { type: "string" }, filesChanged: { type: "array", items: { type: "string" } }, verificationClaim: { type: "string" }, remainingRisks: { type: "array", items: { type: "string" } } }, required: ["summary", "filesChanged", "verificationClaim", "remainingRisks"] } } },
    /**
     * 把模型的“我完成了”转换成 Verification 请求。
     * 自身不信任 verificationClaim，只把它作为背景交给事件记录。
     */
    async execute(context, input): Promise<ToolResult> {
      if (!context.verifier) {
        await context.eventStore?.append(context.taskId, "task.blocked", { reason: "No verifier configured", summary: input.summary })
        return { ok: false, content: "Task cannot be verified because no verifier is configured.", metadata: { verificationStatus: "blocked" } }
      }
      const verification = await context.verifier.verify({ taskId: context.taskId, workspaceRoot: context.workspaceRoot, filesChanged: input.filesChanged, constraints: input.remainingRisks })
      const eventType = verification.status === "verified" ? "task.verified" : verification.status === "blocked" ? "task.blocked" : "task.verification_continue"
      await context.eventStore?.append(context.taskId, eventType, { summary: input.summary, verificationClaim: input.verificationClaim, ...verification })
      return { ok: true, content: `${verification.status === "verified" ? "Verification passed." : "Verification result: " + verification.status}\n${verification.evidence.join("\n")}`, metadata: { verificationStatus: verification.status, checks: verification.checks, evidence: verification.evidence } }
    },
  }
}
