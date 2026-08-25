import { ZodError } from "zod"
import { describe, expect, it } from "vitest"
import {
  ApprovalDecisionInputSchema,
  EventEnvelopeSchema,
  FileTreeSchema,
  ReadFileInputSchema,
  ResumeTaskInputSchema,
  StartTaskInputSchema,
} from "../../src/shared/contracts.js"

describe("desktop IPC contracts", () => {
  it("rejects a workspace path that is not absolute", () => {
    expect(() => StartTaskInputSchema.parse({ workspaceRoot: "relative", goal: "Fix it" })).toThrow(ZodError)
  })

  it("rejects an empty task goal", () => {
    expect(() => StartTaskInputSchema.parse({ workspaceRoot: "/repo", goal: "  " })).toThrow(ZodError)
  })

  it("rejects malformed task IDs and unsupported approval decisions", () => {
    expect(() => ApprovalDecisionInputSchema.parse({ taskId: "bad/id", decision: "always" })).toThrow(ZodError)
  })

  it("accepts a complete persisted event envelope", () => {
    const validPersistedEvent = {
      taskId: "task-1",
      event: {
        seq: 1,
        timestamp: "2026-08-25T08:00:00.000Z",
        taskId: "task-1",
        type: "task.created",
        data: { goal: "Fix authentication" },
      },
    }

    expect(EventEnvelopeSchema.parse(validPersistedEvent)).toEqual(validPersistedEvent)
  })

  it("rejects file paths that can escape the workspace", () => {
    expect(() => ReadFileInputSchema.parse({ workspaceRoot: "/repo", relativePath: "/etc/hosts" })).toThrow(ZodError)
    expect(() => ReadFileInputSchema.parse({ workspaceRoot: "/repo", relativePath: "../secret.txt" })).toThrow(ZodError)
  })

  it("requires the envelope and persisted event to name the same task", () => {
    expect(() => EventEnvelopeSchema.parse({
      taskId: "task-2",
      event: {
        seq: 1,
        timestamp: "2026-08-25T08:00:00.000Z",
        taskId: "task-1",
        type: "task.created",
        data: {},
      },
    })).toThrow(ZodError)
  })

  it("rejects persisted events whose data field is missing", () => {
    expect(() => EventEnvelopeSchema.parse({
      taskId: "task-1",
      event: {
        seq: 1,
        timestamp: "2026-08-25T08:00:00.000Z",
        taskId: "task-1",
        type: "task.created",
      },
    })).toThrow(ZodError)
  })

  it("accepts recursive file trees and valid resume inputs", () => {
    const tree = [{
      name: "src",
      relativePath: "src",
      kind: "directory" as const,
      children: [{ name: "index.ts", relativePath: "src/index.ts", kind: "file" as const }],
    }]

    expect(FileTreeSchema.parse(tree)).toEqual(tree)
    expect(ResumeTaskInputSchema.parse({ workspaceRoot: "/repo", taskId: "task-1" })).toEqual({
      workspaceRoot: "/repo",
      taskId: "task-1",
    })
  })
})
