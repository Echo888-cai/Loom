import { describe, expect, it } from "vitest"
import { ExecaCommandRunner } from "../../src/process/runner.js"

describe("ExecaCommandRunner", () => {
  const runner = new ExecaCommandRunner()

  it("captures stdout and exit code", async () => {
    const result = await runner.run({ command: "printf 'hello'", cwd: process.cwd(), timeoutMs: 1_000, signal: new AbortController().signal, env: {} })

    expect(result).toMatchObject({ stdout: "hello", stderr: "", exitCode: 0, timedOut: false })
  })

  it("captures a non-zero exit code", async () => {
    const result = await runner.run({ command: "printf 'bad' >&2; exit 3", cwd: process.cwd(), timeoutMs: 1_000, signal: new AbortController().signal, env: {} })

    expect(result).toMatchObject({ stderr: "bad", exitCode: 3, timedOut: false })
  })

  it("reports timeout", async () => {
    const result = await runner.run({ command: "sleep 1", cwd: process.cwd(), timeoutMs: 20, signal: new AbortController().signal, env: {} })

    expect(result.timedOut).toBe(true)
  })

  it("honors AbortSignal cancellation", async () => {
    const controller = new AbortController()
    const promise = runner.run({ command: "sleep 1", cwd: process.cwd(), timeoutMs: 5_000, signal: controller.signal, env: {} })
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: "AbortError" })
  })
})
