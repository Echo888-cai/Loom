// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CommandPalette } from "../../src/frontend/src/features/shell/CommandPalette.js"

afterEach(cleanup)

describe("CommandPalette", () => {
  it("runs the selected action with Enter and closes with Escape", () => {
    const openRepository = vi.fn()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} commands={[{ id: "open", label: "Open Repository", run: openRepository }, { id: "new", label: "New Task", run: vi.fn() }]} />)

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Command palette" }), { key: "Enter" })
    expect(openRepository).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Command palette" }), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
