// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApprovalSurface } from "../../src/frontend/src/features/agent/ApprovalSurface.js"

afterEach(cleanup)

describe("ApprovalSurface", () => {
  it("allows exactly once by keyboard while focused", async () => {
    const resolveApproval = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, "loom", { configurable: true, value: { resolveApproval } })
    render(<ApprovalSurface taskId="task-1" approval={{ command: "pnpm test", cwd: "/repo", timeoutMs: 120_000, reason: "Verify" }} />)

    fireEvent.keyDown(screen.getByRole("region", { name: "Command approval" }), { key: "Enter" })

    await waitFor(() => expect(resolveApproval).toHaveBeenCalledWith({ taskId: "task-1", decision: "allow" }))
    expect(resolveApproval).toHaveBeenCalledTimes(1)
  })
})
