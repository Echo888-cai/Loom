import { describe, expect, it } from "vitest"
import type { EventRecord } from "../../src/events/types.js"
import { projectRun } from "../../src/state/projection.js"

describe("projectRun", () => {
  it("rebuilds status, counters, messages, changed files, and evidence", () => {
    const events: EventRecord[] = [
      { seq: 1, timestamp: "t", taskId: "task-1", type: "task.created", data: { goal: "fix bug" } },
      { seq: 2, timestamp: "t", taskId: "task-1", type: "model.requested", data: {} },
      { seq: 3, timestamp: "t", taskId: "task-1", type: "model.responded", data: { content: null, toolCalls: [{ id: "c1", name: "edit_file", argumentsJson: "{}" }] } },
      { seq: 4, timestamp: "t", taskId: "task-1", type: "tool.requested", data: {} },
      { seq: 5, timestamp: "t", taskId: "task-1", type: "tool.completed", data: { id: "c1", content: "changed" } },
      { seq: 6, timestamp: "t", taskId: "task-1", type: "file.changed", data: { path: "src/a.ts" } },
      { seq: 7, timestamp: "t", taskId: "task-1", type: "task.verification_continue", data: { evidence: ["test failed"] } },
    ]

    const state = projectRun(events)

    expect(state).toMatchObject({ taskId: "task-1", goal: "fix bug", status: "continue", modelCalls: 1, toolCalls: 1, changedFiles: ["src/a.ts"], evidence: ["test failed"] })
    expect(state.messages.at(-1)).toEqual({ role: "tool", toolCallId: "c1", content: "changed" })
  })
})
