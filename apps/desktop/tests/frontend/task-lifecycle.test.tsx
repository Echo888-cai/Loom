// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NewTaskComposer } from "../../src/frontend/src/features/task/NewTaskComposer.js"
import { TaskControls } from "../../src/frontend/src/features/task/TaskControls.js"
import { subscribeToTaskEvents } from "../../src/frontend/src/App.js"

afterEach(cleanup)

describe("NewTaskComposer", () => {
  it("starts a non-empty task with Command+Enter", async () => {
    const startTask = vi.fn().mockResolvedValue({ taskId: "task-1" })
    Object.defineProperty(window, "loom", { configurable: true, value: { startTask } })
    const onStarted = vi.fn()
    render(<NewTaskComposer workspaceRoot="/repo" onStarted={onStarted} />)
    const input = screen.getByLabelText("New task")
    fireEvent.change(input, { target: { value: "Fix the authentication regression" } })
    fireEvent.keyDown(input, { key: "Enter", metaKey: true })

    await waitFor(() => expect(startTask).toHaveBeenCalledWith({ workspaceRoot: "/repo", goal: "Fix the authentication regression" }))
    expect(onStarted).toHaveBeenCalledWith("task-1")
  })

  it("keeps the goal and shows a safe inline failure when task start is rejected", async () => {
    const startTask = vi.fn().mockRejectedValue(new Error("DeepSeek rejected sk-secret-key"))
    Object.defineProperty(window, "loom", { configurable: true, value: { startTask } })
    render(<NewTaskComposer workspaceRoot="/repo" onStarted={vi.fn()} />)
    const input = screen.getByLabelText("New task")
    fireEvent.change(input, { target: { value: "Fix the authentication regression" } })
    fireEvent.submit(input.closest("form")!)

    expect((await screen.findByRole("alert")).textContent).toBe("Unable to start task.")
    expect((screen.getByLabelText("New task") as HTMLTextAreaElement).value).toBe("Fix the authentication regression")
    expect(document.body.textContent).not.toContain("sk-secret-key")
  })

  it("cancels the active task only once", async () => {
    const cancelTask = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, "loom", { configurable: true, value: { cancelTask } })
    render(<TaskControls taskId="task-1" status="running" />)

    fireEvent.click(screen.getByRole("button", { name: "Cancel current task" }))

    await waitFor(() => expect(cancelTask).toHaveBeenCalledWith("task-1"))
    expect(cancelTask).toHaveBeenCalledTimes(1)
  })

  it("merges streamed durable events through one renderer subscription", () => {
    const unsubscribe = vi.fn()
    let listener: ((envelope: { event: { taskId: string; seq: number; timestamp: string; type: string; data: {} } }) => void) | undefined
    const onTaskEvent = vi.fn((nextListener) => { listener = nextListener; return unsubscribe })
    Object.defineProperty(window, "loom", { configurable: true, value: { onTaskEvent } })
    const appendEvent = vi.fn()

    const cleanupSubscription = subscribeToTaskEvents(appendEvent)
    listener?.({ event: { taskId: "task-1", seq: 1, timestamp: "2026-08-25T00:00:00.000Z", type: "task.created", data: {} } })

    expect(onTaskEvent).toHaveBeenCalledTimes(1)
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-1", type: "task.created" }))
    cleanupSubscription?.()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
