// 事件是 Loom 的事实记录：发生过什么，就追加一条，而不是修改旧记录。
// T 是事件数据的泛型，例如 model_called 和 tool_result 可以有不同 data 结构。
export type EventRecord<T = unknown> = {
  seq: number
  timestamp: string
  taskId: string
  type: string
  data: T
}

// Agent Loop 不直接依赖文件系统，只依赖这个抽象接口。
// 将来可以把 FileEventStore 换成 SQLite 或数据库，而不改 Agent Loop。
export interface EventStore {
  append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>>
  readAll(taskId: string): Promise<EventRecord[]>
}
