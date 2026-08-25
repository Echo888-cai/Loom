import OpenAI from "openai"
import type { ModelMessage, ModelProvider, ModelRequest, ModelResponse, ToolSchema } from "./types.js"

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

export type DeepSeekRequest = {
  model: string
  messages: unknown[]
  tools: ToolSchema[]
}

export type DeepSeekTransport = (
  request: DeepSeekRequest,
  signal?: AbortSignal,
) => Promise<RawDeepSeekResponse>

export class DeepSeekProvider implements ModelProvider {
  constructor(private readonly transport: DeepSeekTransport) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    request.signal?.throwIfAborted()
    const raw = await this.transport({
      model: request.model,
      messages: request.messages.map(toDeepSeekMessage),
      tools: request.tools,
    }, request.signal)
    request.signal?.throwIfAborted()

    const choice = raw.choices[0]
    if (!choice) {
      throw new Error("DeepSeek response has no choices")
    }

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
  const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" })
  return async (request, signal) => {
    signal?.throwIfAborted()
    const response = await client.chat.completions.create({
      model: request.model,
      messages: request.messages as never,
      tools: request.tools as never,
      stream: false,
    }, { signal })
    return response as unknown as RawDeepSeekResponse
  }
}

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
