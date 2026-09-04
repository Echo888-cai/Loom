/** Loom 内部管理的上下文对象；它比 ModelMessage 多了生命周期和优先级。 */
export type ContextObject = {
  id: string
  kind: "conversation" | "code" | "diff" | "test" | "tool_output" | "state"
  content: string
  state: "active" | "resolved" | "obsolete"
  importance: number
  relevance: number
  freshness: number
  message?: import("../model/types.js").ModelMessage
  sourceKey?: string
  relatedTo?: string[]
}

/** 生命周期过滤：过时事实隐藏，已解决事实降级为摘要，当前事实原样保留。 */
export function filterContextObjects(objects: ContextObject[]): ContextObject[] {
  return objects
    .filter((object) => object.state !== "obsolete")
    .map((object) => object.state === "resolved" ? { ...object, content: `[resolved] ${object.content}` } : object)
}

export class ContextObjectCompiler {
  constructor(private readonly options: { maxTokens: number }) {}

  compile(objects: ContextObject[]): ContextObject[] {
    const candidates = filterContextObjects(objects).sort((a, b) => score(b) - score(a))
    let used = 0
    const selected: ContextObject[] = []
    for (const object of candidates) {
      const cost = estimateTokens(object.content)
      if (used + cost > this.options.maxTokens) continue
      selected.push(object)
      used += cost
    }
    return selected
  }
}

function score(object: ContextObject): number {
  const evidenceBoost = object.kind === "test" && object.state === "active" ? 0.25 : 0
  return object.importance * 0.4 + object.relevance * 0.4 + object.freshness * 0.2 + evidenceBoost
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4))
}
