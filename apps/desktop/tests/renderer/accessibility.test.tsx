// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../../src/renderer/src/App.js"

describe("Loom workbench accessibility", () => {
  it("gives icon controls names and omits noisy editor-status copy", () => {
    render(<App />)

    expect(screen.getByRole("button", { name: "Open repository" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Collapse Agent Console" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Connected|UTF-8|Ln |Col |TypeScript/)
  })
})

afterEach(cleanup)
