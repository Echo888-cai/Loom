// AgentLoop 只负责编排：它不直接读文件、不直接调用 rg，而是通过 Provider 和 Registry。
import { join } from "node:path"
import type { EventStore } from "../events/types.js"
import type { ContextCompiler } from "../context/compiler.js"
import { BudgetedContextCompiler } from "../context/compiler.js"
import type { ModelMessage, ModelProvider } from "../model/types.js"
import type { ToolRegistry } from "../tools/types.js"
import type { Verifier } from "../verification/types.js"
import type { ApprovalGate } from "../safety/approval.js"
import type { CommandRunner } from "../process/runner.js"
import { getLimitReason, type AgentLimits, type LimitState } from "./limits.js"

/** 一次任务运行的输入。 */
export type RunRequest = {
  taskId: string
  goal: string
  workspaceRoot: string
  signal?: AbortSignal
}

/** 一次任务运行的摘要，不把完整日志塞进返回值，详细事实在 EventStore 中。 */
export type RunResult = {
  taskId: string
  status: "candidate_done" | "verified" | "blocked" | "failed" | "cancelled"
  steps: number
  modelCalls: number
  toolCalls: number
}

const defaultLimits: AgentLimits = { maxModelCalls: 40, maxToolCalls: 80, maxDurationMs: 900_000, maxToolOutputChars: 12_000 }

/**
 * Loom v0.0 的最小 Agent Loop。
 *
 * 核心因果链：
 * 1. 请求模型；2. 获得文本或 ToolCall；3. 执行工具；4. 把 ToolResult 变成下一轮消息。
 *
 * 四问：
 * - 输入：Provider、ToolRegistry、EventStore、限制和 RunRequest。
 * - 外部副作用：调用模型、执行工具、追加事件和写 raw 输出。
 * - 失败方式：模型异常返回 failed；超限返回 blocked；取消返回 cancelled。
 * - 测试位置：`tests/agent/loop.test.ts` 验证多轮消息和调用上限。
 */
export class AgentLoop {
  /**
   * 注入每层依赖，避免 Loop 绑死 DeepSeek、文件系统或具体工具实现。
   * 四问：输入是抽象接口和可选配置；构造无副作用；错误在 run 执行时发生；测试使用 fake provider/registry。
   */
  constructor(
    private readonly provider: ModelProvider,
    private readonly tools: ToolRegistry,
    private readonly events: EventStore,
    private readonly limits: AgentLimits = defaultLimits,
    private readonly compiler: ContextCompiler = new BudgetedContextCompiler({ maxTokens: 12_000 }),
    private readonly verifier?: Verifier,
    private readonly approvalGate?: ApprovalGate,
    private readonly commandRunner?: CommandRunner,
  ) {}

  /**
   * 运行一个有边界的任务循环。
   * 四问：输入是 taskId/goal/workspace/signal；副作用是模型、工具和事件 I/O；失败通过状态或事件报告；测试覆盖闭环。
   */
  async run(request: RunRequest): Promise<RunResult> {
    return this.runWithState(request)
  }

  async resume(request: RunRequest, stateInput: { messages: ModelMessage[]; modelCalls: number; toolCalls: number }): Promise<RunResult> {
    return this.runWithState(request, stateInput)
  }

