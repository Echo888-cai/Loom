// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TaskStateView } from "../../src/renderer/src/features/task/TaskStateView.js"

afterEach(cleanup)

describe("TaskStateView", () => {
  it("distinguishes a candidate from verified work without a decorative metric badge", () => {
    const { rerender } = render(<TaskStateView status="candidate_done" message="The implementation is ready." />)
    expect(screen.getByText("Awaiting verification")).toBeTruthy()
    expect(screen.getByText("The implementation is ready.")).toBeTruthy()

    rerender(<TaskStateView status="verified" message="Tests passed." />)
    expect(screen.getByText("Verified")).toBeTruthy()
    expect(screen.getByText("Tests passed.")).toBeTruthy()
  })
})
