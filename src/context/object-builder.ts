import type { EventRecord } from "../events/types.js"
import type { ContextObject } from "./types.js"

/** 从不可变事件重建当前 Context；事件不修改，生命周期只在投影结果中体现。 */
export function buildContextObjects(events: EventRecord[]): ContextObject[] {
  const objects: ContextObject[] = []
  for (const event of events) {
    const data = asRecord(event.data)
    if (event.type === "tool.completed" && data.name === "read_file" && typeof data.content === "string") {
      const path = String(data.path ?? "file")
      const toolKey = typeof data.id === "string" ? `tool:${data.id}` : undefined
      objects.push({ id: `tool-${event.seq}`, kind: "code", content: `${path}\n${data.content}`, state: "active", importance: 0.8, relevance: 0.8, freshness: 1, sourceKey: `file:${path}`, relatedTo: toolKey ? [toolKey] : [] })
    }
    if (event.type === "file.changed" && typeof data.path === "string") {
      const sourceKey = `file:${data.path}`
      for (const object of objects) if (object.sourceKey === sourceKey) object.state = "obsolete"
      const relatedTo = objects.filter((object) => object.sourceKey === sourceKey && object.relatedTo?.length).flatMap((object) => object.relatedTo ?? [])
      objects.push({ id: `file-${event.seq}`, kind: "diff", content: `changed: ${data.path}`, state: "active", importance: 0.9, relevance: 0.9, freshness: 1, sourceKey, relatedTo })
    }
    if (event.type === "verification.completed" && typeof data.name === "string") {
      const output = typeof data.output === "string" ? data.output : ""
      objects.push({ id: `verification-${event.seq}`, kind: "test", content: `${data.name}\n${output}`, state: "active", importance: data.passed === true ? 0.8 : 1, relevance: 1, freshness: 1, sourceKey: `test:${data.name}` })
    }
  }
  return objects
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
}
