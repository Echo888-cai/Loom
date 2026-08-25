import { describe, expect, it } from "vitest"
import { DesktopApprovalGate } from "../../src/main/approval-gate.js"

const request = { command: "pnpm test", cwd: "/repo", timeoutMs: 120_000, reason: "Verify the fix" }

describe("DesktopApprovalGate", () => {
  it("holds one pending request and resolves it when the user allows it", async () => {
    const gate = new DesktopApprovalGate("task-1")
    const pending = gate.request(request)

    expect(gate.pendingRequest).toEqual(request)
    gate.resolve("allow")

    await expect(pending).resolves.toBe("allow")
    expect(gate.pendingRequest).toBeUndefined()
  })

  it("rejects a second concurrent request for the same task", async () => {
    const gate = new DesktopApprovalGate("task-1")
    const pending = gate.request(request)

    await expect(gate.request({ ...request, command: "pnpm lint" })).rejects.toThrow("already awaiting approval")

    gate.resolve("deny")
    await expect(pending).resolves.toBe("deny")
  })

  it("denies an outstanding request when the owning window is disposed", async () => {
    const gate = new DesktopApprovalGate("task-1")
    const pending = gate.request(request)

    gate.dispose()

    await expect(pending).resolves.toBe("deny")
  })
})
