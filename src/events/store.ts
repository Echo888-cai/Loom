// JSONL = 每行一个 JSON 对象。它比一个巨大的 JSON 数组更适合持续追加。
import { appendFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { EventRecord, EventStore } from "./types.js"

/**
 * 使用 JSONL 文件保存任务事件的实现。
 *
 * 四问：
 * - 输入：workspace 根目录，以及 append 时的 taskId/type/data。
 * - 外部副作用：在 `.loom/runs/<taskId>/events.jsonl` 创建目录并追加文件内容。
 * - 失败方式：文件系统错误或 JSONL 中出现非法事件时 reject；不会静默跳过坏数据。
 * - 测试位置：`tests/events/store.test.ts` 验证追加顺序、读取内容和损坏记录处理。
 */
// v0.0 使用本地文件实现 EventStore，优点是简单、可检查、无需数据库服务。
export class FileEventStore implements EventStore {
  /**
   * 创建文件事件存储。
   *
   * 四问：
   * - 输入：workspace 根目录字符串。
   * - 外部副作用：构造函数不读写磁盘，只保存路径。
   * - 失败方式：构造阶段通常不失败，实际 I/O 错误发生在 append/readAll。
   * - 测试位置：由事件存储测试通过临时目录间接覆盖。
   */
  constructor(private readonly root: string) {}

  /**
   * 追加一条事件，并返回写入后的完整记录。
   *
   * 四问：
   * - 输入：任务 ID、事件类型和可序列化业务数据。
   * - 外部副作用：创建任务目录，向 JSONL 文件追加一行。
   * - 失败方式：目录创建、读取旧日志或追加写入失败时 reject。
   * - 测试位置：`tests/events/store.test.ts` 检查 seq 从 1 开始并按追加递增。
   */
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

  /**
   * 按文件顺序读取任务的全部事件。
   *
   * 四问：
   * - 输入：任务 ID。
   * - 外部副作用：读取文件；没有文件时返回空数组。
   * - 失败方式：JSON 语法错误或事件字段缺失时 reject，保护恢复逻辑不被坏数据污染。
   * - 测试位置：`tests/events/store.test.ts`。
   */
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

  /**
   * 读取并拆分 JSONL 文件。
   *
   * 四问：
   * - 输入：一个事件文件路径。
   * - 外部副作用：只读文件。
   * - 失败方式：不存在返回空数组；其他文件系统错误继续抛出。
   * - 测试位置：由 append/readAll 测试间接覆盖。
   */
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

/**
 * 检查未知 JSON 是否至少具备 EventRecord 的字段。
 *
 * 四问：
 * - 输入：JSON.parse 得到的 unknown。
 * - 外部副作用：无。
 * - 失败方式：返回 false，由 readAll 转成明确错误。
 * - 测试位置：损坏事件日志测试覆盖它的行为。
 */
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
