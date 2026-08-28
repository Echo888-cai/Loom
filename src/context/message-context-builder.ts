import type { ModelMessage } from "../model/types.js"
import type { ContextObject } from "./types.js"

/** 给已有消息附加 Context 元数据；原消息保存在 message 字段，协议不会丢失。 */
export function buildMessageContextObjects(messages: ModelMessage[]): ContextObject[] {
  return messages.map((message, index) => ({
    id: `message-${index}`,
    kind: "conversation",
    content: message.content ?? "",
    state: "active",
    importance: message.role === "system" || message.role === "user" ? 1 : 0.8,
    relevance: 1,
    freshness: 1,
    message,
    ...(message.role === "tool" ? { sourceKey: `tool:${message.toolCallId}` } : {}),
  }))
}
