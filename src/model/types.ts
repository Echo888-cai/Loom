/**
 * 发送给 OpenAI-compatible API 的工具描述格式。
 *
 * 四问：
 * - 输入：工具名、说明和 JSON Schema 参数定义。
 * - 外部副作用：无，只是模型请求中的数据结构。
 * - 失败方式：类型层面约束格式；真正 API 是否接受由 Provider/网络调用报告。
 * - 测试位置：`tests/tools/registry.test.ts` 检查注册表暴露的 schema 名称。
 */
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

/**
 * 模型提出的一次工具调用请求。
 *
 * 四问：
 * - 输入：模型生成的调用 ID、工具名称和 JSON 字符串参数。
 * - 外部副作用：无；它只是“请求”，还没有执行工具。
 * - 失败方式：参数字符串可能不是合法 JSON，Provider 边界会拒绝它。
 * - 测试位置：`tests/model/deepseek.test.ts` 覆盖非法 JSON。
 */
// 模型不会直接执行工具，而是返回一个 ToolCall 请求。
export type ToolCall = {
  id: string
  name: string
  argumentsJson: string
}

/**
 * Loom 内部的消息联合类型。
 *
 * 四问：
 * - 输入：system/user/assistant/tool 四类消息及其专属字段。
 * - 外部副作用：无。
 * - 失败方式：错误 role/字段组合会在 TypeScript 编译期被拒绝；外部 JSON 仍需运行时校验。
 * - 测试位置：DeepSeek provider 测试验证这些消息被正确转换。
 */
// Loom 内部的消息格式，故意不直接暴露 OpenAI SDK 的类型。
// 这样将来替换模型供应商时，Agent Loop 不需要跟着改。
export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[]; reasoningContent?: string | null }
  | { role: "tool"; toolCallId: string; content: string }

/**
 * 一次模型调用的完整输入。
 *
 * 四问：
 * - 输入：模型名、历史消息、可用工具 schema 和可选取消信号。
 * - 外部副作用：类型本身无副作用；Provider 使用它时会产生网络请求。
 * - 失败方式：Provider 可能因取消、网络、API 错误而 reject。
 * - 测试位置：`tests/model/deepseek.test.ts`。
 */
// 一次模型调用的完整输入。
export type ModelRequest = {
  model: string
  messages: ModelMessage[]
  tools: ToolSchema[]
  signal?: AbortSignal
}

/**
 * Loom 从供应商响应中抽取出的稳定格式。
 *
 * 四问：
 * - 输入：Provider 从供应商原始响应中提取文本、推理、工具调用和用量。
 * - 外部副作用：无。
 * - 失败方式：供应商响应为空或工具参数非法时，在 Provider 层 reject。
 * - 测试位置：`tests/model/deepseek.test.ts`。
 */
// Loom 从供应商响应中抽取出的稳定格式。
export type ModelResponse = {
  content: string | null
  reasoningContent?: string | null
  toolCalls: ToolCall[]
  usage?: { inputTokens: number; outputTokens: number }
}

/**
 * 模型 Provider 端口。
 *
 * 四问：
 * - 输入：实现方接受 ModelRequest。
 * - 外部副作用：具体实现通常会发网络请求；接口本身不规定实现方式。
 * - 失败方式：Promise reject；AgentLoop 负责重试或终止任务。
 * - 测试位置：DeepSeekProvider 用注入的 fake transport 独立测试。
 */
// Provider 是“模型层”的端口（port）：Agent Loop 只调用 complete。
export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>
}
