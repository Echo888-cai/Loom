import { describe, expect, it } from "vitest"
import { main, type CliRuntime } from "../../src/cli.js"

class FakeRuntime implements CliRuntime {
  async run() { return { taskId: "task-run", status: "candidate_done" as const, steps: 1, modelCalls: 1, toolCalls: 0 } }
  async resume() { return { taskId: "task-resume", status: "verified" as const, steps: 2, modelCalls: 1, toolCalls: 1 } }
  async replay() { return [{ seq: 1, timestamp: "t", taskId: "task-replay", type: "task.created", data: { goal: "x" } }] }
}

describe("CLI", () => {
  it("runs a goal and prints the result", async () => {
    const output: string[] = []
    const code = await main(["run", "fix", "the", "bug", "--cwd", "/tmp/repo"], new FakeRuntime(), { write: (line) => output.push(line) })

    expect(code).toBe(0)
    expect(output.join("\n")).toContain("task-run")
    expect(output.join("\n")).toContain("candidate_done")
  })

  it("supports resume and replay", async () => {
    const output: string[] = []
    const runtime = new FakeRuntime()

    expect(await main(["resume", "task-resume"], runtime, { write: (line) => output.push(line) })).toBe(0)
    expect(await main(["replay", "task-replay"], runtime, { write: (line) => output.push(line) })).toBe(0)
    expect(output.join("\n")).toContain("verified")
    expect(output.join("\n")).toContain("task.created")
  })
})
