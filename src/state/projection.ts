import type { EventRecord } from "../events/types.js"
import type { ModelMessage } from "../model/types.js"
import type { RunResult } from "../agent/loop.js"

export type ResumeState = {
  taskId: string
  goal: string
  messages: ModelMessage[]
  status: "running" | "candidate_done" | "verified" | "blocked" | "failed" | "cancelled" | "continue"
  modelCalls: number
  toolCalls: number
  changedFiles: string[]
  evidence: string[]
}

const systemMessage: ModelMessage = { role: "system", content: "You are Loom, a careful coding agent. Use tools to inspect the repository before making claims." }

export function projectRun(events: EventRecord[]): ResumeState {
  const first = events.find((event) => event.type === "task.created")
  const taskId = first?.taskId ?? ""
  const goal = readString(first?.data, "goal")
  const messages: ModelMessage[] = goal ? [systemMessage, { role: "user", content: goal }] : []
  let status: ResumeState["status"] = "running"
  let modelCalls = 0
  let toolCalls = 0
  const changedFiles: string[] = []
  let evidence: string[] = []

  for (const event of events) {
    if (event.type === "model.requested") modelCalls += 1
    if (event.type === "tool.requested") toolCalls += 1
    if (event.type === "model.responded") {
      const data = asRecord(event.data)
      const calls = Array.isArray(data.toolCalls) ? data.toolCalls.filter(isToolCall) : []
      messages.push({ role: "assistant", content: typeof data.content === "string" || data.content === null ? data.content : null, ...(calls.length ? { toolCalls: calls } : {}) })
    }
    if (event.type === "tool.completed") {
      const data = asRecord(event.data)
      if (typeof data.id === "string" && typeof data.content === "string") messages.push({ role: "tool", toolCallId: data.id, content: data.content })
    }
    if (event.type === "file.changed") {
      const path = readString(event.data, "path")
      if (path && !changedFiles.includes(path)) changedFiles.push(path)
    }
    if (event.type === "task.candidate_done") status = "candidate_done"
    if (event.type === "task.verified") { status = "verified"; evidence = readStrings(event.data, "evidence") }
    if (event.type === "task.verification_continue") { status = "continue"; evidence = readStrings(event.data, "evidence") }
    if (event.type === "task.blocked") status = "blocked"
    if (event.type === "task.failed") status = "failed"
    if (event.type === "task.cancelled") status = "cancelled"
  }
  return { taskId, goal, messages, status, modelCalls, toolCalls, changedFiles, evidence }
}

function asRecord(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null ? value as Record<string, unknown> : {} }
function readString(value: unknown, key: string): string { const result = asRecord(value)[key]; return typeof result === "string" ? result : "" }
function readStrings(value: unknown, key: string): string[] { const result = asRecord(value)[key]; return Array.isArray(result) ? result.filter((item): item is string => typeof item === "string") : [] }
function isToolCall(value: unknown): value is { id: string; name: string; argumentsJson: string } { const record = asRecord(value); return typeof record.id === "string" && typeof record.name === "string" && typeof record.argumentsJson === "string" }
