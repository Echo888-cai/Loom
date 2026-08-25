export type EventRecord<T = unknown> = {
  seq: number
  timestamp: string
  taskId: string
  type: string
  data: T
}

export interface EventStore {
  append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>>
  readAll(taskId: string): Promise<EventRecord[]>
}