  private async runWithState(request: RunRequest, stateInput?: { messages: ModelMessage[]; modelCalls: number; toolCalls: number }): Promise<RunResult> {
    const state: LimitState = { modelCalls: stateInput?.modelCalls ?? 0, toolCalls: stateInput?.toolCalls ?? 0, startedAt: Date.now() }
    const messages: ModelMessage[] = stateInput ? [...stateInput.messages] : [
      { role: "system", content: "You are Loom, a careful coding agent. Use tools to inspect the repository before making claims." },
      { role: "user", content: request.goal },
    ]
    const rawDir = join(request.workspaceRoot, ".loom", "runs", request.taskId, "raw")
    if (!stateInput) await this.events.append(request.taskId, "task.created", { goal: request.goal, workspaceRoot: request.workspaceRoot })

    // 这里是 Observe → Decide → Act → Observe 的核心循环。
    while (true) {
      const reason = getLimitReason(state, this.limits, request.signal)
      if (reason) return this.finishLimited(request, state, reason)

      // 每次真正请求模型前递增计数并写审计事件，避免“调用发生了但日志没有”。
      state.modelCalls += 1
      await this.events.append(request.taskId, "model.requested", { call: state.modelCalls, messageCount: messages.length })
      let response
      try {
        const modelRequest = { model: "deepseek-chat", messages: this.compiler.compile({ goal: request.goal, messages }), tools: this.tools.schemas(), ...(request.signal ? { signal: request.signal } : {}) }
        response = await this.provider.complete(modelRequest)
      } catch (error: unknown) {
        await this.events.append(request.taskId, "task.failed", { phase: "model", error: errorMessage(error) })
        return { taskId: request.taskId, status: "failed", steps: state.modelCalls, modelCalls: state.modelCalls, toolCalls: state.toolCalls }
      }
      await this.events.append(request.taskId, "model.responded", {
        call: state.modelCalls,
        content: response.content,
        ...(response.reasoningContent === undefined ? {} : { reasoningContent: response.reasoningContent }),
        toolCalls: response.toolCalls.map((call) => ({ id: call.id, name: call.name, argumentsJson: call.argumentsJson })),
      })

      // assistant ToolCall 必须进入历史，否则下一轮模型不知道自己刚刚请求了什么。
      const assistantMessage: ModelMessage = {
        role: "assistant",
        content: response.content,
        ...(response.reasoningContent === undefined ? {} : { reasoningContent: response.reasoningContent }),
        toolCalls: response.toolCalls,
      }
      messages.push(assistantMessage)
      if (response.toolCalls.length === 0) {
        await this.events.append(request.taskId, "task.candidate_done", { content: response.content })
        return { taskId: request.taskId, status: "candidate_done", steps: state.modelCalls, modelCalls: state.modelCalls, toolCalls: state.toolCalls }
      }

      // 一个模型响应可能包含多个工具调用；v0.0 按顺序串行执行。
      for (const call of response.toolCalls) {
        const toolLimit = getLimitReason(state, this.limits, request.signal)
        if (toolLimit === "cancelled") return this.finishLimited(request, state, toolLimit)
        if (toolLimit === "max_tool_calls" || toolLimit === "max_duration") return this.finishLimited(request, state, toolLimit)

        state.toolCalls += 1
        await this.events.append(request.taskId, "tool.requested", { call: state.toolCalls, id: call.id, name: call.name, argumentsJson: call.argumentsJson })
        const result = await this.executeTool(request, rawDir, call.name, call.argumentsJson)
        await this.events.append(request.taskId, "tool.completed", { call: state.toolCalls, id: call.id, name: call.name, ...result })
        messages.push({ role: "tool", toolCallId: call.id, content: result.content })
        if (call.name === "finish_task") {
          const verificationStatus = result.metadata?.verificationStatus
          if (verificationStatus === "verified") return { taskId: request.taskId, status: "verified", steps: state.modelCalls, modelCalls: state.modelCalls, toolCalls: state.toolCalls }
          if (verificationStatus === "blocked") return { taskId: request.taskId, status: "blocked", steps: state.modelCalls, modelCalls: state.modelCalls, toolCalls: state.toolCalls }
          // continue 表示模型必须阅读验证证据，在下一轮继续修复。
        }
      }
    }
  }

  /**
   * 解析并执行单个 ToolCall。
   * 四问：输入是模型生成的名称和 JSON；副作用由 Registry 内的工具产生；非法 JSON/执行异常转成 ToolResult 错误；由 loop 测试间接覆盖。
   */
  private async executeTool(request: RunRequest, rawDir: string, name: string, argumentsJson: string) {
    try {
      const input: unknown = JSON.parse(argumentsJson)
        return await this.tools.execute(name, { workspaceRoot: request.workspaceRoot, taskId: request.taskId, signal: request.signal ?? new AbortController().signal, maxOutputChars: this.limits.maxToolOutputChars ?? 12_000, rawDir, eventStore: this.events, ...(this.verifier ? { verifier: this.verifier } : {}), ...(this.approvalGate ? { approvalGate: this.approvalGate } : {}), ...(this.commandRunner ? { commandRunner: this.commandRunner } : {}) }, input)
    } catch (error: unknown) {
      return { ok: false, content: `Tool execution failed: ${errorMessage(error)}` }
    }
  }

  /**
   * 将取消或资源耗尽写入事件并转换成稳定的 RunResult。
   * 四问：输入是任务、计数和原因；副作用是追加事件；不会抛错；loop 的上限测试验证 blocked。
   */
  private async finishLimited(request: RunRequest, state: LimitState, reason: string): Promise<RunResult> {
    const cancelled = reason === "cancelled"
    await this.events.append(request.taskId, cancelled ? "task.cancelled" : "task.blocked", { reason })
    return { taskId: request.taskId, status: cancelled ? "cancelled" : "blocked", steps: state.modelCalls, modelCalls: state.modelCalls, toolCalls: state.toolCalls }
  }
}

// 把 unknown 错误转换为可写入事件日志的短字符串，避免把 Error 对象直接 JSON 序列化成空对象。
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
