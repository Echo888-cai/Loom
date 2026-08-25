export type ToolSchema = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ToolCall = {
  id: string
  name: string
  argumentsJson: string
}

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[]; reasoningContent?: string | null }
  | { role: "tool"; toolCallId: string; content: string }

export type ModelRequest = {
  model: string
  messages: ModelMessage[]
  tools: ToolSchema[]
  signal?: AbortSignal
}

export type ModelResponse = {
  content: string | null
  reasoningContent?: string | null
  toolCalls: ToolCall[]
  usage?: { inputTokens: number; outputTokens: number }
}

export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>
}
