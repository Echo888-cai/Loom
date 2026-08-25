// DeepSeek 提供 OpenAI-compatible API，因此可以复用 OpenAI SDK 的 HTTP 实现。
import OpenAI from "openai"
import type { ModelMessage, ModelProvider, ModelRequest, ModelResponse, ToolSchema } from "./types.js"

/**
 * DeepSeek 原始响应结构。
 *
 * 四问：
 * - 输入：HTTP/SDK 返回的供应商 JSON。
 * - 外部副作用：无，只是边界数据。
 * - 失败方式：缺少 choices 或 tool arguments 不是合法 JSON 时由 Provider 抛错。
 * - 测试位置：`tests/model/deepseek.test.ts`。
 */
// 这是供应商返回的“原始形状”，只允许停留在 Provider 边界内。
export type RawDeepSeekResponse = {
  choices: Array<{
    message: {
      content: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        id: string
        type: "function"
        function: { name: string; arguments: string }
      }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/**
 * 传给 transport 的最小请求结构。
 * 四问：输入是模型名、消息和工具；无副作用；transport 错误会 reject；测试使用 fake transport。
 */
// 这是传给 transport 的最小请求形状，便于单元测试时注入假 transport。
export type DeepSeekRequest = {
  model: string
  messages: unknown[]
  tools: ToolSchema[]
}

/**
 * 可替换的网络传输函数。
 * 四问：输入是 DeepSeekRequest 和取消信号；生产实现会联网；错误原样 reject；测试可完全不联网。
 */
// transport 是可替换的网络层：生产环境用 SDK，测试用内存函数。
export type DeepSeekTransport = (
  request: DeepSeekRequest,
  signal?: AbortSignal,
) => Promise<RawDeepSeekResponse>

/**
 * DeepSeek Provider 适配器。
 *
 * 四问：
 * - 输入：Loom 的 ModelRequest。
 * - 外部副作用：通过注入的 transport 产生网络请求；类本身不执行工具。
 * - 失败方式：取消、网络错误、空 choices、非法 tool JSON 都会 reject。
 * - 测试位置：`tests/model/deepseek.test.ts`，transport 被替换成内存函数。
 */
// Provider 的职责只有两件事：调用 DeepSeek，并把原始响应归一化成 Loom 格式。
export class DeepSeekProvider implements ModelProvider {
  /**
   * 注入 transport，而不是在这里直接 new 网络客户端。
   * 这叫 dependency injection，目的是让“消息转换”可以脱离真实 API 测试。
   */
  constructor(private readonly transport: DeepSeekTransport) {}

  /**
   * 完成一次非流式 DeepSeek 调用并归一化结果。
   *
   * 四问：
   * - 输入：模型名、Loom 消息、工具 schema、可选 AbortSignal。
   * - 外部副作用：调用 transport；真正生产 transport 会发 HTTP 请求。
   * - 失败方式：请求被取消、没有 choice 或模型工具参数不是 JSON 时 reject。
   * - 测试位置：`tests/model/deepseek.test.ts` 的 5 个用例。
   */
  async complete(request: ModelRequest): Promise<ModelResponse> {
    // 在真正发网络请求前检查取消信号，避免用户已经停止任务还继续消耗 token。
    request.signal?.throwIfAborted()
    const raw = await this.transport({
      model: request.model,
      messages: request.messages.map(toDeepSeekMessage),
      tools: request.tools,
    }, request.signal)
    request.signal?.throwIfAborted()

    // Chat API 可能返回多个 choice；v0.0 只使用第一个。
    const choice = raw.choices[0]
    if (!choice) {
      throw new Error("DeepSeek response has no choices")
    }

    // 供应商把工具参数作为 JSON 字符串返回；这里先验证，再交给工具注册表解析。
    const toolCalls = (choice.message.tool_calls ?? []).map((toolCall) => {
      try {
        JSON.parse(toolCall.function.arguments)
      } catch (error: unknown) {
        throw new Error(`Invalid tool call arguments for ${toolCall.function.name}: tool call arguments are not valid JSON`, { cause: error })
      }
      return {
        id: toolCall.id,
        name: toolCall.function.name,
        argumentsJson: toolCall.function.arguments,
      }
    })

    // 从这里开始，Agent Loop 不再知道 DeepSeek 的字段名（如 reasoning_content）。
    return {
      content: choice.message.content,
      ...(choice.message.reasoning_content === undefined ? {} : { reasoningContent: choice.message.reasoning_content }),
      toolCalls,
      ...(raw.usage === undefined ? {} : {
        usage: {
          inputTokens: raw.usage.prompt_tokens ?? 0,
          outputTokens: raw.usage.completion_tokens ?? 0,
        },
      }),
    }
  }
}

export function createDeepSeekTransport(apiKey: string): DeepSeekTransport {
  /**
   * 创建生产环境 transport。
   *
   * 四问：
   * - 输入：DeepSeek API Key。
   * - 外部副作用：创建 SDK client 本身不联网，返回的函数被调用时才联网。
   * - 失败方式：SDK/API 的认证、网络、限流错误会 reject。
   * - 测试位置：当前单元测试不调用真实网络；只测 DeepSeekProvider。
   */
  // baseURL 指向 DeepSeek，而不是 OpenAI；SDK 只负责兼容的 HTTP 协议。
  const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" })
  return async (request, signal) => {
    signal?.throwIfAborted()
    // stream:false 让 v0.0 先处理完整响应；流式输出在 Agent Loop 稳定后再加入。
    const response = await client.chat.completions.create({
      model: request.model,
      messages: request.messages as never,
      tools: request.tools as never,
      stream: false,
    }, { signal })
    return response as unknown as RawDeepSeekResponse
  }
}

/**
 * 把 Loom 内部消息转换成 DeepSeek API 消息。
 * 四问：输入是 ModelMessage；无外部副作用；类型/格式错误由调用 API 时暴露；由 provider 测试间接覆盖。
 */
// 把 Loom 的内部消息转换为 DeepSeek API 的消息格式。
function toDeepSeekMessage(message: ModelMessage): Record<string, unknown> {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content,
      ...(message.reasoningContent === undefined ? {} : { reasoning_content: message.reasoningContent }),
      ...(message.toolCalls === undefined ? {} : {
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: { name: toolCall.name, arguments: toolCall.argumentsJson },
        })),
      }),
    }
  }
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content }
  }
  return { role: message.role, content: message.content }
}
