// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { FileNode } from "../../src/shared/contracts.js"
import { FileTree } from "../../src/renderer/src/features/explorer/FileTree.js"

const tree: FileNode[] = [{ name: "src", relativePath: "src", kind: "directory", children: [{ name: "auth.ts", relativePath: "src/auth.ts", kind: "file" }] }]

afterEach(cleanup)

describe("FileTree", () => {
  it("opens a file once through click or keyboard while directories remain navigable", () => {
    const openFile = vi.fn()
    render(<FileTree nodes={tree} onOpenFile={openFile} />)

    const directory = screen.getByRole("treeitem", { name: "src" })
    fireEvent.keyDown(directory, { key: "ArrowRight" })
    const file = screen.getByRole("treeitem", { name: "auth.ts" })
    fireEvent.keyDown(file, { key: "Enter" })
    fireEvent.click(file)

    expect(openFile).toHaveBeenCalledWith("src/auth.ts")
    expect(openFile).toHaveBeenCalledTimes(2)
  })
})
