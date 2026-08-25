import { mkdir, mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createShellTool } from "../../src/tools/shell.js"
import type { ApprovalGate, ApprovalRequest } from "../../src/safety/approval.js"
import type { CommandRunner } from "../../src/process/runner.js"
import type { ToolContext } from "../../src/tools/types.js"

class FakeApproval implements ApprovalGate {
  readonly requests: ApprovalRequest[] = []
  constructor(private readonly decision: "allow" | "deny") {}
  async request(input: ApprovalRequest) { this.requests.push(input); return this.decision }
}

class FakeRunner implements CommandRunner {
  readonly inputs: Array<{ command: string; env: NodeJS.ProcessEnv }> = []
  constructor(private readonly result: { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; durationMs: number }) {}
  async run(input: { command: string; cwd: string; timeoutMs: number; signal: AbortSignal; env: NodeJS.ProcessEnv }) {
    this.inputs.push({ command: input.command, env: input.env })
    return this.result
  }
}

async function context(root: string, approvalGate: ApprovalGate, commandRunner: CommandRunner): Promise<ToolContext> {
  const rawDir = join(root, "raw")
  await mkdir(rawDir, { recursive: true })
  return { workspaceRoot: root, taskId: "task-shell", signal: new AbortController().signal, maxOutputChars: 30, rawDir, approvalGate, commandRunner }
}

describe("shell", () => {
  it("does not start a process when approval is denied", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-shell-"))
    const runner = new FakeRunner({ stdout: "", stderr: "", exitCode: 0, timedOut: false, durationMs: 1 })
    const result = await createShellTool().execute(await context(root, new FakeApproval("deny"), runner), { command: "touch forbidden", reason: "test" })

    expect(result).toMatchObject({ ok: false })
    expect(result.content).toContain("denied")
    expect(runner.inputs).toHaveLength(0)
  })

  it("runs an approved command, removes the API key, and stores raw output", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-shell-"))
    const runner = new FakeRunner({ stdout: "all tests passed", stderr: "", exitCode: 0, timedOut: false, durationMs: 12 })
    const result = await createShellTool().execute(await context(root, new FakeApproval("allow"), runner), { command: "pnpm test", timeoutMs: 500 })

    expect(result.ok).toBe(true)
    expect(result.content).toContain("all tests")
    expect(runner.inputs[0]?.env.DEEPSEEK_API_KEY).toBeUndefined()
    expect(result.rawRef).toBeDefined()
    await expect(readFile(result.rawRef as string, "utf8")).resolves.toContain("all tests passed")
  })

  it("returns a failed result for a timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-shell-"))
    const runner = new FakeRunner({ stdout: "partial", stderr: "", exitCode: null, timedOut: true, durationMs: 500 })
    const result = await createShellTool().execute(await context(root, new FakeApproval("allow"), runner), { command: "sleep 10" })

    expect(result).toMatchObject({ ok: false, metadata: { timedOut: true } })
  })
})
