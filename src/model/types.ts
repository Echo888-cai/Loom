// 这是发送给 OpenAI-compatible API 的工具描述格式。
// DeepSeek 兼容这套 function-calling schema，所以 Loom 内部也采用它。
export type ToolSchema = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// 模型不会直接执行工具，而是返回一个 ToolCall 请求。
export type ToolCall = {
  id: string
  name: string
  argumentsJson: string
}

// Loom 内部的消息格式，故意不直接暴露 OpenAI SDK 的类型。
// 这样将来替换模型供应商时，Agent Loop 不需要跟着改。
export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[]; reasoningContent?: string | null }
  | { role: "tool"; toolCallId: string; content: string }

// 一次模型调用的完整输入。
export type ModelRequest = {
  model: string
  messages: ModelMessage[]
  tools: ToolSchema[]
  signal?: AbortSignal
}

// Loom 从供应商响应中抽取出的稳定格式。
export type ModelResponse = {
  content: string | null
  reasoningContent?: string | null
  toolCalls: ToolCall[]
  usage?: { inputTokens: number; outputTokens: number }
}

// Provider 是“模型层”的端口（port）：Agent Loop 只调用 complete。
export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>
}
