// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AgentConsole } from "../../src/renderer/src/features/agent/AgentConsole.js"

afterEach(cleanup)

describe("AgentConsole", () => {
  it("renders provider reasoning verbatim and shows a compact thinking state without inventing reasoning", () => {
    const { rerender } = render(<AgentConsole events={[event(1, "model.responded", { content: "Inspecting", reasoningContent: "The token refresh order is wrong.", toolCalls: [] })]} />)
    expect(screen.getByText("The token refresh order is wrong.")).toBeTruthy()

    rerender(<AgentConsole events={[event(2, "model.requested", { call: 2 })]} />)
    expect(screen.getByText("Thinking")).toBeTruthy()
    expect(document.body.textContent).not.toContain("The token refresh order is wrong.")
  })
})

function event(seq: number, type: string, data: Record<string, unknown>) {
  return { seq, timestamp: "2026-08-25T08:00:00.000Z", taskId: "task-1", type, data }
}
