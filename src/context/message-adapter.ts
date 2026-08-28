import type { ModelMessage } from "../model/types.js"
import type { ContextObject } from "./types.js"

/** 将 Loom 内部 Working Set 转为供应商无关的消息；标签让模型知道信息来源。 */
export function contextObjectsToMessages(objects: ContextObject[]): ModelMessage[] {
  return objects.map((object) => ({
    role: "user" as const,
    content: `[${object.kind}]\n${object.content}`,
  }))
}
