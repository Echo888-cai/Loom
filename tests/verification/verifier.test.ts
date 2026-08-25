import { describe, expect, it } from "vitest"
import type { CommandRunner } from "../../src/process/runner.js"
import { CommandVerifier } from "../../src/verification/verifier.js"

class FakeRunner implements CommandRunner {
  readonly commands: string[] = []
  private index = 0
  constructor(private readonly results: Array<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; durationMs: number }>) {}
  async run(input: { command: string; cwd: string; timeoutMs: number; signal: AbortSignal; env: NodeJS.ProcessEnv }) {
    this.commands.push(input.command)
    const result = this.results[this.index]
    this.index += 1
    if (!result) throw new Error("FakeRunner ran out of results")
    return result
  }
}

const input = { taskId: "task-verify", workspaceRoot: "/tmp/repo", filesChanged: ["src/a.ts"], constraints: [] }
const passed = { stdout: "ok", stderr: "", exitCode: 0, timedOut: false, durationMs: 1 }

describe("CommandVerifier", () => {
  it("returns continue when git diff check fails", async () => {
    const runner = new FakeRunner([{ stdout: "", stderr: "whitespace error", exitCode: 2, timedOut: false, durationMs: 1 }])

    const result = await new CommandVerifier([], runner).verify(input)

    expect(result.status).toBe("continue")
    expect(result.checks[0]).toMatchObject({ name: "git diff --check", passed: false, exitCode: 2 })
    expect(result.evidence.join("\n")).toContain("whitespace error")
    expect(runner.commands).toEqual(["git diff --check"])
  })

  it("returns verified when diff and configured commands pass", async () => {
    const runner = new FakeRunner([passed, passed])

    const result = await new CommandVerifier(["pnpm test"], runner).verify(input)

    expect(result.status).toBe("verified")
    expect(result.checks).toHaveLength(2)
    expect(result.checks.every((check) => check.passed)).toBe(true)
    expect(runner.commands).toEqual(["git diff --check", "pnpm test"])
  })

  it("blocks when no verification commands are configured", async () => {
    const result = await new CommandVerifier([], new FakeRunner([passed])).verify(input)

    expect(result.status).toBe("blocked")
    expect(result.evidence.join("\n")).toContain("No verification commands configured")
  })

  it("returns continue when a configured command times out", async () => {
    const runner = new FakeRunner([passed, { stdout: "partial", stderr: "", exitCode: null, timedOut: true, durationMs: 500 }])

    const result = await new CommandVerifier(["pnpm test"], runner).verify(input)

    expect(result.status).toBe("continue")
    expect(result.checks[1]).toMatchObject({ name: "pnpm test", passed: false })
    expect(result.evidence.join("\n")).toContain("timed out")
  })
})
