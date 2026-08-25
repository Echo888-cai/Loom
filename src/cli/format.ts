import type { EventRecord } from "../events/types.js"
import type { RunResult } from "../agent/loop.js"

export function formatRunResult(result: RunResult): string {
  return [`Task: ${result.taskId}`, `Status: ${result.status}`, `Steps: ${result.steps}`, `Model calls: ${result.modelCalls}`, `Tool calls: ${result.toolCalls}`].join("\n")
}

export function formatEvents(events: EventRecord[]): string {
  return events.map((event) => `${event.seq}\t${event.type}\t${event.timestamp}`).join("\n")
}
