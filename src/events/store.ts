import { appendFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { EventRecord, EventStore } from "./types.js"

export class FileEventStore implements EventStore {
  constructor(private readonly root: string) {}

  async append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>> {
    const eventsPath = this.eventsPath(taskId)
    await mkdir(join(this.root, ".loom", "runs", taskId), { recursive: true })
    const existing = await this.readLines(eventsPath)
    const event: EventRecord<T> = {
      seq: existing.length + 1,
      timestamp: new Date().toISOString(),
      taskId,
      type,
      data,
    }
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf8")
    return event
  }

  async readAll(taskId: string): Promise<EventRecord[]> {
    const lines = await this.readLines(this.eventsPath(taskId))
    return lines.map((line) => {
      try {
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

  private eventsPath(taskId: string): string {
    return join(this.root, ".loom", "runs", taskId, "events.jsonl")
  }

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

function isEventRecord(value: unknown): value is EventRecord {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.seq === "number"
    && typeof record.timestamp === "string"
    && typeof record.taskId === "string"
    && typeof record.type === "string"
    && "data" in record
}
