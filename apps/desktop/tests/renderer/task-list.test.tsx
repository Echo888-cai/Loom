// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TaskList } from "../../src/renderer/src/features/explorer/TaskList.js"

afterEach(cleanup)

describe("TaskList", () => {
  it("selects a durable task by its goal without adding status badges", () => {
    const onSelect = vi.fn()
    render(<TaskList tasks={[{ taskId: "task-1", goal: "Fix authentication", status: "verified", timestamp: "2026-08-25T08:01:00.000Z" }]} activeTaskId={null} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "Fix authentication" }))

    expect(onSelect).toHaveBeenCalledWith("task-1")
    expect(screen.queryByText("verified")).toBeNull()
  })
})
