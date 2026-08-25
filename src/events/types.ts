/**
 * 一条不可变运行事件。
 *
 * 四问：
 * - 输入：事件序号、时间、任务 ID、事件类型和业务数据 `T`。
 * - 外部副作用：类型本身没有副作用，它只是数据契约。
 * - 失败方式：类型无法在运行时阻止错误数据，真正写入时由 EventStore 校验/序列化。
 * - 测试位置：事件结构由 `tests/events/store.test.ts` 间接验证。
 */
// 事件是 Loom 的事实记录：发生过什么，就追加一条，而不是修改旧记录。
// T 是事件数据的泛型，例如 model_called 和 tool_result 可以有不同 data 结构。
export type EventRecord<T = unknown> = {
  seq: number
  timestamp: string
  taskId: string
  type: string
  data: T
}

/**
 * 事件存储抽象。
 *
 * 四问：
 * - 输入：任务 ID、事件类型和任意可序列化 data；读取时只需要任务 ID。
 * - 外部副作用：接口本身没有副作用，具体实现决定是否写磁盘或数据库。
 * - 失败方式：Promise 可以 reject，例如磁盘不可写或事件损坏。
 * - 测试位置：当前实现由 `tests/events/store.test.ts` 验证；接口让未来替换 SQLite 成为可能。
 */
// Agent Loop 不直接依赖文件系统，只依赖这个抽象接口。
// 将来可以把 FileEventStore 换成 SQLite 或数据库，而不改 Agent Loop。
export interface EventStore {
  append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>>
  readAll(taskId: string): Promise<EventRecord[]>
}
