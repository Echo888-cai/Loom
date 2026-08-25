// DeepSeek 提供 OpenAI-compatible API，因此可以复用 OpenAI SDK 的 HTTP 实现。
import OpenAI from "openai"
import type { ModelMessage, ModelProvider, ModelRequest, ModelResponse, ToolSchema } from "./types.js"

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

// 这是传给 transport 的最小请求形状，便于单元测试时注入假 transport。
export type DeepSeekRequest = {
  model: string
  messages: unknown[]
  tools: ToolSchema[]
}

// transport 是可替换的网络层：生产环境用 SDK，测试用内存函数。
export type DeepSeekTransport = (
  request: DeepSeekRequest,
  signal?: AbortSignal,
) => Promise<RawDeepSeekResponse>

// Provider 的职责只有两件事：调用 DeepSeek，并把原始响应归一化成 Loom 格式。
export class DeepSeekProvider implements ModelProvider {
  constructor(private readonly transport: DeepSeekTransport) {}

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
