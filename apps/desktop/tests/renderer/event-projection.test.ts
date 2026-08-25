import { describe, expect, it } from "vitest"
import { projectAgentConsole } from "../../src/renderer/src/state/event-projection.js"

describe("projectAgentConsole", () => {
  it("derives reasoning, completed work, verification evidence, and verified state from durable events", () => {
    const view = projectAgentConsole([
      event(1, "model.requested", { call: 1 }),
      event(2, "model.responded", { content: "I found the cause.", reasoningContent: "The refresh path returns early.", toolCalls: [] }),
      event(3, "tool.requested", { name: "read_file", argumentsJson: '{"path":"src/auth.ts"}' }),
      event(4, "tool.completed", { name: "read_file", ok: true, content: "export function refresh() {}" }),
      event(5, "verification.completed", { command: "pnpm test", ok: true, content: "All tests passed" }),
      event(6, "task.verified", { content: "Verified" }),
    ])

    expect(view.status).toBe("verified")
    expect(view.reasoning).toEqual([{ seq: 2, content: "The refresh path returns early." }])
    expect(view.done.map((item) => item.label)).toContain("read_file")
    expect(view.evidence).toEqual([{ label: "pnpm test", outcome: "passed", content: "All tests passed" }])
  })

  it("keeps an approval pending and does not break on unknown replayed events", () => {
    const view = projectAgentConsole([
      event(1, "unknown.future.event", { anything: true }),
      event(2, "approval.requested", { command: "pnpm test", cwd: "/repo", timeoutMs: 120_000, reason: "Verify" }),
    ])

    expect(view.status).toBe("approval_required")
    expect(view.pendingApproval).toMatchObject({ command: "pnpm test", cwd: "/repo" })
  })

  it("uses the verifier's persisted name and passed fields, and preserves a terminal failure reason", () => {
    const view = projectAgentConsole([
      event(1, "verification.completed", { name: "pnpm test", passed: false, output: "auth test failed" }),
      event(2, "task.failed", { phase: "model", error: "Provider unavailable" }),
    ])

    expect(view.evidence).toEqual([{ label: "pnpm test", outcome: "failed", content: "auth test failed" }])
    expect(view.status).toBe("failed")
    expect(view.statusMessage).toBe("Provider unavailable")
  })

  it("returns to running after verification asks the Agent to continue", () => {
    const view = projectAgentConsole([
      event(1, "verification.completed", { name: "pnpm test", passed: false, output: "auth test failed" }),
      event(2, "task.verification_continue", { evidence: ["auth test failed"] }),
      event(3, "model.requested", { call: 2 }),
    ])

    expect(view.status).toBe("running")
    expect(view.current).toEqual({ label: "Thinking" })
  })
})

function event(seq: number, type: string, data: Record<string, unknown>) {
  return { seq, timestamp: "2026-08-25T08:00:00.000Z", taskId: "task-1", type, data }
}
