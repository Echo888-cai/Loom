// JSONL = 每行一个 JSON 对象。它比一个巨大的 JSON 数组更适合持续追加。
import { appendFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { EventRecord, EventStore } from "./types.js"

// v0.0 使用本地文件实现 EventStore，优点是简单、可检查、无需数据库服务。
export class FileEventStore implements EventStore {
  constructor(private readonly root: string) {}

  async append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>> {
    // 每个 task 有自己的事件文件，多个任务互不混淆。
    const eventsPath = this.eventsPath(taskId)
    await mkdir(join(this.root, ".loom", "runs", taskId), { recursive: true })
    // v0.0 用已有行数生成单调递增序号。后续可改为更强的并发安全方案。
    const existing = await this.readLines(eventsPath)
    const event: EventRecord<T> = {
      seq: existing.length + 1,
      timestamp: new Date().toISOString(),
      taskId,
      type,
      data,
    }
    // 只追加，不覆盖；这就是 append-only event log。
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf8")
    return event
  }

  async readAll(taskId: string): Promise<EventRecord[]> {
    // Resume 时读取全部事实，再由上层重建当前状态。
    const lines = await this.readLines(this.eventsPath(taskId))
    return lines.map((line) => {
      try {
        // 先解析成 unknown，再检查最小事件结构，避免把任意 JSON 当成事件。
        const parsed: unknown = JSON.parse(line)
        if (!isEventRecord(parsed)) {
          throw new Error("Event record has an invalid shape")
        }
        return parsed
      } catch (error: unknown) {
        throw new Error(`Invalid event log for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  }

  // 路径规则集中在这里，避免 append/read 使用不同目录。
  private eventsPath(taskId: string): string {
    return join(this.root, ".loom", "runs", taskId, "events.jsonl")
  }

  // 文件不存在代表新任务还没有事件，不是错误。
  private async readLines(path: string): Promise<string[]> {
    try {
      const content = await readFile(path, "utf8")
      return content.split("\n").filter((line) => line.length > 0)
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return []
      }
      throw error
    }
  }
}

// TypeScript 的类型断言不能验证运行时数据，因此这里手工做最小 shape check。
function isEventRecord(value: unknown): value is EventRecord {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.seq === "number"
    && typeof record.timestamp === "string"
    && typeof record.taskId === "string"
    && typeof record.type === "string"
    && "data" in record
}
