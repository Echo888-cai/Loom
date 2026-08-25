import type { EventRecord, EventStore } from "./types.js"

export type EventSubscriber = (event: EventRecord) => void
export type SubscriberErrorHandler = (error: Error) => void

export class StreamingEventStore implements EventStore {
  private readonly subscribers = new Set<EventSubscriber>()

  constructor(
    private readonly inner: EventStore,
    private readonly onSubscriberError?: SubscriberErrorHandler,
  ) {}

  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  async append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>> {
    const event = await this.inner.append(taskId, type, data)
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event)
      } catch (error: unknown) {
        this.onSubscriberError?.(asError(error))
      }
    }
    return event
  }

  readAll(taskId: string): Promise<EventRecord[]> {
    return this.inner.readAll(taskId)
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
