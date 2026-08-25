// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CodeWorkspace } from "../../src/renderer/src/features/code/CodeWorkspace.js"

vi.mock("@monaco-editor/react", () => ({
  default: (props: Record<string, unknown>) => <pre data-testid="editor">{JSON.stringify({ value: props.value, options: props.options })}</pre>,
}))

afterEach(cleanup)

describe("CodeWorkspace", () => {
  it("reads an active workspace file once and renders it read-only", async () => {
    const readFile = vi.fn().mockResolvedValue({ relativePath: "src/auth.ts", content: "export const auth = true\n" })
    Object.defineProperty(window, "loom", { configurable: true, value: { readFile } })
    render(<CodeWorkspace workspaceRoot="/repo" activePath="src/auth.ts" />)

    await waitFor(() => expect(readFile).toHaveBeenCalledWith({ workspaceRoot: "/repo", relativePath: "src/auth.ts" }))
    await waitFor(() => expect(screen.getByTestId("editor").textContent).toContain("export const auth = true"))
  })

  it("renders only the persisted unified patch as a read-only diff", () => {
    render(<CodeWorkspace workspaceRoot="/repo" activePath="src/auth.ts" diff={'@@ -1 +1 @@\n-old\n+new'} />)

    expect(screen.getByTestId("editor").textContent).toContain('"readOnly":true')
    expect(screen.getByTestId("editor").textContent).toContain('"minimap":{"enabled":false}')
    expect(screen.getByTestId("editor").textContent).toContain("@@ -1 +1 @@")
  })
})
