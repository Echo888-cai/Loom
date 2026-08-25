// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppShell } from "../../src/renderer/src/features/shell/AppShell.js"

beforeEach(() => {
  cleanup()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("AppShell", () => {
  it("keeps code as the primary accessible workspace and starts the Agent Console at 365px", () => {
    render(<AppShell />)

    expect(screen.getByRole("main", { name: "Code workspace" })).toBeTruthy()
    expect(screen.getByRole("complementary", { name: "Agent Console" }).style.width).toBe("365px")
  })

  it("opens a repository through the narrow desktop API and loads its tree", async () => {
    const chooseWorkspace = vi.fn().mockResolvedValue({ root: "/repo", name: "repo" })
    const listWorkspace = vi.fn().mockResolvedValue([{ name: "src", relativePath: "src", kind: "directory", children: [] }])
    Object.defineProperty(window, "loom", { configurable: true, value: { chooseWorkspace, listWorkspace } })
    render(<AppShell />)

    fireEvent.click(screen.getByRole("button", { name: "Open repository" }))

    await waitFor(() => expect(listWorkspace).toHaveBeenCalledWith("/repo"))
    expect(screen.getByRole("treeitem", { name: "src" })).toBeTruthy()
  })

  it("clamps keyboard panel resizing and lets a keyboard user collapse and restore the console", () => {
    render(<AppShell />)
    const divider = screen.getByRole("separator", { name: "Resize Agent Console" })

    for (let index = 0; index < 20; index += 1) fireEvent.keyDown(divider, { key: "ArrowLeft" })
    expect(screen.getByRole("complementary", { name: "Agent Console" }).style.width).toBe("520px")
    fireEvent.click(screen.getByRole("button", { name: "Collapse Agent Console" }))
    expect(screen.queryByRole("complementary", { name: "Agent Console" })).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: "Restore Agent Console" }), { key: "Enter" })
    expect(screen.getByRole("complementary", { name: "Agent Console" }).style.width).toBe("520px")
  })

  it("resizes the Agent Console with the pointer divider", () => {
    render(<AppShell />)
    const divider = screen.getByRole("separator", { name: "Resize Agent Console" })

    fireEvent.pointerDown(divider, { clientX: 500 })
    fireEvent.pointerMove(window, { clientX: 440 })
    fireEvent.pointerUp(window)

    expect(screen.getByRole("complementary", { name: "Agent Console" }).style.width).toBe("425px")
  })

  it("replaces the workbench below its minimum useful width", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(720)
    render(<AppShell />)

    expect(screen.getByText("Loom needs a wider window to work comfortably.")).toBeTruthy()
    expect(screen.queryByRole("main", { name: "Code workspace" })).toBeNull()
  })
})
